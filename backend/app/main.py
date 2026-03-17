import logging
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# ─── Sentry (optional — only initialises when SENTRY_DSN is set) ────────────
try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    _SENTRY_DSN = os.getenv("SENTRY_DSN", "")
    if _SENTRY_DSN:
        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            integrations=[StarletteIntegration(), FastApiIntegration()],
            traces_sample_rate=0.1,
            environment=os.getenv("ENVIRONMENT", "development"),
        )
except ImportError:
    pass  # sentry-sdk not installed — skip gracefully

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from .api.routes import router
from .core.config import settings
from .core.database import engine, Base
from .scheduler import start_scheduler
from .models.measurement import (  # noqa: F401 - ensures tables are created
    SpeedMeasurement, CommunityReport, OutageEvent,
    AlertConfig, AlertLog, UserPreferences, SecurityScan, Webhook,
    APIKey, UserLocation, SpeedChallenge,
    ISPContract, TestSchedule, PacketLossReading, DeviceGroup,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Security headers middleware ──────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds hardened HTTP security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"]  = "nosniff"
        response.headers["X-Frame-Options"]         = "DENY"
        response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"]      = (
            "camera=(), microphone=(), payment=(), geolocation=(self)"
        )
        if request.url.path.startswith("/api") or request.url.path == "/health":
            response.headers["Content-Security-Policy"] = "default-src 'none'"
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        response.headers["Server"] = "IST"
        response.headers.__delitem__("X-Powered-By") if "X-Powered-By" in response.headers else None
        return response


# ─── In-memory rate limiter ───────────────────────────────────────────────────

_rate_store: dict = defaultdict(list)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding-window rate limiter — no extra packages needed."""

    _RULES = {
        "/api/test-now":              (5,  60),   # 5 speed tests per minute
        "/api/reports":               (5,  60),   # 5 report submissions per minute
        "/api/measurements":          (3,  60),   # 3 delete calls per minute (admin-keyed anyway)
        "/api/my-connection":         (10, 60),   # 10 geo lookups per minute
        "/api/packet-loss/run":       (10, 60),   # 10 packet-loss tests per minute
        "/api/complaint-letter":      (10, 60),   # 10 letter generations per minute
        "/api/dns-test":              (20, 60),   # 20 DNS tests per minute
        "/api/devices/nearby":        (20, 60),   # 20 nearby scans per minute
        "default":                    (60, 60),   # 60 read requests per minute
    }

    # Clean up stale rate-limit buckets every ~5 minutes to prevent unbounded memory growth
    _last_cleanup: float = 0.0
    _CLEANUP_INTERVAL = 300  # seconds

    async def dispatch(self, request: Request, call_next):
        ip        = request.client.host if request.client else "unknown"
        client_id = request.headers.get("x-client-id", "")[:40]  # cap length
        path      = request.url.path.rstrip("/")
        limit, window = self._RULES.get(path, self._RULES["default"])
        now = time.time()

        # Check both IP-keyed and client-ID-keyed buckets
        keys = [f"ip:{ip}:{path}"]
        if client_id:
            keys.append(f"cid:{client_id}:{path}")

        # Periodic cleanup of stale buckets
        if now - RateLimitMiddleware._last_cleanup > RateLimitMiddleware._CLEANUP_INTERVAL:
            stale = [k for k, v in list(_rate_store.items()) if not v or now - v[-1] > 3600]
            for k in stale:
                del _rate_store[k]
            RateLimitMiddleware._last_cleanup = now

        for key in keys:
            bucket = _rate_store[key]
            bucket[:] = [t for t in bucket if now - t < window]
            if len(bucket) >= limit:
                logger.warning("Rate limit: %s (cid=%s) %s %s", ip, client_id or "-", request.method, path)
                return Response(
                    content='{"detail":"Too many requests — please slow down."}',
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": str(window), "X-RateLimit-Limit": str(limit)},
                )

        for key in keys:
            _rate_store[key].append(now)

        response = await call_next(request)
        remaining = max(0, limit - len(_rate_store[keys[0]]))
        response.headers["X-RateLimit-Limit"]     = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response


# ─── Request body size limiter ────────────────────────────────────────────────

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    MAX_BYTES = 64 * 1024  # 64 KB

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and int(cl) > self.MAX_BYTES:
            return Response(
                content='{"detail":"Request body too large."}',
                status_code=413,
                media_type="application/json",
            )
        return await call_next(request)


# ─── App lifecycle ────────────────────────────────────────────────────────────

def _run_migrations():
    """Add new columns to existing tables if they don't exist yet."""
    migrations = [
        "ALTER TABLE community_reports ADD COLUMN confirmations INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE community_reports ADD COLUMN rejections INTEGER NOT NULL DEFAULT 0",
        # Per-device data isolation — UUID sent as X-Client-ID from the browser
        "ALTER TABLE speed_measurements ADD COLUMN client_id TEXT",
    ]
    from sqlalchemy import text
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists — safe to skip


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    scheduler = start_scheduler()
    logger.info("Application started — env: %s", settings.ENVIRONMENT)
    yield
    scheduler.shutdown(wait=False)
    logger.info("Application stopped")


# ─── FastAPI app ──────────────────────────────────────────────────────────────

_is_prod = settings.ENVIRONMENT == "production"

_docs_url   = None if _is_prod else "/docs"
_redoc_url  = None if _is_prod else "/redoc"
_openapi_url = None if _is_prod else "/openapi.json"

app = FastAPI(
    title="Internet Stability Tracker API",
    description="""
## Internet Stability Tracker v3.3 — REST API

Community-driven network monitoring platform that measures internet speed,
detects outages, and visualises performance across ISPs.

**Live API**: https://backend-cold-butterfly-9535.fly.dev/api
**Frontend**: https://internet-stability-tracker.vercel.app
**WebSocket**: wss://backend-cold-butterfly-9535.fly.dev/api/ws/live
**Docs (Swagger)**: https://backend-cold-butterfly-9535.fly.dev/docs

### Core capabilities
- **Speed tests** — on-demand via `POST /api/test-now`; results stored in Turso (libSQL cloud)
- **Network Quality Score** — composite 0–100 score with letter grade (A+→F) and breakdown
- **Global Status** — platform-wide health (`healthy` / `degraded` / `outage`) + 7-day daily summary
- **Statistics** — aggregated uptime %, averages and outage counts over any time window
- **Timeline** — chronological event log grouped by date (outages, degradations, recoveries)
- **ISP reliability & rankings** — per-provider letter grades, weighted leaderboard scores
- **Outage confidence** — smart 0–100% confidence score for whether current state is a real outage
- **Outage events** — structured outage log with severity, duration and resolution status
- **Community reports** — crowd-sourced issue submissions with GPS coordinates, confirm/reject voting
- **Network Diagnostics** — live DNS + HTTP latency checks against 4 well-known targets
- **AI Insights** — statistical pattern analysis: congestion windows, speed trends, optimal hours

### New in v2.0
- **WebSocket feed** (`/api/ws/live`) — real-time measurement push, 10s heartbeat
- **Browser bandwidth probe** (`/api/bandwidth-probe`) — measures your actual connection speed
- **Congestion heatmap** (`/api/congestion-heatmap`) — 7×24 weekday/hour performance grid
- **Week-over-week comparison** (`/api/comparison`) — delta % vs previous 7 days
- **Anomaly detection** (`/api/anomalies`) — z-score outliers (±2σ threshold)
- **Traceroute** (`/api/traceroute`) — server-side path tracing (when available)
- **Multi-region latency** (`/api/multi-region`) — HTTP latency to 6 geographic regions
- **Shareable snapshots** (`POST /api/snapshots`) — generate a shareable report URL
- **Per-device isolation** — X-Client-ID header scopes all personal data per browser UUID
- **Sentry error tracking** — activates when `SENTRY_DSN` env var is set

### New in v2.1 (ML & Security)
- **ML Predictions** (`/api/predictions/*`) — speed forecasts, outage probability, best download times, 24h congestion
- **Smart Alerts** (`/api/alerts/config`) — multi-channel: Telegram, Discord, SMS (Twilio), custom thresholds, quiet hours
- **Advanced Diagnostics** (`/api/diagnostics/*`) — packet loss, jitter, bufferbloat, MTU, DNS leak, VPN speed
- **Network Security** (`/api/security/*`) — port scan, privacy score (secure DNS check), VPN recommendations
- **Historical Visualization** (`/api/history/*`) — heatmap calendar, distribution, percentiles, correlation, timeline
- **Enhanced AI Insights** (`/api/insights/*`) — root cause analysis, predictive maintenance, anomaly detection, NL chatbot

### New in v3.1 (Webhooks, Monitoring & Fixes)
- **Alert log** (`GET /api/alerts/log`) — per-device alert delivery history (channel, severity, success/failure)
- **Custom Webhooks** (`/api/webhooks`) — CRUD + test; receive JSON payloads on `outage`, `speed_drop`, `recovery`
- **Prometheus metrics** (`GET /api/metrics`) — plain-text Prometheus endpoint for Grafana scraping
- **In-memory cache fallback** — all cached endpoints work without Redis (auto-fallback with TTL eviction)
- **My Connection isolation** — `/api/my-connection` strictly scoped to requesting device (`X-Client-ID`)

### New in v3.2 (ISP Tools, ML & AI)
- **ISP SLA Tracker** (`GET /api/sla/analyze`) — compares actual vs promised speeds; grades A–F; 80% threshold
- **Throttle Detector** (`GET /api/throttle/detect`) — async multi-CDN probe (Cloudflare, jsDelivr, Google CDN, Fastly)
- **Network Health Score** (`GET /api/health-score`) — composite 0–100 score with grade and tips (dl 25%, ul 20%, ping 25%, stability 15%, uptime 15%)
- **Weekly Report** (`GET /api/reports/weekly`) — natural-language week-over-week summary with best/worst hours
- **Cost Calculator** (`GET /api/cost-calculator`) — cost per Mbps vs US/global averages; efficiency verdict
- **Before/After Comparison** (`GET /api/comparison/before-after`) — delta % between any two date ranges
- **Speed Leaderboard** (`GET/POST /api/leaderboard`) — community best-speed rankings with submit
- **Data Export** (`GET /api/export/csv`, `/api/export/json`) — full measurement history download
- **Developer API Keys** (`GET/POST/DELETE /api/api-keys`) — SHA-256 hashed keys; raw shown once; max 5
- **ISP Report Card** (`GET /api/isp-report-card`) — per-ISP grades across download/upload/ping/uptime
- **Slack/Teams Integration** (`POST /api/integrations/test-webhook`) — test Incoming Webhooks for both platforms
- **scikit-learn LinearRegression** in predictions — trend-based slope + R² feeds confidence scoring
- **Day-of-week weighted predictions** — weekday vs weekend patterns used for next-hour forecasts
- **predicted_ping** added to next-hour prediction response
- **"70% chance of slowdown at 8 PM"** style natural-language messages on every ML prediction
- **Congestion notable_periods** — `"Evening congestion (7 PM–11 PM) — 35% slower than baseline"`
- **Prediction summary** (`GET /api/predictions/summary`) — single endpoint, all four predictions + headline
- **AI chatbot — 20+ specific query paths**: upload, download, compare, trend, gaming, video calls, streaming,
  greeting (hi/hello), ISP, router, best time to use, outage, ping, speed overview, weekly summary, health report
- **Cold-start protection** — `min_machines_running=1` + `auto_stop_machines=suspend` on Fly.io keeps one machine warm

### New in v3.3 (Smart Tools & Multi-Device)
- **ISP Contract Tracker** (`GET/POST /api/contract`, `GET /api/contract/compliance`) — save your plan details, track promised vs actual speeds with SLA compliance verdict
- **Network Quality Certificate** (`GET /api/certificate`) — printable A+→F certificate with per-metric breakdown
- **Best Time Recommender** (`GET /api/best-time`) — 24-hour speed profile; best window, worst hour, and activity-aware suggestions
- **Multi-Device Aggregator** (`GET/POST/DELETE /api/devices/*`) — link devices via deterministic WiFi network code (public IP–based, no Bluetooth); QR + 6-char code sharing; cross-device performance comparison
- **DNS Monitor** (`GET /api/dns-test`) — per-resolver latency with pass/fail verdict
- **ISP Complaint Letter Generator** (`GET /api/complaint-letter`) — auto-generates a formal letter from your measured data with severity assessment and evidence list
- **Scheduled Speed Tests** (`GET/POST/PUT/DELETE /api/schedules`) — configure recurring tests by hour-of-day and day-of-week; burst support (1–5 tests per trigger)
- **Packet Loss & Jitter Monitor** (`POST /api/packet-loss/run`, `GET /api/packet-loss/history`) — TCP-based packet loss + jitter measurement with graded history
- **Work-From-Home Score** (`GET /api/wfh-score`) — evaluates your connection for 8 WFH apps (Zoom, Slack, Teams…) with pass/warn/fail per app
- **Neighborhood Outage Map** (`GET /api/neighborhood-outages`) — community reports filtered by proximity
- **Browser extension v1.2** — live speed badge, sparkline chart, history panel, health score, throttle check, context menu, weekly digest, recovery notifications, upload/ping threshold alerts
- **Uptime calendar** (`GET /api/uptime-calendar`) — 90-day daily uptime % grid (GitHub-style heatmap)
- **ISP community status** (`GET /api/isp-community-status`) — aggregate ISP health across all users with same ISP
- **Speed trend** (`GET /api/speed-trend`) — multi-week improving/stable/declining trend detection

### Rate limits
| Endpoint | Limit |
|----------|-------|
| `POST /api/test-now` | 5 req / 60 s per IP + per client-ID |
| `POST /api/reports` | 5 req / 60 s per IP + per client-ID |
| `DELETE /api/measurements` | 3 req / 60 s + requires `X-Admin-Key` header |
| `GET /api/my-connection` | 10 req / 60 s per IP |
| All other endpoints | 60 req / 60 s per IP |

### Postman collection
Import `postman_collection.json` from the repo root — pre-configured to hit the live production URL.
""",
    version="3.3.0",
    contact={
        "name": "Internet Stability Tracker",
        "url": "https://github.com/manziosee/Internet-Stability-Tracker",
    },
    license_info={"name": "MIT"},
    openapi_tags=[
        {"name": "measurements",  "description": "Speed test records — query and clear history"},
        {"name": "stats",         "description": "Aggregated statistics for a configurable time window"},
        {"name": "alerts",        "description": "Current outage status, alert configuration, and recent 48-hour summary"},
        {"name": "outages",       "description": "Individual measurements flagged as outages"},
        {"name": "isp",           "description": "ISP comparison, reliability scores and letter grades"},
        {"name": "reports",       "description": "Community-submitted network issue reports"},
        {"name": "outage-events", "description": "Structured outage event log with duration and severity"},
        {"name": "network",       "description": "Real-time system bandwidth, bandwidth probe, traceroute, multi-region latency"},
        {"name": "speed-test",    "description": "On-demand speed test trigger"},
        {"name": "insights",      "description": "AI-powered statistical pattern analysis, anomaly detection, comparison, heatmap, root cause, predictive maintenance"},
        {"name": "snapshots",     "description": "Shareable report snapshots — generate and retrieve"},
        {"name": "predictions",   "description": "ML predictions: speed forecasts, outage probability, best download times, congestion"},
        {"name": "diagnostics",   "description": "Advanced network diagnostics: packet loss, jitter, bufferbloat, MTU, DNS leak, VPN speed, router health"},
        {"name": "security",      "description": "Network security: port scanning, intrusion detection, privacy score, VPN recommendations"},
        {"name": "history",       "description": "Historical data visualization: heatmap calendar, distribution, percentiles, correlation"},
        {"name": "gaming",        "description": "Gaming-specific metrics: latency stability, packet loss, jitter for gaming"},
        {"name": "video",         "description": "Video call quality metrics: jitter, packet loss, bandwidth for video conferencing"},
        {"name": "recommendations", "description": "Activity recommendations based on current network conditions"},
        {"name": "preferences",   "description": "User preferences and customization settings"},
        {"name": "webhooks",      "description": "Custom webhook CRUD — register URLs to receive outage/speed_drop/recovery payloads"},
        {"name": "monitoring",    "description": "Prometheus metrics endpoint for Grafana scraping"},
        {"name": "sla",          "description": "ISP SLA compliance tracker — promised vs actual speeds"},
        {"name": "throttle",     "description": "ISP throttling detector — multi-CDN probe analysis"},
        {"name": "health",       "description": "Network health score (0–100) with grade and tips"},
        {"name": "cost",         "description": "Cost-per-Mbps calculator and value benchmarking"},
        {"name": "leaderboard",  "description": "Community speed leaderboard and challenges"},
        {"name": "export",       "description": "Data export: CSV and JSON download"},
        {"name": "api-keys",     "description": "Developer API key management (generate, list, revoke)"},
        {"name": "integrations", "description": "Slack / Microsoft Teams webhook integration"},
        {"name": "comparison",   "description": "Before/after speed comparison between two date ranges"},
        {"name": "contract",     "description": "ISP contract storage and SLA compliance tracking"},
        {"name": "certificate",  "description": "Network quality certificate generation"},
        {"name": "devices",      "description": "Multi-device linking, nearby WiFi discovery, and comparison"},
        {"name": "schedules",    "description": "Scheduled speed test configuration"},
        {"name": "packet-loss",  "description": "TCP-based packet loss and jitter measurement"},
        {"name": "wfh",          "description": "Work-From-Home connection quality score"},
    ],
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

# ── Global exception handler ──────────────────────────────────────────────────
# Ensures CORS headers are present on 500 responses so the browser shows the
# actual error instead of a misleading "CORS blocked" message.
@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    cors_headers = {"Access-Control-Allow-Origin": "*"} if origin else {}
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again."},
        headers=cors_headers,
    )


# Middleware stack (last added = outermost = executes first)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization", "X-Client-ID"],
    max_age=600,
)

app.include_router(router, prefix="/api")


@app.api_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENVIRONMENT,
    }


# ─── SPA static serving (single-container mode) ───────────────────────────────

_static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(_static_dir):
    from fastapi.responses import FileResponse

    @app.get("/", include_in_schema=False)
    def serve_spa_root():
        return FileResponse(os.path.join(_static_dir, "index.html"))

    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {
            "message": "Internet Stability Tracker API",
            "version": "2.0.0",
            "docs": "/docs" if not _is_prod else "disabled in production",
        }
