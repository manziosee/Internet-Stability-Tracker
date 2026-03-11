import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.config import settings
from ..models.measurement import SpeedMeasurement, CommunityReport, OutageEvent
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



_VALID_ISSUE_TYPES = {"outage", "slow", "intermittent", "other"}

class ReportCreate(BaseModel):
    isp: str         = Field(..., min_length=1, max_length=120, strip_whitespace=True)
    location: str    = Field(..., min_length=1, max_length=200, strip_whitespace=True)
    latitude: float  = Field(..., ge=-90,  le=90)
    longitude: float = Field(..., ge=-180, le=180)
    issue_type: str  = Field(..., min_length=1, max_length=40)
    description: str = Field(..., min_length=1, max_length=1000, strip_whitespace=True)
    @field_validator('issue_type')
    @classmethod
    def validate_issue_type(cls, v):
        if v not in _VALID_ISSUE_TYPES:
            raise ValueError(f'issue_type must be one of {_VALID_ISSUE_TYPES}')
        return v


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


class OutageEventResponse(BaseModel):
    id: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    isp: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_resolved: bool
    measurement_count: int
    avg_download: Optional[float] = None
    duration_minutes: Optional[float] = None
    severity: str = "medium"

    class Config:
        from_attributes = True


class ISPReliability(BaseModel):
    isp: str
    total_tests: int
    outage_tests: int
    uptime_pct: float
    avg_download: Optional[float]
    avg_upload: Optional[float]
    avg_ping: Optional[float]
    grade: str


# ─── Measurements ────────────────────────────────────────────────────────────

@router.get("/measurements", response_model=List[MeasurementResponse], tags=["measurements"],
            summary="List all measurements", description="Paginated list of speed test records, most recent first.")
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


@router.get("/measurements/recent", response_model=List[MeasurementResponse], tags=["measurements"],
            summary="Recent measurements", description="Measurements within the last N hours (default 24h, max 168h).")
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

@router.get("/stats", response_model=StatsResponse, tags=["stats"],
            summary="Aggregated statistics", description="Total tests, outage count, uptime %, average speeds and ping for the requested time window.")
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

@router.get("/alerts", response_model=AlertSummary, tags=["alerts"],
            summary="Current alert status", description="Returns whether there is an active outage right now, the 48-hour outage count, and recent outage events.")
def get_alerts(db: Session = Depends(get_db)):
    """Returns current outage status using OutageEvent table."""
    cutoff = datetime.utcnow() - timedelta(hours=48)

    # Check if there's an open (unresolved) outage event
    open_event = (
        db.query(OutageEvent)
        .filter(OutageEvent.is_resolved == False)
        .order_by(desc(OutageEvent.started_at))
        .first()
    )
    current_outage = open_event is not None

    # Also fall back to latest measurement if no outage events recorded yet
    if not current_outage:
        latest = (
            db.query(SpeedMeasurement)
            .order_by(desc(SpeedMeasurement.timestamp))
            .first()
        )
        current_outage = bool(latest and latest.is_outage)

    # Recent outage events in last 48h
    recent_events = (
        db.query(OutageEvent)
        .filter(OutageEvent.started_at >= cutoff)
        .order_by(desc(OutageEvent.started_at))
        .limit(20)
        .all()
    )

    def event_severity(e: OutageEvent) -> str:
        if e.avg_download is None or e.avg_download == 0:
            return "critical"
        if e.avg_download < 0.5:
            return "high"
        return "medium"

    return AlertSummary(
        current_outage=current_outage,
        outage_count_48h=len(recent_events),
        recent_outages=[
            {
                "id":               e.id,
                "timestamp":        e.started_at.isoformat(),
                "ended_at":         e.ended_at.isoformat() if e.ended_at else None,
                "isp":              e.isp,
                "location":         e.location,
                "download_speed":   e.avg_download,
                "duration_minutes": e.duration_minutes,
                "is_resolved":      e.is_resolved,
                "severity":         event_severity(e),
            }
            for e in recent_events
        ],
    )


# ─── Outages ─────────────────────────────────────────────────────────────────

@router.get("/outages", response_model=List[MeasurementResponse], tags=["outages"],
            summary="Outage measurements", description="Individual speed test records where download speed was below the outage threshold.")
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

@router.get("/isp-comparison", response_model=List[ISPStats], tags=["isp"],
            summary="ISP performance comparison", description="Average download, upload, ping and total test count grouped by ISP name.")
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

@router.get("/reports", response_model=List[ReportResponse], tags=["reports"],
            summary="List community reports", description="Paginated list of community-submitted network issue reports.")
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


@router.post("/reports", response_model=ReportResponse, status_code=201, tags=["reports"],
             summary="Submit a community report", description="Submit a crowd-sourced network issue. Validated: issue_type must be one of outage/slow/intermittent/other.")
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    db_report = CommunityReport(**report.model_dump())
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report


# ─── Outage events ───────────────────────────────────────────────────────────

@router.get("/outage-events", response_model=List[OutageEventResponse], tags=["outage-events"],
            summary="Outage event log", description="Structured outage events with computed duration (minutes) and severity (critical/high/medium).")
def get_outage_events(
    limit: int = Query(50, ge=1, le=200),
    resolved_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """List OutageEvent records with computed duration and severity."""
    q = db.query(OutageEvent)
    if resolved_only:
        q = q.filter(OutageEvent.is_resolved == True)
    events = q.order_by(desc(OutageEvent.started_at)).limit(limit).all()

    def severity(e: OutageEvent) -> str:
        if e.avg_download is None or e.avg_download == 0:
            return "critical"
        if e.avg_download < 0.5:
            return "high"
        return "medium"

    result = []
    for e in events:
        result.append(OutageEventResponse(
            id=e.id,
            started_at=e.started_at,
            ended_at=e.ended_at,
            isp=e.isp,
            location=e.location,
            latitude=e.latitude,
            longitude=e.longitude,
            is_resolved=e.is_resolved,
            measurement_count=e.measurement_count,
            avg_download=round(e.avg_download, 2) if e.avg_download is not None else None,
            duration_minutes=round(e.duration_minutes, 1) if e.duration_minutes is not None else None,
            severity=severity(e),
        ))
    return result


# ─── ISP reliability ─────────────────────────────────────────────────────────

@router.get("/isp-reliability", response_model=List[ISPReliability], tags=["isp"],
            summary="ISP reliability scores", description="Per-ISP uptime %, averages and letter grade (A+/A/B/C/D/F) for a configurable time window. Sorted by uptime descending.")
def get_isp_reliability(
    hours: int = Query(168, ge=1, le=settings.MAX_HISTORY_HOURS),
    db: Session = Depends(get_db),
):
    """Per-ISP reliability scores: uptime %, averages, letter grade."""
    from collections import defaultdict
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .all()
    )

    isp_data: dict = defaultdict(lambda: {"total": 0, "outages": 0, "dl": [], "ul": [], "ping": []})
    for r in rows:
        d = isp_data[r.isp]
        d["total"] += 1
        if r.is_outage:
            d["outages"] += 1
        d["dl"].append(r.download_speed)
        d["ul"].append(r.upload_speed)
        d["ping"].append(r.ping)

    def letter_grade(uptime: float, avg_dl: float) -> str:
        if uptime >= 99 and avg_dl >= 50:
            return "A+"
        if uptime >= 97 and avg_dl >= 25:
            return "A"
        if uptime >= 95 and avg_dl >= 10:
            return "B"
        if uptime >= 90 and avg_dl >= 5:
            return "C"
        if uptime >= 80:
            return "D"
        return "F"

    result = []
    for isp, d in isp_data.items():
        total = d["total"]
        outages = d["outages"]
        uptime_pct = round(((total - outages) / total) * 100, 1) if total else 0.0
        avg_dl  = round(sum(d["dl"])   / total, 2) if d["dl"]   else None
        avg_ul  = round(sum(d["ul"])   / total, 2) if d["ul"]   else None
        avg_png = round(sum(d["ping"]) / total, 2) if d["ping"] else None
        result.append(ISPReliability(
            isp=isp,
            total_tests=total,
            outage_tests=outages,
            uptime_pct=uptime_pct,
            avg_download=avg_dl,
            avg_upload=avg_ul,
            avg_ping=avg_png,
            grade=letter_grade(uptime_pct, avg_dl or 0),
        ))

    result.sort(key=lambda x: x.uptime_pct, reverse=True)
    return result


# ─── Real-time network usage ─────────────────────────────────────────────────

@router.get("/network-usage", tags=["network"],
            summary="Live network usage", description="1-second bandwidth sample (download/upload Mbps) plus a list of processes that have active ESTABLISHED TCP connections. Uses psutil — no root required.")
def get_network_usage():
    """
    Returns real-time system bandwidth (sampled over 1 second) and
    a list of processes that have active network connections.
    Uses psutil — no root required.
    """
    try:
        import psutil

        # ── 1-second bandwidth sample ────────────────────────────────────────
        s1 = psutil.net_io_counters()
        time.sleep(1)
        s2 = psutil.net_io_counters()
        download_bps = max(0, s2.bytes_recv - s1.bytes_recv)
        upload_bps   = max(0, s2.bytes_sent - s1.bytes_sent)
        download_mbps = round(download_bps * 8 / 1_000_000, 2)
        upload_mbps   = round(upload_bps   * 8 / 1_000_000, 2)

        # ── Per-process connections ───────────────────────────────────────────
        conns = psutil.net_connections(kind="inet")
        pid_conns: dict = {}
        for c in conns:
            if c.pid is None:
                continue
            pid_conns.setdefault(c.pid, []).append(c)

        apps = {}
        for pid, conn_list in pid_conns.items():
            try:
                proc = psutil.Process(pid)
                name = proc.name()
                est = sum(1 for c in conn_list if c.status == "ESTABLISHED")
                if est == 0:
                    continue
                if name not in apps:
                    apps[name] = {
                        "name": name,
                        "pid": pid,
                        "connections": 0,
                        "remote_addresses": set(),
                    }
                apps[name]["connections"] += est
                for c in conn_list:
                    if c.raddr:
                        apps[name]["remote_addresses"].add(c.raddr.ip)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        top_apps = sorted(apps.values(), key=lambda x: x["connections"], reverse=True)[:12]
        for a in top_apps:
            a["remote_addresses"] = list(a["remote_addresses"])[:4]

        # ── Interface totals ──────────────────────────────────────────────────
        total = psutil.net_io_counters()

        return {
            "download_mbps": download_mbps,
            "upload_mbps": upload_mbps,
            "total_sent_gb": round(total.bytes_sent / 1e9, 3),
            "total_recv_gb": round(total.bytes_recv / 1e9, 3),
            "apps": top_apps,
            "sampled_at": datetime.utcnow().isoformat(),
        }
    except ImportError:
        raise HTTPException(status_code=503, detail="psutil not installed on server")
    except Exception as exc:
        logger.error("network-usage failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Clear all measurements ──────────────────────────────────────────────────

@router.delete("/measurements", status_code=200, tags=["measurements"],
               summary="Clear all measurements", description="Permanently deletes all speed test records and associated outage events. Irreversible.")
def clear_measurements(db: Session = Depends(get_db)):
    """Delete all speed measurements and associated outage events."""
    deleted = db.query(SpeedMeasurement).delete(synchronize_session=False)
    db.query(OutageEvent).delete(synchronize_session=False)
    db.commit()
    logger.info("Cleared all measurements (%d rows deleted)", deleted)
    return {"deleted": deleted, "message": "All measurements cleared."}


# ─── On-demand speed test ─────────────────────────────────────────────────────

@router.post("/test-now", response_model=MeasurementResponse, tags=["speed-test"],
             summary="Run speed test now", description="Triggers an immediate speed test (runs in a thread-pool so the event loop is never blocked). Rate-limited to 5 requests per 60 seconds per IP.")
async def run_test_now(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """
    Runs a speed test without blocking the event loop.
    Network measurement runs in a thread-pool executor (no DB);
    DB write happens after the executor returns.
    """
    try:
        service = SpeedTestService()
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, service.measure_speeds)
        return SpeedTestService._save(db, result, location, lat, lon)
    except Exception as exc:
        logger.error("test-now endpoint failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
