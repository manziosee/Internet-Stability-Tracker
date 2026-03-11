import logging
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone

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
        ip   = request.client.host if request.client else "unknown"
        path = request.url.path.rstrip("/")
        limit, window = self._RULES.get(path, self._RULES["default"])
        key  = f"{ip}:{path}"
        now  = time.time()
        hits = _rate_store[key]
        hits[:] = [t for t in hits if now - t < window]

        if len(hits) >= limit:
            logger.warning("Rate limit hit: %s  %s %s", ip, request.method, path)
            return Response(
                content='{"detail":"Too many requests — please slow down."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(window), "X-RateLimit-Limit": str(limit)},
            )

        hits.append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"]     = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - len(hits)))
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
    ]
    from sqlalchemy import text
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists


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
## Internet Stability Tracker — REST API

Community-driven network monitoring platform that measures internet speed,
detects outages, and visualises performance across ISPs.

**Live API**: https://backend-cold-butterfly-9535.fly.dev/api
**Frontend**: https://internet-stability-tracker.vercel.app

### Key capabilities
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
- **Live network activity** — real-time system bandwidth + per-process connection list

### Rate limits
| Endpoint | Limit |
|----------|-------|
| `POST /api/test-now` | 5 req / 60 s per IP |
| `POST /api/reports` | 5 req / 60 s per IP |
| `DELETE /api/measurements` | 3 req / 60 s per IP + requires `X-Admin-Key` header |
| `GET /api/my-connection` | 10 req / 60 s per IP |
| All other endpoints | 60 req / 60 s per IP |

### Postman collection
Import `postman_collection.json` from the repo root — pre-configured to hit the live production URL.
""",
    version="1.0.0",
    contact={
        "name": "Internet Stability Tracker",
        "url": "https://github.com/manziosee/Internet-Stability-Tracker",
    },
    license_info={"name": "MIT"},
    openapi_tags=[
        {"name": "measurements",  "description": "Speed test records — query and clear history"},
        {"name": "stats",         "description": "Aggregated statistics for a configurable time window"},
        {"name": "alerts",        "description": "Current outage status and recent 48-hour summary"},
        {"name": "outages",       "description": "Individual measurements flagged as outages"},
        {"name": "isp",           "description": "ISP comparison, reliability scores and letter grades"},
        {"name": "reports",       "description": "Community-submitted network issue reports"},
        {"name": "outage-events", "description": "Structured outage event log with duration and severity"},
        {"name": "network",       "description": "Real-time system bandwidth and per-app connection list"},
        {"name": "speed-test",    "description": "On-demand speed test trigger"},
        {"name": "insights",      "description": "AI-powered statistical pattern analysis and quality scoring"},
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
    allow_headers=["Content-Type", "Accept", "Authorization"],
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
            "version": "1.0.0",
            "docs": "/docs" if not _is_prod else "disabled in production",
        }
