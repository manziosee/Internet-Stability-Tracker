from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, Text, Time, JSON, Index
from sqlalchemy.ext.hybrid import hybrid_property
from ..core.database import Base


class SpeedMeasurement(Base):
    __tablename__ = "speed_measurements"
    id             = Column(Integer, primary_key=True, index=True)
    timestamp      = Column(DateTime, default=datetime.utcnow, index=True)
    download_speed = Column(Float)
    upload_speed   = Column(Float)
    ping           = Column(Float)
    isp            = Column(String, index=True)
    location       = Column(String, nullable=True)
    latitude       = Column(Float, nullable=True)
    longitude      = Column(Float, nullable=True)
    is_outage      = Column(Boolean, default=False, index=True)
    client_id      = Column(String, nullable=True, index=True)


class CommunityReport(Base):
    __tablename__ = "community_reports"
    id            = Column(Integer, primary_key=True, index=True)
    timestamp     = Column(DateTime, default=datetime.utcnow, index=True)
    isp           = Column(String)
    location      = Column(String)
    latitude      = Column(Float)
    longitude     = Column(Float)
    issue_type    = Column(String)
    description   = Column(String)
    status        = Column(String, default="pending", index=True)
    confirmations = Column(Integer, default=0)
    rejections    = Column(Integer, default=0)


class OutageEvent(Base):
    __tablename__ = "outage_events"
    id                = Column(Integer, primary_key=True, index=True)
    started_at        = Column(DateTime, nullable=False, index=True)
    ended_at          = Column(DateTime, nullable=True)
    isp               = Column(String, nullable=True, index=True)
    location          = Column(String, nullable=True)
    latitude          = Column(Float, nullable=True)
    longitude         = Column(Float, nullable=True)
    is_resolved       = Column(Boolean, default=False, nullable=False, index=True)
    measurement_count = Column(Integer, default=1)
    avg_download      = Column(Float, nullable=True)

    @hybrid_property
    def duration_minutes(self):
        if self.ended_at and self.started_at:
            return (self.ended_at - self.started_at).total_seconds() / 60
        return None


class AlertConfig(Base):
    __tablename__ = "alert_configs"
    id                  = Column(Integer, primary_key=True, index=True)
    client_id           = Column(String, unique=True, nullable=False, index=True)
    enabled             = Column(Boolean, default=True)
    telegram_enabled    = Column(Boolean, default=False)
    telegram_chat_id    = Column(String, nullable=True)
    discord_enabled     = Column(Boolean, default=False)
    discord_webhook_url = Column(String, nullable=True)
    sms_enabled         = Column(Boolean, default=False)
    phone_number        = Column(String, nullable=True)
    min_download_speed  = Column(Float, nullable=True)
    max_ping            = Column(Float, nullable=True)
    quiet_hours_enabled = Column(Boolean, default=False)
    quiet_hours_start   = Column(Time, nullable=True)
    quiet_hours_end     = Column(Time, nullable=True)


class AlertLog(Base):
    __tablename__ = "alert_logs"
    id         = Column(Integer, primary_key=True, index=True)
    client_id  = Column(String, nullable=False, index=True)
    alert_type = Column(String)
    message    = Column(Text)
    severity   = Column(String)
    success    = Column(Boolean)
    timestamp  = Column(DateTime, default=datetime.utcnow, index=True)


class UserPreferences(Base):
    __tablename__ = "user_preferences"
    id                = Column(Integer, primary_key=True, index=True)
    client_id         = Column(String, unique=True, nullable=False, index=True)
    theme             = Column(String, default="dark")
    custom_theme      = Column(JSON, nullable=True)
    dashboard_layout  = Column(JSON, nullable=True)
    favorite_metrics  = Column(JSON, nullable=True)
    chart_preferences = Column(JSON, nullable=True)


class SecurityScan(Base):
    __tablename__ = "security_scans"
    id                  = Column(Integer, primary_key=True, index=True)
    client_id           = Column(String, nullable=False, index=True)
    timestamp           = Column(DateTime, default=datetime.utcnow, index=True)
    open_ports          = Column(JSON, nullable=True)
    vulnerable_ports    = Column(JSON, nullable=True)
    privacy_score       = Column(Float, nullable=True)
    intrusions_detected = Column(Integer, default=0)


class Webhook(Base):
    __tablename__ = "webhooks"
    id         = Column(Integer, primary_key=True, index=True)
    client_id  = Column(String, nullable=False, index=True)
    url        = Column(String, nullable=False)
    secret     = Column(String, nullable=True)
    events     = Column(JSON, default=lambda: ["outage", "speed_drop", "recovery"])
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_active  = Column(Boolean, default=True, nullable=False)


class APIKey(Base):
    __tablename__ = "api_keys"
    id         = Column(Integer, primary_key=True, index=True)
    client_id  = Column(String, nullable=False, index=True)
    key_hash   = Column(String, nullable=False, unique=True)
    label      = Column(String, default="Default")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used  = Column(DateTime, nullable=True)
    is_active  = Column(Boolean, default=True)


class UserLocation(Base):
    __tablename__ = "user_locations"
    id         = Column(Integer, primary_key=True, index=True)
    client_id  = Column(String, nullable=False, index=True)
    label      = Column(String, default="Home")
    ip_hint    = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active  = Column(Boolean, default=True)


class SpeedChallenge(Base):
    __tablename__ = "speed_challenges"
    id            = Column(Integer, primary_key=True, index=True)
    client_id     = Column(String, nullable=False, index=True)
    display_name  = Column(String, default="Anonymous")
    best_download = Column(Float, default=0.0)
    best_upload   = Column(Float, default=0.0)
    isp           = Column(String, nullable=True)
    country       = Column(String, nullable=True)
    recorded_at   = Column(DateTime, default=datetime.utcnow, index=True)


# ── New models (v3.3) ─────────────────────────────────────────────────────────

class ISPContract(Base):
    """User's ISP contract details for promised-vs-actual tracking."""
    __tablename__ = "isp_contracts"
    id                 = Column(Integer, primary_key=True, index=True)
    client_id          = Column(String, unique=True, nullable=False, index=True)
    isp_name           = Column(String, nullable=False)
    plan_name          = Column(String, nullable=True)
    promised_download  = Column(Float, nullable=False)   # Mbps
    promised_upload    = Column(Float, nullable=True)    # Mbps
    monthly_cost       = Column(Float, nullable=True)    # local currency
    currency           = Column(String, default="USD")
    contract_start     = Column(DateTime, nullable=True)
    contract_end       = Column(DateTime, nullable=True)
    sla_threshold_pct  = Column(Float, default=80.0)     # % of promised speed = passing
    created_at         = Column(DateTime, default=datetime.utcnow)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TestSchedule(Base):
    """User-defined speed test schedules (cron-like)."""
    __tablename__ = "test_schedules"
    id          = Column(Integer, primary_key=True, index=True)
    client_id   = Column(String, nullable=False, index=True)
    label       = Column(String, default="My Schedule")
    # Simple schedule: list of hours (0-23) on which to run each day
    hours       = Column(JSON, default=lambda: [8, 13, 18, 23])
    days        = Column(JSON, default=lambda: [0,1,2,3,4,5,6])  # 0=Mon
    enabled     = Column(Boolean, default=True)
    burst_count = Column(Integer, default=1)   # run N tests in a row
    created_at  = Column(DateTime, default=datetime.utcnow)
    last_run    = Column(DateTime, nullable=True)


class PacketLossReading(Base):
    """Continuous packet-loss and jitter measurements."""
    __tablename__ = "packet_loss_readings"
    id          = Column(Integer, primary_key=True, index=True)
    client_id   = Column(String, nullable=False, index=True)
    timestamp   = Column(DateTime, default=datetime.utcnow, index=True)
    loss_pct    = Column(Float, nullable=False)   # 0–100
    jitter_ms   = Column(Float, nullable=True)    # ms variance
    avg_ping_ms = Column(Float, nullable=True)
    target      = Column(String, default="1.1.1.1")
    __table_args__ = (Index("ix_pl_client_ts", "client_id", "timestamp"),)


class DeviceGroup(Base):
    """Links multiple client IDs into a named group for multi-device view."""
    __tablename__ = "device_groups"
    id         = Column(Integer, primary_key=True, index=True)
    group_id   = Column(String, nullable=False, index=True)  # UUID shared by members
    client_id  = Column(String, nullable=False, index=True)  # each member row
    label      = Column(String, default="My Device")
    joined_at  = Column(DateTime, default=datetime.utcnow)
    is_primary = Column(Boolean, default=False)


class CrisisLog(Base):
    """Stores detected crisis events for history and trending."""
    __tablename__ = "crisis_logs"
    id               = Column(Integer, primary_key=True, index=True)
    timestamp        = Column(DateTime, default=datetime.utcnow, index=True)
    combined_severity = Column(String, nullable=False, index=True)  # none/minor/major/critical/outage
    local_severity   = Column(String, nullable=True)
    global_severity  = Column(String, nullable=True)
    local_download_mbps = Column(Float, nullable=True)
    pct_of_baseline  = Column(Integer, nullable=True)
    affected_services = Column(JSON, nullable=True)   # list of provider names with issues
    total_incidents  = Column(Integer, default=0)
    community_reports_24h = Column(Integer, default=0)
    client_id        = Column(String, nullable=True, index=True)
    __table_args__ = (Index("ix_crisis_client_ts", "client_id", "timestamp"),)
