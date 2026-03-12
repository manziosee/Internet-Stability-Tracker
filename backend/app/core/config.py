from pydantic_settings import BaseSettings
from typing import List, Optional


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

    # ── Alerts / webhooks ───────────────────────────────────────────────────
    ALERT_WEBHOOK_URL: Optional[str] = None     # Discord/Slack/generic webhook URL for outage alerts
    ALERT_EMAIL: Optional[str] = None           # destination email (requires SMTP settings below)
    SMTP_HOST: Optional[str] = None             # e.g. smtp.gmail.com
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: Optional[str] = None             # From address; defaults to SMTP_USER

    # ── Sentry ──────────────────────────────────────────────────────────────
    SENTRY_DSN: Optional[str] = None            # Set via fly secrets set SENTRY_DSN=https://...

    # ── Smart Alerts ────────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: Optional[str] = None    # Telegram bot token for alerts
    TWILIO_ACCOUNT_SID: Optional[str] = None    # Twilio account SID for SMS
    TWILIO_AUTH_TOKEN: Optional[str] = None     # Twilio auth token
    TWILIO_FROM_NUMBER: Optional[str] = None    # Twilio phone number

    # ── Redis (optional caching) ────────────────────────────────────────────
    REDIS_URL: Optional[str] = None             # redis://localhost:6379/0

    class Config:
        env_file = ".env"


settings = Settings()
