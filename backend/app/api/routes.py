import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.config import settings
from ..models.measurement import SpeedMeasurement, CommunityReport, OutageEvent
from ..services.speed_test import SpeedTestService

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Admin-key dependency ─────────────────────────────────────────────────────

def require_admin_key(x_admin_key: str = Header(default="")):
    """Protect destructive endpoints with a shared admin API key.
    Set ADMIN_API_KEY in environment. If unset the endpoint returns 503."""
    expected = settings.ADMIN_API_KEY
    if not expected:
        raise HTTPException(status_code=503, detail="Admin operations are disabled on this server.")
    if x_admin_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden — invalid admin key.")


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
        raise HTTPException(status_code=503, detail="Network usage monitoring is unavailable.")
    except Exception as exc:
        logger.error("network-usage failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")


# ─── Clear all measurements ──────────────────────────────────────────────────

@router.delete("/measurements", status_code=200, tags=["measurements"],
               summary="Clear all measurements",
               description="Permanently deletes all speed test records and associated outage events. **Requires `X-Admin-Key` header.** Irreversible.")
def clear_measurements(db: Session = Depends(get_db), _: None = Depends(require_admin_key)):
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
    try:
        service = SpeedTestService()
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, service.measure_speeds)
        return SpeedTestService._save(db, result, location, lat, lon)
    except Exception as exc:
        logger.error("test-now endpoint failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Speed test failed. Please try again later.")


# ─── Network Quality Score ────────────────────────────────────────────────────

class QualityScore(BaseModel):
    score: float
    grade: str
    label: str
    breakdown: dict
    hours: int


@router.get("/quality-score", response_model=QualityScore, tags=["stats"],
            summary="Network Quality Score", description="Composite 0–100 score based on speed, ping, and uptime over the requested window.")
def get_quality_score(
    hours: int = Query(24, ge=1, le=settings.MAX_HISTORY_HOURS),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff).all()

    if not rows:
        return QualityScore(score=0, grade="N/A", label="No Data", breakdown={
            "speed_score": 0, "upload_score": 0, "ping_score": 0, "uptime_score": 0
        }, hours=hours)

    total = len(rows)
    outages = sum(1 for r in rows if r.is_outage)
    avg_dl  = sum(r.download_speed for r in rows) / total
    avg_ul  = sum(r.upload_speed   for r in rows) / total
    avg_png = sum(r.ping           for r in rows) / total
    uptime  = ((total - outages) / total) * 100

    # Download: 0–40 pts (100 Mbps = full marks)
    speed_score  = min(40.0, (avg_dl / 100) * 40)
    # Upload: 0–20 pts (50 Mbps = full marks)
    upload_score = min(20.0, (avg_ul / 50) * 20)
    # Ping: 0–20 pts (lower is better; ≤10 ms = full marks, ≥300 ms = 0)
    ping_score   = max(0.0, 20.0 * (1 - min(avg_png, 300) / 300))
    # Uptime: 0–20 pts
    uptime_score = (uptime / 100) * 20

    score = round(speed_score + upload_score + ping_score + uptime_score, 1)

    if score >= 90:   grade, label = "A+", "Excellent"
    elif score >= 80: grade, label = "A",  "Very Good"
    elif score >= 70: grade, label = "B",  "Good"
    elif score >= 55: grade, label = "C",  "Fair"
    elif score >= 40: grade, label = "D",  "Poor"
    else:             grade, label = "F",  "Critical"

    return QualityScore(
        score=score, grade=grade, label=label,
        breakdown={
            "speed_score":  round(speed_score, 1),
            "upload_score": round(upload_score, 1),
            "ping_score":   round(ping_score, 1),
            "uptime_score": round(uptime_score, 1),
            "avg_download": round(avg_dl, 2),
            "avg_upload":   round(avg_ul, 2),
            "avg_ping":     round(avg_png, 2),
            "uptime_pct":   round(uptime, 1),
        },
        hours=hours,
    )


# ─── Global Status Page ────────────────────────────────────────────────────────

@router.get("/status", tags=["stats"],
            summary="Global internet status", description="Overall platform health: current status, active outages, avg speed, total reports, and a 7-day summary.")
def get_global_status(db: Session = Depends(get_db)):
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    cutoff_7d  = datetime.utcnow() - timedelta(days=7)

    rows_24h = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff_24h).all()
    rows_7d  = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff_7d).all()

    active_outage = db.query(OutageEvent).filter(OutageEvent.is_resolved == False).first()
    active_outages_count = db.query(OutageEvent).filter(OutageEvent.is_resolved == False).count()
    open_reports = db.query(CommunityReport).filter(CommunityReport.status == "pending").count()

    avg_dl = None
    uptime_pct = None
    if rows_24h:
        avg_dl = round(sum(r.download_speed for r in rows_24h) / len(rows_24h), 2)
        outages_24h = sum(1 for r in rows_24h if r.is_outage)
        uptime_pct = round(((len(rows_24h) - outages_24h) / len(rows_24h)) * 100, 1)

    # 7-day daily breakdown
    from collections import defaultdict
    daily: dict = defaultdict(lambda: {"tests": 0, "outages": 0, "dl": []})
    for r in rows_7d:
        day = r.timestamp.strftime("%Y-%m-%d")
        daily[day]["tests"] += 1
        if r.is_outage:
            daily[day]["outages"] += 1
        daily[day]["dl"].append(r.download_speed)

    daily_summary = []
    for day in sorted(daily.keys()):
        d = daily[day]
        t = d["tests"]
        daily_summary.append({
            "date": day,
            "tests": t,
            "outages": d["outages"],
            "uptime_pct": round(((t - d["outages"]) / t) * 100, 1) if t else 100.0,
            "avg_download": round(sum(d["dl"]) / t, 2) if t else None,
        })

    if active_outages_count > 0:
        overall_status = "outage"
    elif uptime_pct is not None and uptime_pct < 95:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return {
        "status": overall_status,
        "active_outages": active_outages_count,
        "open_reports": open_reports,
        "avg_download_24h": avg_dl,
        "uptime_pct_24h": uptime_pct,
        "total_measurements_7d": len(rows_7d),
        "daily_summary": daily_summary,
        "checked_at": datetime.utcnow().isoformat(),
    }


# ─── Historical Timeline ───────────────────────────────────────────────────────

@router.get("/timeline", tags=["outage-events"],
            summary="Historical performance timeline", description="Chronological list of significant events: outages, speed degradations, and recoveries over the last N days.")
def get_timeline(
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(days=days)

    events = (
        db.query(OutageEvent)
        .filter(OutageEvent.started_at >= cutoff)
        .order_by(desc(OutageEvent.started_at))
        .all()
    )

    timeline = []
    for e in events:
        dur = None
        if e.ended_at and e.started_at:
            dur = round((e.ended_at - e.started_at).total_seconds() / 60, 1)

        if e.avg_download is None or e.avg_download == 0:
            severity = "critical"
            event_type = "outage"
        elif e.avg_download < 0.5:
            severity = "high"
            event_type = "outage"
        elif not e.is_resolved:
            severity = "medium"
            event_type = "degradation"
        else:
            severity = "low"
            event_type = "recovery"

        timeline.append({
            "id":               e.id,
            "event_type":       event_type,
            "severity":         severity,
            "started_at":       e.started_at.isoformat(),
            "ended_at":         e.ended_at.isoformat() if e.ended_at else None,
            "isp":              e.isp,
            "location":         e.location,
            "avg_download":     round(e.avg_download, 2) if e.avg_download is not None else None,
            "duration_minutes": dur,
            "is_resolved":      e.is_resolved,
            "measurement_count": e.measurement_count,
        })

    return {"days": days, "total": len(timeline), "events": timeline}


# ─── ISP Reputation Rankings ──────────────────────────────────────────────────

class ISPRanking(BaseModel):
    rank: int
    isp: str
    score: float
    grade: str
    uptime_pct: float
    avg_download: Optional[float]
    avg_upload: Optional[float]
    avg_ping: Optional[float]
    total_tests: int
    community_reports: int
    outage_tests: int


@router.get("/isp-rankings", response_model=List[ISPRanking], tags=["isp"],
            summary="ISP reputation rankings", description="Weighted reputation score per ISP: uptime (40 pts), download (25 pts), upload (15 pts), ping (10 pts), minus community report penalty (10 pts max).")
def get_isp_rankings(
    hours: int = Query(168, ge=1, le=settings.MAX_HISTORY_HOURS),
    db: Session = Depends(get_db),
):
    from collections import defaultdict
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff).all()
    reports = db.query(CommunityReport).filter(CommunityReport.timestamp >= cutoff).all()

    report_counts: dict = defaultdict(int)
    for r in reports:
        report_counts[r.isp.strip().lower()] += 1

    isp_data: dict = defaultdict(lambda: {"total": 0, "outages": 0, "dl": [], "ul": [], "ping": []})
    for r in rows:
        d = isp_data[r.isp]
        d["total"] += 1
        if r.is_outage:
            d["outages"] += 1
        d["dl"].append(r.download_speed)
        d["ul"].append(r.upload_speed)
        d["ping"].append(r.ping)

    result = []
    for isp, d in isp_data.items():
        total = d["total"]
        if total == 0:
            continue
        outages = d["outages"]
        uptime_pct = round(((total - outages) / total) * 100, 1)
        avg_dl  = round(sum(d["dl"])   / total, 2) if d["dl"]   else None
        avg_ul  = round(sum(d["ul"])   / total, 2) if d["ul"]   else None
        avg_png = round(sum(d["ping"]) / total, 2) if d["ping"] else None

        # Scoring formula
        uptime_pts   = (uptime_pct / 100) * 40
        dl_pts       = min(25.0, ((avg_dl or 0) / 100) * 25)
        ul_pts       = min(15.0, ((avg_ul or 0) / 50)  * 15)
        ping_pts     = max(0.0,  10.0 * (1 - min((avg_png or 300), 300) / 300))
        rpt_count    = report_counts.get(isp.strip().lower(), 0)
        report_penalty = min(10.0, rpt_count * 1.5)
        score = round(uptime_pts + dl_pts + ul_pts + ping_pts - report_penalty, 1)
        score = max(0.0, score)

        if score >= 90:   grade = "A+"
        elif score >= 80: grade = "A"
        elif score >= 70: grade = "B"
        elif score >= 55: grade = "C"
        elif score >= 40: grade = "D"
        else:             grade = "F"

        result.append(ISPRanking(
            rank=0, isp=isp, score=score, grade=grade,
            uptime_pct=uptime_pct, avg_download=avg_dl, avg_upload=avg_ul, avg_ping=avg_png,
            total_tests=total, community_reports=rpt_count, outage_tests=outages,
        ))

    result.sort(key=lambda x: x.score, reverse=True)
    for i, r in enumerate(result):
        r.rank = i + 1
    return result


# ─── Smart Outage Confidence ──────────────────────────────────────────────────

@router.get("/outage-confidence", tags=["alerts"],
            summary="Smart outage confidence score", description="Combines failed speed tests, community reports, and open outage events to produce an outage confidence score (0–100%).")
def get_outage_confidence(db: Session = Depends(get_db)):
    cutoff_1h  = datetime.utcnow() - timedelta(hours=1)
    cutoff_6h  = datetime.utcnow() - timedelta(hours=6)

    recent_measurements = db.query(SpeedMeasurement).filter(
        SpeedMeasurement.timestamp >= cutoff_1h
    ).all()
    failed_tests = sum(1 for r in recent_measurements if r.is_outage)
    total_tests  = len(recent_measurements)

    recent_reports = db.query(CommunityReport).filter(
        CommunityReport.timestamp >= cutoff_6h
    ).count()

    open_events = db.query(OutageEvent).filter(
        OutageEvent.is_resolved == False
    ).count()

    # Weighted confidence calculation
    test_score    = (failed_tests / max(total_tests, 1)) * 50   # max 50 pts
    report_score  = min(30.0, recent_reports * 5)               # max 30 pts
    event_score   = min(20.0, open_events * 10)                 # max 20 pts
    confidence    = round(min(100.0, test_score + report_score + event_score), 1)

    if confidence >= 80:   level = "critical"
    elif confidence >= 60: level = "high"
    elif confidence >= 40: level = "medium"
    elif confidence >= 20: level = "low"
    else:                  level = "none"

    sources = []
    if failed_tests > 0:
        sources.append(f"{failed_tests} failed speed test{'s' if failed_tests != 1 else ''} in last hour")
    if recent_reports > 0:
        sources.append(f"{recent_reports} community report{'s' if recent_reports != 1 else ''} in last 6h")
    if open_events > 0:
        sources.append(f"{open_events} open outage event{'s' if open_events != 1 else ''}")

    return {
        "confidence": confidence,
        "level": level,
        "is_outage": confidence >= 50,
        "sources": sources,
        "failed_tests_1h": failed_tests,
        "total_tests_1h": total_tests,
        "community_reports_6h": recent_reports,
        "open_outage_events": open_events,
        "checked_at": datetime.utcnow().isoformat(),
    }


# ─── Community Verification ────────────────────────────────────────────────────

class ReportResponseFull(BaseModel):
    id: int
    timestamp: datetime
    isp: str
    location: str
    latitude: float
    longitude: float
    issue_type: str
    description: str
    status: str
    confirmations: int
    rejections: int

    class Config:
        from_attributes = True


@router.get("/reports/{report_id}", response_model=ReportResponseFull, tags=["reports"],
            summary="Get single report", description="Fetch a single community report including verification counts.")
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(CommunityReport).filter(CommunityReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.post("/reports/{report_id}/confirm", response_model=ReportResponseFull, tags=["reports"],
             summary="Confirm a community report", description="Increment the confirmation count. When confirmations reach 3 the status becomes 'confirmed'.")
def confirm_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(CommunityReport).filter(CommunityReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.confirmations = (report.confirmations or 0) + 1
    if report.confirmations >= 3:
        report.status = "confirmed"
    db.commit()
    db.refresh(report)
    return report


@router.post("/reports/{report_id}/reject", response_model=ReportResponseFull, tags=["reports"],
             summary="Reject a community report", description="Increment the rejection count. When rejections exceed confirmations by 3 the status becomes 'resolved' (dismissed).")
def reject_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(CommunityReport).filter(CommunityReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.rejections = (report.rejections or 0) + 1
    if report.rejections - (report.confirmations or 0) >= 3:
        report.status = "resolved"
    db.commit()
    db.refresh(report)
    return report


# ─── Network Diagnostics ─────────────────────────────────────────────────────

@router.get("/my-connection", tags=["network"],
            summary="My connection info", description="Returns the caller's public IP address, detected ISP, country, city, and ASN via IP geolocation. Also includes the last speed test result for this session.")
def get_my_connection(request: Request, db: Session = Depends(get_db)):
    import httpx

    # ── Resolve client IP (works behind Fly.io proxy) ────────────────────────
    import re
    forwarded = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    # Basic validation: only allow valid IPv4 / IPv6 characters to prevent injection
    if not re.match(r'^[0-9a-fA-F.:]{2,45}$', client_ip):
        client_ip = "unknown"

    # ── IP geolocation via ip-api.com (free tier — HTTP only, server-side call) ─
    # Note: ip-api.com free tier does not support HTTPS; this is a server-to-server
    # lookup. The frontend calls ip-api.com directly from the browser for display.
    geo: dict = {}
    if client_ip not in ("unknown", "127.0.0.1", "::1"):
        try:
            r = httpx.get(
                f"http://ip-api.com/json/{client_ip}",
                params={"fields": "status,country,countryCode,regionName,city,isp,org,as,query"},
                timeout=5,
            )
            if r.status_code == 200:
                geo = r.json()
        except Exception:
            pass

    # ── Last speed test from DB ───────────────────────────────────────────────
    last = (
        db.query(SpeedMeasurement)
        .order_by(SpeedMeasurement.timestamp.desc())
        .first()
    )

    return {
        "public_ip":          geo.get("query") or client_ip,
        "isp":                geo.get("isp") or (last.isp if last else "Unknown"),
        "org":                geo.get("org"),
        "asn":                geo.get("as"),
        "country":            geo.get("country"),
        "country_code":       geo.get("countryCode"),
        "region":             geo.get("regionName"),
        "city":               geo.get("city"),
        "last_measured_isp":  last.isp if last else None,
        "last_download_mbps": round(last.download_speed, 2) if last else None,
        "last_upload_mbps":   round(last.upload_speed, 2) if last else None,
        "last_ping_ms":       round(last.ping, 1) if last else None,
        "last_test_at":       last.timestamp.isoformat() if last else None,
        "checked_at":         datetime.utcnow().isoformat(),
    }


@router.get("/diagnostics", tags=["network"],
            summary="Network diagnostics", description="DNS resolution time, HTTP latency to major servers (Google, Cloudflare, OpenDNS). No root required.")
def get_diagnostics():
    import socket
    import httpx

    targets = [
        {"name": "Google DNS",     "host": "8.8.8.8",        "url": "https://dns.google/"},
        {"name": "Cloudflare DNS", "host": "1.1.1.1",        "url": "https://1.1.1.1/"},
        {"name": "Google",         "host": "google.com",      "url": "https://www.google.com/"},
        {"name": "Cloudflare",     "host": "cloudflare.com",  "url": "https://www.cloudflare.com/"},
    ]

    results = []
    for t in targets:
        # DNS resolution
        dns_ms = None
        try:
            t0 = time.perf_counter()
            socket.getaddrinfo(t["host"], 443)
            dns_ms = round((time.perf_counter() - t0) * 1000, 1)
        except Exception:
            pass

        # HTTP latency (first-byte)
        http_ms = None
        status_code = None
        try:
            t0 = time.perf_counter()
            r = httpx.get(t["url"], timeout=5, follow_redirects=True)
            http_ms = round((time.perf_counter() - t0) * 1000, 1)
            status_code = r.status_code
        except Exception:
            pass

        reachable = http_ms is not None
        results.append({
            "name":        t["name"],
            "host":        t["host"],
            "reachable":   reachable,
            "dns_ms":      dns_ms,
            "http_ms":     http_ms,
            "status_code": status_code,
        })

    reachable_count = sum(1 for r in results if r["reachable"])
    if reachable_count == len(results):
        connectivity = "full"
    elif reachable_count >= len(results) // 2:
        connectivity = "partial"
    else:
        connectivity = "none"

    avg_http = None
    valid_http = [r["http_ms"] for r in results if r["http_ms"] is not None]
    if valid_http:
        avg_http = round(sum(valid_http) / len(valid_http), 1)

    return {
        "connectivity": connectivity,
        "reachable":    reachable_count,
        "total_targets": len(results),
        "avg_latency_ms": avg_http,
        "targets": results,
        "checked_at": datetime.utcnow().isoformat(),
    }


# ─── AI Insights (Statistical Pattern Analysis) ───────────────────────────────

@router.get("/ai-insights", tags=["stats"],
            summary="AI-powered network insights", description="Statistical pattern analysis: peak congestion hours, recurring outage windows, speed trends, and optimal testing times. No external ML needed.")
def get_ai_insights(
    hours: int = Query(168, ge=24, le=settings.MAX_HISTORY_HOURS),
    db: Session = Depends(get_db),
):
    from collections import defaultdict
    import statistics

    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff).all()

    if len(rows) < 3:
        return {
            "insights": [],
            "peak_congestion_hours": [],
            "best_hours": [],
            "trend": "insufficient_data",
            "trend_pct": None,
            "data_points": len(rows),
            "hours_analyzed": hours,
            "overall_avg_download": None,
            "hourly_averages": {},
        }

    # ── Hourly aggregation ────────────────────────────────────────────────────
    hourly: dict = defaultdict(list)
    for r in rows:
        hourly[r.timestamp.hour].append(r.download_speed)

    hourly_avg = {
        h: round(statistics.mean(speeds), 2)
        for h, speeds in hourly.items()
        if len(speeds) >= 1
    }

    if not hourly_avg:
        overall_avg = sum(r.download_speed for r in rows) / len(rows)
    else:
        overall_avg = sum(hourly_avg.values()) / len(hourly_avg)

    # Peak congestion = hours where avg is >20% below overall
    congestion_threshold = overall_avg * 0.8
    peak_hours = sorted(
        [h for h, avg in hourly_avg.items() if avg < congestion_threshold],
        key=lambda h: hourly_avg[h]
    )

    # Best hours = top 3 by avg speed
    best_hours = sorted(hourly_avg.keys(), key=lambda h: hourly_avg[h], reverse=True)[:3]

    # ── Speed trend (first half vs second half of period) ─────────────────────
    sorted_rows = sorted(rows, key=lambda r: r.timestamp)
    half = len(sorted_rows) // 2
    first_half_avg  = sum(r.download_speed for r in sorted_rows[:half])  / half
    second_half_avg = sum(r.download_speed for r in sorted_rows[half:])  / max(len(sorted_rows) - half, 1)
    trend_pct = round(((second_half_avg - first_half_avg) / max(first_half_avg, 0.01)) * 100, 1)

    if trend_pct > 5:    trend = "improving"
    elif trend_pct < -5: trend = "degrading"
    else:                trend = "stable"

    # ── Recurring outages (same hour, multiple days) ──────────────────────────
    outage_hours: dict = defaultdict(int)
    for r in rows:
        if r.is_outage:
            outage_hours[r.timestamp.hour] += 1

    recurring_outage_hours = sorted(
        [h for h, cnt in outage_hours.items() if cnt >= 3],
        key=lambda h: outage_hours[h], reverse=True
    )[:3]

    # ── Build natural-language insights ──────────────────────────────────────
    insights = []

    if peak_hours:
        hrs_str = ", ".join(f"{h:02d}:00" for h in peak_hours[:3])
        insights.append({
            "type":     "congestion",
            "severity": "warning",
            "title":    "Peak Congestion Detected",
            "message":  f"Your speeds drop during {hrs_str}. This is likely caused by network congestion in your area.",
            "data":     {"hours": peak_hours[:3], "avg_speeds": {str(h): hourly_avg.get(h) for h in peak_hours[:3]}},
        })

    if recurring_outage_hours:
        hrs_str = ", ".join(f"{h:02d}:00" for h in recurring_outage_hours)
        insights.append({
            "type":     "recurring_outage",
            "severity": "error",
            "title":    "Recurring Outage Pattern",
            "message":  f"Outages frequently occur around {hrs_str}. Consider scheduling important tasks outside these windows.",
            "data":     {"hours": recurring_outage_hours, "counts": {str(h): outage_hours[h] for h in recurring_outage_hours}},
        })

    if trend == "degrading":
        insights.append({
            "type":     "trend",
            "severity": "warning",
            "title":    "Speed Degradation Trend",
            "message":  f"Your average download speed has declined by {abs(trend_pct)}% over the analysis period. Consider contacting your ISP.",
            "data":     {"trend_pct": trend_pct},
        })
    elif trend == "improving":
        insights.append({
            "type":     "trend",
            "severity": "info",
            "title":    "Speed Improving",
            "message":  f"Your speeds have improved by {trend_pct}% recently.",
            "data":     {"trend_pct": trend_pct},
        })

    if best_hours:
        hrs_str = ", ".join(f"{h:02d}:00" for h in best_hours)
        insights.append({
            "type":     "optimal_time",
            "severity": "info",
            "title":    "Best Times to Use Internet",
            "message":  f"Your connection is fastest around {hrs_str}. Schedule large downloads or video calls during these times.",
            "data":     {"hours": best_hours, "avg_speeds": {str(h): hourly_avg.get(h) for h in best_hours}},
        })

    total_outages = sum(1 for r in rows if r.is_outage)
    outage_pct = round((total_outages / len(rows)) * 100, 1)
    if outage_pct > 10:
        insights.append({
            "type":     "reliability",
            "severity": "error",
            "title":    "High Outage Rate",
            "message":  f"{outage_pct}% of measurements in the last {hours}h were outages. Your connection reliability is below acceptable levels.",
            "data":     {"outage_pct": outage_pct, "total_outages": total_outages},
        })

    return {
        "insights": insights,
        "peak_congestion_hours": peak_hours[:5],
        "best_hours": best_hours,
        "trend": trend,
        "trend_pct": trend_pct,
        "hourly_averages": {str(h): v for h, v in sorted(hourly_avg.items())},
        "data_points": len(rows),
        "hours_analyzed": hours,
        "overall_avg_download": round(overall_avg, 2),
    }
