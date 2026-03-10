from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean, Index
from datetime import datetime
from ..core.database import Base


class SpeedMeasurement(Base):
    __tablename__ = "speed_measurements"

    id             = Column(Integer, primary_key=True, index=True)
    timestamp      = Column(DateTime, default=datetime.utcnow, nullable=False)
    download_speed = Column(Float, nullable=False)
    upload_speed   = Column(Float, nullable=False)
    ping           = Column(Float, nullable=False)
    isp            = Column(String, nullable=True)
    location       = Column(String, nullable=True)
    latitude       = Column(Float,  nullable=True)
    longitude      = Column(Float,  nullable=True)
    is_outage      = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_speed_meas_timestamp", "timestamp"),
        Index("ix_speed_meas_isp",       "isp"),
        Index("ix_speed_meas_outage",    "is_outage"),
    )


class CommunityReport(Base):
    __tablename__ = "community_reports"

    id          = Column(Integer, primary_key=True, index=True)
    timestamp   = Column(DateTime, default=datetime.utcnow, nullable=False)
    isp         = Column(String, nullable=False)
    location    = Column(String, nullable=False)
    latitude    = Column(Float,  nullable=False)
    longitude   = Column(Float,  nullable=False)
    issue_type  = Column(String, nullable=False)
    description = Column(String, nullable=False)
    status      = Column(String, default="pending", nullable=False)
    # status: "pending" | "confirmed" | "resolved"

    __table_args__ = (
        Index("ix_community_reports_timestamp", "timestamp"),
        Index("ix_community_reports_status",    "status"),
    )


class OutageEvent(Base):
    """
    Tracks discrete outage periods derived from SpeedMeasurement records.
    The scheduler opens a new OutageEvent when it detects an outage and
    closes it (sets ended_at + is_resolved=True) when speeds recover.
    """
    __tablename__ = "outage_events"

    id                = Column(Integer, primary_key=True, index=True)
    started_at        = Column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at          = Column(DateTime, nullable=True)   # NULL = still ongoing
    isp               = Column(String,  nullable=True)
    location          = Column(String,  nullable=True)
    latitude          = Column(Float,   nullable=True)
    longitude         = Column(Float,   nullable=True)
    is_resolved       = Column(Boolean, default=False, nullable=False)
    measurement_count = Column(Integer, default=1)        # outage readings count
    avg_download      = Column(Float,   nullable=True)    # avg speed during outage

    __table_args__ = (
        Index("ix_outage_events_started_at",  "started_at"),
        Index("ix_outage_events_isp",         "isp"),
        Index("ix_outage_events_is_resolved", "is_resolved"),
    )

    @property
    def duration_minutes(self):
        if self.ended_at and self.started_at:
            return (self.ended_at - self.started_at).total_seconds() / 60
        return None
