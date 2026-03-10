from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # ── Turso / libSQL ──────────────────────────────────────────────────────
    TURSO_DB_URL: str                           # libsql://... from Turso dashboard
    TURSO_AUTH_TOKEN: str                       # JWT token from Turso dashboard

    # ── App ─────────────────────────────────────────────────────────────────
    SECRET_KEY: str = "changeme-in-production"
    ENVIRONMENT: str = "development"
    SPEED_TEST_INTERVAL: int = 300              # seconds between auto-tests
    OUTAGE_THRESHOLD_MBPS: float = 1.0          # below this = outage
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    MAX_HISTORY_HOURS: int = 168                # 7 days max for history queries

    class Config:
        env_file = ".env"


settings = Settings()
