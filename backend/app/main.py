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
        "/api/test-now": (5, 60),
        "/api/reports":  (20, 60),
        "default":       (120, 60),
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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

### Key capabilities
- **Speed tests** — on-demand via `POST /api/test-now`; results stored in Turso (libSQL cloud)
- **Statistics** — aggregated uptime %, averages and outage counts over any time window
- **ISP reliability** — per-provider letter grades, uptime scores and averages
- **Outage events** — structured outage log with severity, duration and resolution status
- **Community reports** — crowd-sourced issue submissions with GPS coordinates
- **Live network activity** — real-time system bandwidth + per-process connection list
- **Alert system** — current outage flag and recent outage summary

### Rate limits
| Endpoint | Limit |
|----------|-------|
| `POST /api/test-now` | 5 req / 60 s per IP |
| `POST /api/reports` | 20 req / 60 s per IP |
| All other endpoints | 120 req / 60 s per IP |
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
    ],
    lifespan=lifespan,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
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


@app.get("/health", include_in_schema=False)
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
