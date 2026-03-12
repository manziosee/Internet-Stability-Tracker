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
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from .api.routes import router
from .core.config import settings
from .core.database import engine, Base
from .scheduler import start_scheduler

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
        "default":                    (60, 60),   # 60 read requests per minute
    }

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

app = FastAPI(
    title="Internet Stability Tracker API",
    description="""
## Internet Stability Tracker v2.0 — REST API

Community-driven network monitoring platform that measures internet speed,
detects outages, and visualises performance across ISPs.

**Live API**: https://backend-cold-butterfly-9535.fly.dev/api
**Frontend**: https://internet-stability-tracker.vercel.app
**WebSocket**: wss://backend-cold-butterfly-9535.fly.dev/api/ws/live

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
- **Hourly aggregation + weekly report** — APScheduler background jobs
- **Per-device isolation** — X-Client-ID header scopes data per browser UUID
- **Outage webhook/email alerts** — configurable via `ALERT_WEBHOOK_URL` / SMTP secrets
- **Sentry error tracking** — activates when `SENTRY_DSN` env var is set

### New in v2.1 (ML & Security Features)
- **ML Predictions** (`/api/ml/*`) — speed forecasts, outage probability, best download times, congestion predictions
- **Smart Alerts** (`/api/alerts/config`) — multi-channel notifications (Telegram, Discord, SMS) with custom thresholds
- **Advanced Diagnostics** (`/api/diagnostics/*`) — packet loss, jitter, bufferbloat, MTU discovery, DNS leak, VPN speed
- **Network Security** (`/api/security/*`) — port scanning, intrusion detection, privacy score, VPN recommendations
- **Historical Visualization** (`/api/history/*`) — heatmap calendar, distribution histogram, percentiles, correlation analysis
- **Enhanced AI Insights** (`/api/ai-insights/*`) — root cause analysis, predictive maintenance, advanced anomaly detection, NL chatbot

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
    version="2.0.0",
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
    ],
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
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
    allow_methods=["GET", "POST", "DELETE"],
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
