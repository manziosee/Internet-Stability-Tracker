from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # ── Turso / libSQL ──────────────────────────────────────────────────────
    TURSO_DB_URL: str                           # libsql://... from Turso dashboard
    TURSO_AUTH_TOKEN: str                       # JWT token from Turso dashboard

    # ── App ─────────────────────────────────────────────────────────────────
    SECRET_KEY: str                             # Required — no fallback; set via fly secrets or .env
    ADMIN_API_KEY: str = ""                     # Required for DELETE /measurements; leave empty to disable the endpoint
    ENVIRONMENT: str = "development"
    SPEED_TEST_INTERVAL: int = 300              # seconds between auto-tests (if enabled)
    AUTO_SPEED_TEST: bool = False               # set True to enable background scheduler
    OUTAGE_THRESHOLD_MBPS: float = 1.0          # below this = outage
    CORS_ORIGINS: List[str] = ["*"]
    MAX_HISTORY_HOURS: int = 168                # 7 days max for history queries

    class Config:
        env_file = ".env"


settings = Settings()
