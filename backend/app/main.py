import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .core.config import settings
from .core.database import engine, Base
from .scheduler import start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    Base.metadata.create_all(bind=engine)
    scheduler = start_scheduler()
    logger.info("Application started")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────
    scheduler.shutdown(wait=False)
    logger.info("Application stopped")


app = FastAPI(
    title="Internet Stability Tracker API",
    description="Community network monitoring platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENVIRONMENT,
    }


# Serve React frontend from ./static when running as a single container.
# In docker-compose, nginx handles frontend serving and proxies /api/ to here.
_static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(_static_dir):
    from fastapi.responses import FileResponse

    @app.get("/")
    def serve_spa_root():
        return FileResponse(os.path.join(_static_dir, "index.html"))

    # Catch-all: SPA client-side routes — must be registered last
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
else:
    @app.get("/")
    def root():
        return {
            "message": "Internet Stability Tracker API",
            "version": "1.0.0",
            "docs": "/docs",
        }
