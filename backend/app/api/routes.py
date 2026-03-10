import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.config import settings
from ..models.measurement import SpeedMeasurement, CommunityReport
from ..services.speed_test import SpeedTestService

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Pydantic schemas ────────────────────────────────────────────────────────

class MeasurementResponse(BaseModel):
    id: int
    timestamp: datetime
    download_speed: float
    upload_speed: float
    ping: float
    isp: str
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_outage: bool

    class Config:
        from_attributes = True


class ReportCreate(BaseModel):
    isp: str
    location: str
    latitude: float
    longitude: float
    issue_type: str
    description: str


class ReportResponse(BaseModel):
    id: int
    timestamp: datetime
    isp: str
    location: str
    latitude: float
    longitude: float
    issue_type: str
    description: str

    class Config:
        from_attributes = True


class StatsResponse(BaseModel):
    total_tests: int
    total_outages: int
    uptime_percentage: Optional[float]
    avg_download_mbps: Optional[float]
    avg_upload_mbps: Optional[float]
    avg_ping_ms: Optional[float]
    last_test_at: Optional[datetime]
    hours: int


class AlertSummary(BaseModel):
    current_outage: bool
    outage_count_48h: int
    recent_outages: list


class ISPStats(BaseModel):
    isp: str
    avg_download: Optional[float]
    avg_upload: Optional[float]
    avg_ping: Optional[float]
    total_tests: int


# ─── Measurements ────────────────────────────────────────────────────────────

@router.get("/measurements", response_model=List[MeasurementResponse])
def get_measurements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return (
        db.query(SpeedMeasurement)
        .order_by(desc(SpeedMeasurement.timestamp))
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/measurements/recent", response_model=List[MeasurementResponse])
def get_recent_measurements(
    hours: int = Query(24, ge=1, le=settings.MAX_HISTORY_HOURS),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    return (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(desc(SpeedMeasurement.timestamp))
        .all()
    )


# ─── Stats ───────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsResponse)
def get_stats(
    hours: int = Query(24, ge=1, le=settings.MAX_HISTORY_HOURS),
    db: Session = Depends(get_db),
):
    """Aggregated summary for a given time window."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .all()
    )

    total = len(rows)
    outages = sum(1 for r in rows if r.is_outage)

    if total > 0:
        avg_dl  = round(sum(r.download_speed for r in rows) / total, 2)
        avg_ul  = round(sum(r.upload_speed   for r in rows) / total, 2)
        avg_png = round(sum(r.ping           for r in rows) / total, 2)
        uptime  = round(((total - outages) / total) * 100, 1)
        last_at = max(r.timestamp for r in rows)
    else:
        avg_dl = avg_ul = avg_png = uptime = last_at = None

    return StatsResponse(
        total_tests=total,
        total_outages=outages,
        uptime_percentage=uptime,
        avg_download_mbps=avg_dl,
        avg_upload_mbps=avg_ul,
        avg_ping_ms=avg_png,
        last_test_at=last_at,
        hours=hours,
    )


# ─── Alerts ──────────────────────────────────────────────────────────────────

@router.get("/alerts", response_model=AlertSummary)
def get_alerts(db: Session = Depends(get_db)):
    """Returns current outage status plus the 20 most recent outage events."""
    cutoff = datetime.utcnow() - timedelta(hours=48)

    recent_outages = (
        db.query(SpeedMeasurement)
        .filter(
            SpeedMeasurement.is_outage == True,
            SpeedMeasurement.timestamp >= cutoff,
        )
        .order_by(desc(SpeedMeasurement.timestamp))
        .limit(20)
        .all()
    )

    latest = (
        db.query(SpeedMeasurement)
        .order_by(desc(SpeedMeasurement.timestamp))
        .first()
    )
    current_outage = bool(latest and latest.is_outage)

    def severity(m: SpeedMeasurement) -> str:
        if m.download_speed == 0:
            return "critical"
        if m.download_speed < 0.5:
            return "high"
        return "medium"

    return AlertSummary(
        current_outage=current_outage,
        outage_count_48h=len(recent_outages),
        recent_outages=[
            {
                "id":             m.id,
                "timestamp":      m.timestamp.isoformat(),
                "isp":            m.isp,
                "location":       m.location,
                "download_speed": m.download_speed,
                "ping":           m.ping,
                "severity":       severity(m),
            }
            for m in recent_outages
        ],
    )


# ─── Outages ─────────────────────────────────────────────────────────────────

@router.get("/outages", response_model=List[MeasurementResponse])
def get_outages(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.is_outage == True)
        .order_by(desc(SpeedMeasurement.timestamp))
        .limit(limit)
        .all()
    )


# ─── ISP comparison ──────────────────────────────────────────────────────────

@router.get("/isp-comparison", response_model=List[ISPStats])
def compare_isps(db: Session = Depends(get_db)):
    rows = db.query(
        SpeedMeasurement.isp,
        func.avg(SpeedMeasurement.download_speed).label("avg_download"),
        func.avg(SpeedMeasurement.upload_speed).label("avg_upload"),
        func.avg(SpeedMeasurement.ping).label("avg_ping"),
        func.count(SpeedMeasurement.id).label("total_tests"),
    ).group_by(SpeedMeasurement.isp).all()

    return [
        ISPStats(
            isp=r.isp,
            avg_download=round(r.avg_download, 2) if r.avg_download else None,
            avg_upload=round(r.avg_upload, 2)   if r.avg_upload   else None,
            avg_ping=round(r.avg_ping, 2)       if r.avg_ping     else None,
            total_tests=r.total_tests,
        )
        for r in rows
    ]


# ─── Community reports ───────────────────────────────────────────────────────

@router.get("/reports", response_model=List[ReportResponse])
def get_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return (
        db.query(CommunityReport)
        .order_by(desc(CommunityReport.timestamp))
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/reports", response_model=ReportResponse, status_code=201)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    db_report = CommunityReport(**report.model_dump())
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report


# ─── On-demand speed test ─────────────────────────────────────────────────────

@router.post("/test-now", response_model=MeasurementResponse)
async def run_test_now(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """
    Runs a speed test without blocking the event loop.
    The network measurement runs in a thread-pool executor; only the DB
    write happens back on the main thread, keeping SQLAlchemy safe.
    """
    loop = asyncio.get_event_loop()
    service = SpeedTestService()

    # Run the slow network part in a thread (safe — no DB session passed)
    result = await loop.run_in_executor(None, service.measure_speeds)

    # Write to DB on the main thread (safe — session stays in its thread)
    return SpeedTestService._save(db, result, location, lat, lon)
