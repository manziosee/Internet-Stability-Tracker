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
