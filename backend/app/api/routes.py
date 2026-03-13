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
from ..services.ml_predictions import NetworkPredictor

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


# ─── Per-device client ID ─────────────────────────────────────────────────────

import re as _re
_UUID_RE = _re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    _re.IGNORECASE,
)

def get_client_id(x_client_id: str = Header(default="")) -> Optional[str]:
    """Extract and validate the X-Client-ID header (UUID v4 format).
    Returns None if missing or malformed — callers must handle the empty case."""
    if x_client_id and _UUID_RE.match(x_client_id):
        return x_client_id.lower()
    return None


def _scope(query, client_id: Optional[str]):
    """Apply client_id filter to a SpeedMeasurement query.
    If no client_id provided, return nothing — never leak other users' data."""
    if not client_id:
        return query.filter(False)
    return query.filter(SpeedMeasurement.client_id == client_id)


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
    client_id: Optional[str] = Depends(get_client_id),
):
    return (
        _scope(db.query(SpeedMeasurement), client_id)
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
    client_id: Optional[str] = Depends(get_client_id),
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    return (
        _scope(db.query(SpeedMeasurement), client_id)
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
    client_id: Optional[str] = Depends(get_client_id),
):
    """Aggregated summary for a given time window."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        _scope(db.query(SpeedMeasurement), client_id)
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
def get_alerts(db: Session = Depends(get_db), client_id: Optional[str] = Depends(get_client_id)):
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

    # Also fall back to latest measurement for this device if no outage events recorded yet
    if not current_outage:
        latest = (
            _scope(db.query(SpeedMeasurement), client_id)
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
    client_id: Optional[str] = Depends(get_client_id),
):
    return (
        _scope(db.query(SpeedMeasurement), client_id)
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
            summary="Live network usage", description="Active TCP connections per process. Bandwidth (download_mbps/upload_mbps) is measured client-side via /bandwidth-probe. Uses psutil — no root required.")
def get_network_usage():
    """
    Returns per-process active TCP connections and interface totals.
    Bandwidth figures (download_mbps / upload_mbps) are intentionally null —
    they are measured in the browser via /bandwidth-probe for accuracy.
    """
    try:
        import psutil

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
            "download_mbps": None,   # measured client-side via /bandwidth-probe
            "upload_mbps":   None,   # measured client-side via /bandwidth-probe
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


# ─── Bandwidth probe (browser-side speed measurement) ────────────────────────

@router.get("/bandwidth-probe", tags=["network"], include_in_schema=False)
def bandwidth_probe_download(size_kb: int = Query(default=256, ge=4, le=512)):
    """
    Returns a fixed-size binary response so the browser can time the download
    and compute the user's real connection speed in Mbps.
    Cache-Control is set to no-store to prevent CDN / proxy caching.
    """
    from fastapi.responses import Response as _RawResponse
    payload = b"\x00" * (min(size_kb, 512) * 1024)
    return _RawResponse(
        content=payload,
        media_type="application/octet-stream",
        headers={"Cache-Control": "no-store, no-cache", "Pragma": "no-cache"},
    )


@router.post("/bandwidth-probe", tags=["network"], include_in_schema=False)
async def bandwidth_probe_upload(request: Request):
    """
    Accepts any body so the browser can time the upload round-trip
    and compute the user's real upload speed in Mbps.
    """
    _ = await request.body()  # consume and discard
    return {"ok": True}


# ─── Clear all measurements ──────────────────────────────────────────────────

@router.delete("/measurements", status_code=200, tags=["measurements"],
               summary="Clear all measurements",
               description="Permanently deletes all speed test records and associated outage events. **Requires `X-Admin-Key` header.** Irreversible.")
def clear_measurements(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_key),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Delete speed measurements — scoped to the caller's client_id if provided, else all."""
    q = db.query(SpeedMeasurement)
    if client_id:
        q = q.filter(SpeedMeasurement.client_id == client_id)
    deleted = q.delete(synchronize_session=False)
    if not client_id:
        db.query(OutageEvent).delete(synchronize_session=False)
    db.commit()
    logger.info("Cleared measurements (client=%s, %d rows deleted)", client_id, deleted)
    return {"deleted": deleted, "message": "Measurements cleared."}


# ─── On-demand speed test ─────────────────────────────────────────────────────

@router.post("/test-now", response_model=MeasurementResponse, tags=["speed-test"],
             summary="Run speed test now", description="Triggers an immediate speed test (runs in a thread-pool so the event loop is never blocked). Rate-limited to 5 requests per 60 seconds per IP.")
async def run_test_now(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    try:
        service = SpeedTestService()
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, service.measure_speeds)
        return SpeedTestService._save(db, result, location, lat, lon, client_id)
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
    client_id: Optional[str] = Depends(get_client_id),
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = _scope(db.query(SpeedMeasurement), client_id).filter(SpeedMeasurement.timestamp >= cutoff).all()

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
    client_id: Optional[str] = Depends(get_client_id),
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    timeline: list = []

    # ── 1. Discrete OutageEvent records (created by scheduler) ────────────────
    oe_rows = (
        db.query(OutageEvent)
        .filter(OutageEvent.started_at >= cutoff)
        .order_by(desc(OutageEvent.started_at))
        .all()
    )
    oe_ids = set()
    for e in oe_rows:
        oe_ids.add(e.id)
        dur = None
        if e.ended_at and e.started_at:
            dur = round((e.ended_at - e.started_at).total_seconds() / 60, 1)
        if e.avg_download is None or e.avg_download == 0:
            severity, event_type = "critical", "outage"
        elif e.avg_download < 0.5:
            severity, event_type = "high", "outage"
        elif not e.is_resolved:
            severity, event_type = "medium", "degradation"
        else:
            severity, event_type = "low", "recovery"
        timeline.append({
            "id": f"oe-{e.id}",
            "event_type": event_type,
            "severity": severity,
            "started_at": e.started_at.isoformat(),
            "ended_at": e.ended_at.isoformat() if e.ended_at else None,
            "isp": e.isp,
            "location": e.location,
            "avg_download": round(e.avg_download, 2) if e.avg_download is not None else None,
            "duration_minutes": dur,
            "is_resolved": e.is_resolved,
            "measurement_count": e.measurement_count,
        })

    # ── 2. Derive events from SpeedMeasurement history ────────────────────────
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )

    if measurements:
        normal = [m for m in measurements if not m.is_outage and m.download_speed > 0]
        baseline = (sum(m.download_speed for m in normal) / len(normal)) if normal else 1.0

        OUTAGE_THR      = 0.10   # < 10 % of baseline = outage
        DEGRADE_THR     = 0.60   # < 60 % of baseline = degradation
        RECOVER_THR     = 0.80   # ≥ 80 % = back to normal

        prev_state   = "normal"
        group: list  = []

        def _flush(state: str, grp: list, resolved: bool) -> Optional[dict]:
            if not grp:
                return None
            avg_dl = round(sum(m.download_speed for m in grp) / len(grp), 2)
            avg_ul = round(sum(m.upload_speed  for m in grp) / len(grp), 2)
            avg_pg = round(sum(m.ping           for m in grp) / len(grp), 1)
            start  = grp[0].timestamp
            end    = grp[-1].timestamp
            dur    = round((end - start).total_seconds() / 60, 1)
            if state == "outage":
                etype, sev = "outage", ("critical" if avg_dl < baseline * 0.02 else "high")
            else:
                etype, sev = "degradation", ("high" if avg_dl < baseline * 0.30 else "medium")
            return {
                "id": f"sm-{grp[0].id}",
                "event_type": etype,
                "severity": sev,
                "started_at": start.isoformat(),
                "ended_at": end.isoformat(),
                "isp": grp[0].isp,
                "location": grp[0].location,
                "avg_download": avg_dl,
                "avg_upload": avg_ul,
                "avg_ping": avg_pg,
                "duration_minutes": dur,
                "is_resolved": resolved,
                "measurement_count": len(grp),
            }

        for m in measurements:
            if m.is_outage or m.download_speed < baseline * OUTAGE_THR:
                state = "outage"
            elif m.download_speed < baseline * DEGRADE_THR:
                state = "degradation"
            else:
                state = "normal"

            if state != prev_state:
                if prev_state in ("outage", "degradation"):
                    ev = _flush(prev_state, group, resolved=True)
                    if ev:
                        timeline.append(ev)
                    # Add a recovery marker when returning to normal
                    if state == "normal":
                        timeline.append({
                            "id": f"rec-{m.id}",
                            "event_type": "recovery",
                            "severity": "low",
                            "started_at": m.timestamp.isoformat(),
                            "ended_at": m.timestamp.isoformat(),
                            "isp": m.isp,
                            "location": m.location,
                            "avg_download": round(m.download_speed, 2),
                            "duration_minutes": 0,
                            "is_resolved": True,
                            "measurement_count": 1,
                        })
                group = [m]
            else:
                group.append(m)
            prev_state = state

        # Flush last open group
        if prev_state in ("outage", "degradation") and group:
            ev = _flush(prev_state, group, resolved=False)
            if ev:
                timeline.append(ev)

        # ── 3. Speed-change snapshots (every measurement becomes a record) ────
        # This ensures the timeline always has data, not just when there's an outage.
        for m in reversed(measurements):  # newest first
            timeline.append({
                "id": f"snap-{m.id}",
                "event_type": "outage" if m.is_outage else (
                    "degradation" if m.download_speed < baseline * DEGRADE_THR else "recovery"
                ),
                "severity": (
                    "critical" if m.is_outage and m.download_speed < baseline * 0.02 else
                    "high"     if m.is_outage or m.download_speed < baseline * OUTAGE_THR else
                    "medium"   if m.download_speed < baseline * DEGRADE_THR else
                    "low"
                ),
                "started_at": m.timestamp.isoformat(),
                "ended_at": m.timestamp.isoformat(),
                "isp": m.isp,
                "location": m.location,
                "avg_download": round(m.download_speed, 2),
                "avg_upload": round(m.upload_speed, 2),
                "avg_ping": round(m.ping, 1),
                "duration_minutes": None,
                "is_resolved": True,
                "measurement_count": 1,
            })

    # ── 4. Community reports ───────────────────────────────────────────────────
    cr_rows = (
        db.query(CommunityReport)
        .filter(CommunityReport.timestamp >= cutoff)
        .order_by(desc(CommunityReport.timestamp))
        .limit(20)
        .all()
    )
    for r in cr_rows:
        sev_map = {"outage": "high", "slow": "medium", "intermittent": "medium"}
        timeline.append({
            "id": f"cr-{r.id}",
            "event_type": "degradation" if r.issue_type != "outage" else "outage",
            "severity": sev_map.get(r.issue_type, "medium"),
            "started_at": r.timestamp.isoformat(),
            "ended_at": None,
            "isp": r.isp,
            "location": r.location,
            "avg_download": None,
            "duration_minutes": None,
            "is_resolved": r.status == "resolved",
            "measurement_count": r.confirmations + 1,
        })

    # ── Sort newest-first, deduplicate by id ──────────────────────────────────
    seen: set = set()
    unique: list = []
    for ev in sorted(timeline, key=lambda x: x["started_at"], reverse=True):
        if ev["id"] not in seen:
            seen.add(ev["id"])
            unique.append(ev)

    return {"days": days, "total": len(unique), "events": unique}


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
def get_outage_confidence(db: Session = Depends(get_db), client_id: Optional[str] = Depends(get_client_id)):
    cutoff_1h  = datetime.utcnow() - timedelta(hours=1)
    cutoff_6h  = datetime.utcnow() - timedelta(hours=6)

    recent_measurements = _scope(db.query(SpeedMeasurement), client_id).filter(
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
def get_my_connection(request: Request, db: Session = Depends(get_db), client_id: Optional[str] = Depends(get_client_id)):
    import httpx
    import re

    PRIVATE_PREFIXES = ("127.", "10.", "192.168.", "::1", "::ffff:127.", "localhost")

    def _is_private(ip: str) -> bool:
        return ip in ("unknown", "") or any(ip.startswith(p) for p in PRIVATE_PREFIXES)

    def _clean_ip(raw: str) -> str:
        """Extract first valid public IP from a comma-separated Forwarded header."""
        for candidate in raw.split(","):
            ip = candidate.strip()
            # Unwrap IPv6-mapped IPv4  (::ffff:1.2.3.4)
            if ip.lower().startswith("::ffff:"):
                ip = ip[7:]
            if re.match(r'^[0-9a-fA-F.:]{2,45}$', ip) and not _is_private(ip):
                return ip
        return ""

    # ── Resolve real client IP — check all common proxy headers ──────────────
    client_ip = ""
    for header in ("Fly-Client-IP", "CF-Connecting-IP", "X-Real-IP", "X-Forwarded-For"):
        val = request.headers.get(header, "")
        if val:
            candidate = _clean_ip(val)
            if candidate:
                client_ip = candidate
                break

    # Final fallback: direct connection IP
    if not client_ip:
        direct = request.client.host if request.client else ""
        client_ip = direct if not _is_private(direct) else ""

    # ── IP geolocation — try ip-api.com first, ipapi.co as fallback ──────────
    geo: dict = {}
    if client_ip:
        # Provider 1: ip-api.com (HTTP, free, fast)
        try:
            r = httpx.get(
                f"http://ip-api.com/json/{client_ip}",
                params={"fields": "status,country,countryCode,regionName,city,isp,org,as,query,lat,lon"},
                timeout=5,
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("status") == "success":
                    geo = {
                        "query":       data.get("query", client_ip),
                        "country":     data.get("country"),
                        "countryCode": data.get("countryCode"),
                        "regionName":  data.get("regionName"),
                        "city":        data.get("city"),
                        "isp":         data.get("isp"),
                        "org":         data.get("org"),
                        "as":          data.get("as"),
                        "lat":         data.get("lat"),
                        "lon":         data.get("lon"),
                    }
        except Exception:
            pass

        # Provider 2 fallback: ipapi.co (HTTPS, no API key needed)
        if not geo:
            try:
                r2 = httpx.get(
                    f"https://ipapi.co/{client_ip}/json/",
                    headers={"User-Agent": "curl/7.68.0"},
                    timeout=5,
                )
                if r2.status_code == 200:
                    d2 = r2.json()
                    if not d2.get("error"):
                        geo = {
                            "query":       d2.get("ip", client_ip),
                            "country":     d2.get("country_name"),
                            "countryCode": d2.get("country_code"),
                            "regionName":  d2.get("region"),
                            "city":        d2.get("city"),
                            "isp":         d2.get("org"),
                            "org":         d2.get("org"),
                            "as":          d2.get("asn"),
                            "lat":         d2.get("latitude"),
                            "lon":         d2.get("longitude"),
                        }
            except Exception:
                pass

    # ── Last speed test from DB (scoped to this client so new users see empty) ──
    last_q = db.query(SpeedMeasurement).order_by(SpeedMeasurement.timestamp.desc())
    if client_id:
        last_q = last_q.filter(SpeedMeasurement.client_id == client_id)
    else:
        last_q = last_q.filter(False)   # no client_id → never leak other users' data
    last = last_q.first()

    return {
        "public_ip":          geo.get("query") or client_ip or "Unknown",
        "isp":                geo.get("isp") or (last.isp if last else None),
        "org":                geo.get("org"),
        "asn":                geo.get("as"),
        "country":            geo.get("country"),
        "country_code":       geo.get("countryCode"),
        "region":             geo.get("regionName"),
        "city":               geo.get("city"),
        "lat":                geo.get("lat"),
        "lon":                geo.get("lon"),
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
    client_id: Optional[str] = Depends(get_client_id),
):
    from collections import defaultdict
    import statistics

    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = _scope(db.query(SpeedMeasurement), client_id).filter(SpeedMeasurement.timestamp >= cutoff).all()

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


# ─── Congestion heatmap ──────────────────────────────────────────────────────

@router.get("/congestion-heatmap", tags=["insights"],
            summary="Congestion heatmap",
            description="7-day × 24-hour grid of average download speed.")
def get_congestion_heatmap(
    days: int = Query(default=28, ge=7, le=90),
    client_id: Optional[str] = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    rows = _scope(
        db.query(SpeedMeasurement.timestamp, SpeedMeasurement.download_speed),
        client_id,
    ).filter(SpeedMeasurement.timestamp >= since).all()

    grid: dict = {}
    for ts, dl in rows:
        if dl is None:
            continue
        dow = ts.weekday()
        hr  = ts.hour
        grid.setdefault(dow, {}).setdefault(hr, []).append(dl)

    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    cells = []
    for dow in range(7):
        for hr in range(24):
            vals = grid.get(dow, {}).get(hr, [])
            avg  = round(sum(vals) / len(vals), 2) if vals else None
            cells.append({"day": dow, "day_name": DAY_NAMES[dow], "hour": hr,
                          "avg_mbps": avg, "samples": len(vals)})

    return {"cells": cells, "days_analyzed": days, "total_samples": len(rows)}


# ─── Historical comparison ────────────────────────────────────────────────────

@router.get("/comparison", tags=["stats"],
            summary="Week-over-week comparison",
            description="Compares avg download/upload/ping and outage count between this week and last week.")
def get_comparison(
    client_id: Optional[str] = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    w1_start = now - timedelta(days=7)
    w2_start = now - timedelta(days=14)

    def _stats(since, until):
        rows = _scope(db.query(SpeedMeasurement), client_id).filter(
            SpeedMeasurement.timestamp >= since,
            SpeedMeasurement.timestamp < until,
        ).all()
        if not rows:
            return None
        dls   = [r.download_speed for r in rows if r.download_speed is not None]
        uls   = [r.upload_speed   for r in rows if r.upload_speed   is not None]
        pings = [r.ping           for r in rows if r.ping           is not None]
        out   = sum(1 for r in rows if r.is_outage)
        return {
            "avg_download": round(sum(dls)/len(dls),   2) if dls   else None,
            "avg_upload":   round(sum(uls)/len(uls),   2) if uls   else None,
            "avg_ping":     round(sum(pings)/len(pings),1) if pings else None,
            "outages":      out,
            "total":        len(rows),
            "uptime_pct":   round((1 - out / len(rows)) * 100, 1),
        }

    this_week = _stats(w1_start, now)
    last_week = _stats(w2_start, w1_start)

    def _pct(cur, prev, k):
        if not cur or not prev: return None
        c, p = cur.get(k), prev.get(k)
        if c is None or p is None or p == 0: return None
        return round(((c - p) / p) * 100, 1)

    return {
        "this_week": this_week,
        "last_week": last_week,
        "delta": {
            "download_pct":  _pct(this_week, last_week, "avg_download"),
            "upload_pct":    _pct(this_week, last_week, "avg_upload"),
            "ping_pct":      _pct(this_week, last_week, "avg_ping"),
            "outages_delta": (
                (this_week["outages"] - last_week["outages"])
                if (this_week and last_week) else None
            ),
        },
        "generated_at": now.isoformat(),
    }


# ─── Anomaly detection ───────────────────────────────────────────────────────

@router.get("/anomalies", tags=["insights"],
            summary="Speed anomaly detection",
            description="Returns measurements that are >2 standard deviations from the mean (statistical outliers).")
def get_anomalies(
    hours: int = Query(default=168, ge=1, le=720),
    client_id: Optional[str] = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    import math as _math
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = _scope(db.query(SpeedMeasurement), client_id).filter(
        SpeedMeasurement.timestamp >= since
    ).order_by(desc(SpeedMeasurement.timestamp)).all()

    if len(rows) < 5:
        return {"anomalies": [], "total_checked": len(rows),
                "message": "Need ≥5 data points for anomaly detection."}

    dls  = [r.download_speed for r in rows if r.download_speed is not None]
    mean = sum(dls) / len(dls)
    var  = sum((x - mean) ** 2 for x in dls) / len(dls)
    std  = _math.sqrt(var) if var > 0 else 0

    anomalies = []
    for r in rows:
        if r.download_speed is None or std == 0:
            continue
        z = (r.download_speed - mean) / std
        if abs(z) > 2.0:
            anomalies.append({
                "id":             r.id,
                "timestamp":      r.timestamp.isoformat(),
                "download_speed": round(r.download_speed, 2),
                "upload_speed":   round(r.upload_speed, 2) if r.upload_speed else None,
                "ping":           round(r.ping, 1) if r.ping else None,
                "z_score":        round(z, 2),
                "type":           "spike" if z > 0 else "drop",
                "is_outage":      r.is_outage,
            })

    return {
        "anomalies":      anomalies[:50],
        "total_checked":  len(rows),
        "mean_mbps":      round(mean, 2),
        "std_mbps":       round(std, 2),
        "threshold":      "±2σ",
        "hours_analyzed": hours,
    }


# ─── Traceroute ──────────────────────────────────────────────────────────────

@router.get("/traceroute", tags=["network"],
            summary="Traceroute from server",
            description="Runs traceroute/tracepath from the Fly.io server to a target host (max 20 hops, 2s timeout). Accepts any valid hostname or IP address.")
def run_traceroute(host: str = Query(default="8.8.8.8", description="Target hostname or IP address")):
    import subprocess as _sp
    import re

    # Validate host: allow hostnames, IPv4, and IPv6
    # Hostname: alphanumeric + dots + hyphens
    # IPv4: standard dotted notation
    # IPv6: standard colon notation
    HOSTNAME_PATTERN = r'^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'
    IPV4_PATTERN = r'^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
    IPV6_PATTERN = r'^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::)$'
    
    if not host or len(host) > 253:
        raise HTTPException(status_code=400, detail="Invalid host: must be 1-253 characters")
    
    is_valid = (
        re.match(HOSTNAME_PATTERN, host) or 
        re.match(IPV4_PATTERN, host) or 
        re.match(IPV6_PATTERN, host)
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=400, 
            detail="Invalid host format. Must be a valid hostname, IPv4, or IPv6 address."
        )

    # Try traceroute first, then fall back to tracepath
    commands = [
        ["traceroute", "-n", "-m", "20", "-w", "2", host],
        ["tracepath", "-n", "-m", "20", host],
    ]
    
    for cmd in commands:
        try:
            logger.info(f"Running traceroute to {host} using {cmd[0]}")
            res = _sp.run(
                cmd, 
                capture_output=True, 
                text=True, 
                timeout=35,
                check=False  # Don't raise on non-zero exit
            )
            
            # Check if we got any output
            if res.stdout.strip():
                hops = [line.strip() for line in res.stdout.splitlines() if line.strip()]
                return {
                    "host": host,
                    "hops": hops,
                    "tool": cmd[0],
                    "raw": res.stdout,
                    "success": True,
                    "hop_count": len(hops),
                }
        except _sp.TimeoutExpired:
            logger.warning(f"Traceroute to {host} timed out using {cmd[0]}")
            continue
        except FileNotFoundError:
            logger.warning(f"{cmd[0]} not found, trying next tool")
            continue
        except Exception as e:
            logger.error(f"Traceroute failed with {cmd[0]}: {e}")
            continue

    # If we get here, all methods failed
    raise HTTPException(
        status_code=503, 
        detail="Traceroute tools (traceroute/tracepath) are not available on this server. "
               "Install them with: apt-get install traceroute iputils-tracepath"
    )


# ─── Shareable report snapshots ───────────────────────────────────────────────

import json as _json
import hashlib as _hashlib

_snapshots: dict = {}


@router.post("/snapshots", tags=["insights"],
             summary="Create shareable snapshot",
             description="Saves a JSON payload and returns a short ID for sharing.")
async def create_snapshot(request: Request):
    body = await request.body()
    if len(body) > 32 * 1024:
        raise HTTPException(status_code=413, detail="Snapshot too large (max 32 KB).")
    try:
        data = _json.loads(body)
    except _json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON.")

    snap_id = _hashlib.sha256(body).hexdigest()[:12]
    _snapshots[snap_id] = {"data": data, "created_at": datetime.utcnow().isoformat()}
    if len(_snapshots) > 500:
        del _snapshots[next(iter(_snapshots))]

    return {"id": snap_id, "url": f"/snapshots/{snap_id}"}


@router.get("/snapshots/{snap_id}", tags=["insights"],
            summary="Retrieve snapshot",
            description="Fetches a previously created report snapshot by its ID.")
def get_snapshot(snap_id: str):
    snap = _snapshots.get(snap_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found or expired.")
    return snap


# ─── Multi-region latency ─────────────────────────────────────────────────────

@router.get("/multi-region", tags=["network"],
            summary="Multi-region latency check",
            description="HTTP latency to servers in multiple geographic regions to distinguish local vs global outages.")
def get_multi_region():
    import httpx as _httpx

    REGIONS = [
        {"name": "US East (Cloudflare)",  "url": "https://1.1.1.1",          "region": "us-east"},
        {"name": "Europe (Cloudflare)",   "url": "https://1.0.0.1",          "region": "europe"},
        {"name": "US West (Google DNS)",  "url": "https://8.8.8.8",          "region": "us-west"},
        {"name": "Africa (AFRINIC)",      "url": "https://www.afrinic.net",   "region": "africa"},
        {"name": "Asia (Alibaba DNS)",    "url": "https://223.5.5.5",        "region": "asia"},
        {"name": "Global (AWS)",          "url": "https://aws.amazon.com",   "region": "global"},
    ]

    results = []
    for r in REGIONS:
        t0 = time.time()
        try:
            resp = _httpx.get(r["url"], timeout=5, follow_redirects=True)
            lat  = round((time.time() - t0) * 1000)
            results.append({**r, "latency_ms": lat, "status": resp.status_code, "reachable": True})
        except Exception:
            results.append({**r, "latency_ms": None, "status": None, "reachable": False})

    ok  = [x for x in results if x["reachable"]]
    avg = round(sum(x["latency_ms"] for x in ok) / len(ok)) if ok else None
    return {
        "regions":          results,
        "avg_latency_ms":   avg,
        "reachable_count":  len(ok),
        "total":            len(REGIONS),
        "checked_at":       datetime.utcnow().isoformat(),
    }


# ─── WebSocket live feed ──────────────────────────────────────────────────────

from fastapi import WebSocket, WebSocketDisconnect
import json as _json_ws

_ws_connections: list = []


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """Real-time WebSocket — heartbeat every 10s + broadcasts new measurements."""
    await websocket.accept()
    _ws_connections.append(websocket)
    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=10)
                if msg.strip().lower() == "ping":
                    await websocket.send_text('{"type":"pong"}')
            except asyncio.TimeoutError:
                await websocket.send_text(_json_ws.dumps({
                    "type": "heartbeat",
                    "ts":   datetime.utcnow().isoformat(),
                    "connected_clients": len(_ws_connections),
                }))
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)


async def broadcast_measurement(measurement_dict: dict):
    """Push a new measurement to all connected WebSocket clients."""
    if not _ws_connections:
        return
    payload = _json_ws.dumps({"type": "measurement", "data": measurement_dict})
    dead = []
    for ws in _ws_connections:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _ws_connections:
            _ws_connections.remove(ws)


# ─── Gaming Metrics ───────────────────────────────────────────────────────────

@router.get("/gaming-metrics", tags=["gaming"],
            summary="Gaming quality metrics",
            description="Returns ping, jitter, packet loss, and gaming quality score for competitive gaming.")
def get_gaming_metrics(
    hours: int = Query(1, ge=1, le=24),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Gaming-specific metrics: ping stability, jitter, and quality score."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = _scope(db.query(SpeedMeasurement), client_id).filter(
        SpeedMeasurement.timestamp >= cutoff
    ).all()

    if not rows:
        return {
            "avg_ping": None,
            "min_ping": None,
            "max_ping": None,
            "jitter": None,
            "packet_loss": 0,
            "gaming_score": "N/A",
            "grade": "N/A",
            "recommended_for": [],
            "not_recommended": [],
            "data_points": 0,
        }

    pings = [r.ping for r in rows if r.ping is not None]
    if not pings:
        return {"error": "No ping data available"}

    avg_ping = sum(pings) / len(pings)
    min_ping = min(pings)
    max_ping = max(pings)
    
    # Jitter = standard deviation of ping
    import statistics
    jitter = statistics.stdev(pings) if len(pings) > 1 else 0
    
    # Estimate packet loss from outages
    outages = sum(1 for r in rows if r.is_outage)
    packet_loss = round((outages / len(rows)) * 100, 2)

    # Gaming score calculation
    ping_score = max(0, 100 - avg_ping)  # Lower ping = higher score
    jitter_score = max(0, 100 - (jitter * 5))  # Lower jitter = higher score
    loss_score = max(0, 100 - (packet_loss * 10))  # No loss = 100
    
    gaming_score = round((ping_score * 0.5 + jitter_score * 0.3 + loss_score * 0.2), 1)

    # Grade assignment
    if gaming_score >= 90:   grade = "A+"
    elif gaming_score >= 80: grade = "A"
    elif gaming_score >= 70: grade = "B"
    elif gaming_score >= 60: grade = "C"
    elif gaming_score >= 50: grade = "D"
    else:                    grade = "F"

    # Game recommendations
    recommended = []
    not_recommended = []
    
    games = [
        {"name": "FPS Games (CS:GO, Valorant)", "max_ping": 50, "max_jitter": 10},
        {"name": "MOBA (LoL, Dota 2)", "max_ping": 80, "max_jitter": 15},
        {"name": "Battle Royale (Fortnite, PUBG)", "max_ping": 100, "max_jitter": 20},
        {"name": "Racing Games", "max_ping": 60, "max_jitter": 12},
        {"name": "Fighting Games", "max_ping": 40, "max_jitter": 8},
        {"name": "MMORPGs", "max_ping": 150, "max_jitter": 30},
    ]

    for game in games:
        if avg_ping <= game["max_ping"] and jitter <= game["max_jitter"]:
            recommended.append(game["name"])
        else:
            not_recommended.append({
                "name": game["name"],
                "reason": f"Ping: {avg_ping:.0f}ms (need <{game['max_ping']}ms), Jitter: {jitter:.1f}ms (need <{game['max_jitter']}ms)"
            })

    return {
        "avg_ping": round(avg_ping, 1),
        "min_ping": round(min_ping, 1),
        "max_ping": round(max_ping, 1),
        "jitter": round(jitter, 1),
        "packet_loss": packet_loss,
        "gaming_score": gaming_score,
        "grade": grade,
        "recommended_for": recommended,
        "not_recommended": not_recommended,
        "data_points": len(rows),
        "hours_analyzed": hours,
    }


# ─── Video Call Quality ───────────────────────────────────────────────────────

@router.get("/video-call-quality", tags=["video"],
            summary="Video call quality predictor",
            description="Predicts video call quality for Zoom, Teams, Google Meet based on current connection.")
def predict_video_quality(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Predicts video call quality for different platforms."""
    # Get most recent measurement
    latest = (
        _scope(db.query(SpeedMeasurement), client_id)
        .order_by(desc(SpeedMeasurement.timestamp))
        .first()
    )

    if not latest:
        return {"error": "No speed test data available. Run a test first."}

    download = latest.download_speed
    upload = latest.upload_speed
    ping = latest.ping

    # Platform requirements (Mbps per participant)
    platforms = {
        "zoom": {
            "hd_1080p": {"down": 3.8, "up": 3.0},
            "hd_720p": {"down": 2.6, "up": 1.8},
            "sd": {"down": 1.2, "up": 1.2},
        },
        "teams": {
            "hd_1080p": {"down": 4.0, "up": 4.0},
            "hd_720p": {"down": 2.5, "up": 2.5},
            "sd": {"down": 1.5, "up": 1.5},
        },
        "google_meet": {
            "hd_1080p": {"down": 3.2, "up": 3.2},
            "hd_720p": {"down": 2.2, "up": 2.2},
            "sd": {"down": 1.0, "up": 1.0},
        },
    }

    results = {}
    recommendations = []

    for platform, qualities in platforms.items():
        # Determine best quality
        quality = "sd"
        participants = 1
        
        if download >= qualities["hd_1080p"]["down"] and upload >= qualities["hd_1080p"]["up"]:
            quality = "HD 1080p"
            participants = int(min(download / qualities["hd_1080p"]["down"], 
                                 upload / qualities["hd_1080p"]["up"]))
        elif download >= qualities["hd_720p"]["down"] and upload >= qualities["hd_720p"]["up"]:
            quality = "HD 720p"
            participants = int(min(download / qualities["hd_720p"]["down"],
                                 upload / qualities["hd_720p"]["up"]))
        else:
            quality = "SD"
            participants = int(min(download / qualities["sd"]["down"],
                                 upload / qualities["sd"]["up"]))

        # Status based on ping
        if ping < 100:
            status = "excellent"
        elif ping < 200:
            status = "good"
        else:
            status = "poor"

        results[platform] = {
            "quality": quality,
            "participants": max(1, participants),
            "status": status,
            "ping": round(ping, 1),
        }

    # Generate recommendations
    if download < 5:
        recommendations.append("⚠️ Turn off video to improve call stability")
    if upload < 3:
        recommendations.append("⚠️ Avoid screen sharing, upload speed is low")
    if ping > 150:
        recommendations.append("⚠️ High latency detected, expect audio delays")
    if download >= 25:
        recommendations.append("✅ Your connection can handle HD video for large meetings")
    if results["zoom"]["participants"] > 10:
        recommendations.append("✅ You can host large Zoom meetings with HD video")

    return {
        "current_speed": {
            "download": round(download, 1),
            "upload": round(upload, 1),
            "ping": round(ping, 1),
        },
        "platforms": results,
        "recommendations": recommendations,
        "overall_status": "excellent" if download >= 10 and ping < 100 else "good" if download >= 5 else "poor",
    }


# ─── Router Health Check ──────────────────────────────────────────────────────

@router.get("/router-health", tags=["diagnostics"],
            summary="Router health check",
            description="Detects if your router needs a reboot based on performance degradation patterns.")
def check_router_health(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Detects router issues and recommends reboot if needed."""
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    cutoff_6h = datetime.utcnow() - timedelta(hours=6)
    
    rows_24h = _scope(db.query(SpeedMeasurement), client_id).filter(
        SpeedMeasurement.timestamp >= cutoff_24h
    ).order_by(SpeedMeasurement.timestamp).all()

    if len(rows_24h) < 5:
        return {"error": "Need at least 5 measurements in last 24h for analysis"}

    # Calculate trends
    recent_6h = [r for r in rows_24h if r.timestamp >= cutoff_6h]
    older_18h = [r for r in rows_24h if r.timestamp < cutoff_6h]

    if not recent_6h or not older_18h:
        return {"needs_reboot": False, "confidence": 0, "reasons": [], "recommendation": "Not enough data"}

    # Speed trend
    avg_recent_speed = sum(r.download_speed for r in recent_6h) / len(recent_6h)
    avg_older_speed = sum(r.download_speed for r in older_18h) / len(older_18h)
    speed_change_pct = ((avg_recent_speed - avg_older_speed) / avg_older_speed) * 100 if avg_older_speed > 0 else 0

    # Ping trend
    avg_recent_ping = sum(r.ping for r in recent_6h) / len(recent_6h)
    avg_older_ping = sum(r.ping for r in older_18h) / len(older_18h)
    ping_change = avg_recent_ping - avg_older_ping

    # Disconnections (outages)
    disconnections = sum(1 for r in recent_6h if r.is_outage)

    # Decision logic
    reasons = []
    confidence = 0

    if speed_change_pct < -20:
        reasons.append(f"Speed dropped {abs(speed_change_pct):.0f}% in last 6 hours")
        confidence += 35
    
    if ping_change > 50:
        reasons.append(f"Ping increased by {ping_change:.0f}ms")
        confidence += 30
    
    if disconnections >= 3:
        reasons.append(f"{disconnections} disconnections detected in last 6 hours")
        confidence += 35

    # Check for gradual degradation
    if len(rows_24h) >= 10:
        first_half = rows_24h[:len(rows_24h)//2]
        second_half = rows_24h[len(rows_24h)//2:]
        
        avg_first = sum(r.download_speed for r in first_half) / len(first_half)
        avg_second = sum(r.download_speed for r in second_half) / len(second_half)
        
        if avg_second < avg_first * 0.7:  # 30% drop
            reasons.append("Gradual speed degradation detected over 24 hours")
            confidence += 20

    needs_reboot = confidence >= 50

    # Estimate last reboot (very rough)
    if rows_24h:
        oldest = rows_24h[0].timestamp
        days_ago = (datetime.utcnow() - oldest).days
        last_reboot_estimate = f"{days_ago}+ days ago" if days_ago > 0 else "Less than 24h ago"
    else:
        last_reboot_estimate = "Unknown"

    recommendation = (
        "🔄 Reboot your router now to restore performance" if needs_reboot else
        "✅ Router performance is stable, no reboot needed"
    )

    return {
        "needs_reboot": needs_reboot,
        "confidence": min(confidence, 100),
        "reasons": reasons if reasons else ["No performance issues detected"],
        "last_reboot_estimate": last_reboot_estimate,
        "recommendation": recommendation,
        "metrics": {
            "speed_change_pct": round(speed_change_pct, 1),
            "ping_change_ms": round(ping_change, 1),
            "disconnections": disconnections,
            "avg_recent_speed": round(avg_recent_speed, 1),
            "avg_older_speed": round(avg_older_speed, 1),
        },
    }


# ─── Activity Recommendations ─────────────────────────────────────────────────

@router.get("/activity-recommendations", tags=["recommendations"],
            summary="What can I do right now?",
            description="Real-time activity recommendations based on current network conditions.")
def get_activity_recommendations(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Recommends activities based on current speed and ping."""
    latest = (
        _scope(db.query(SpeedMeasurement), client_id)
        .order_by(desc(SpeedMeasurement.timestamp))
        .first()
    )

    if not latest:
        return {"error": "No speed test data. Run a test first."}

    speed = latest.download_speed
    ping = latest.ping

    activities = [
        {"name": "8K Streaming", "icon": "🎬", "min_speed": 100, "max_ping": 150, "category": "streaming"},
        {"name": "4K Netflix/YouTube", "icon": "📺", "min_speed": 25, "max_ping": 150, "category": "streaming"},
        {"name": "HD Streaming (1080p)", "icon": "🎥", "min_speed": 5, "max_ping": 200, "category": "streaming"},
        {"name": "HD Video Calls (10+ people)", "icon": "👥", "min_speed": 10, "max_ping": 200, "category": "video_calls"},
        {"name": "HD Video Calls (1-5 people)", "icon": "💬", "min_speed": 3, "max_ping": 250, "category": "video_calls"},
        {"name": "Competitive Gaming (FPS)", "icon": "🎮", "min_speed": 5, "max_ping": 50, "category": "gaming"},
        {"name": "Casual Gaming", "icon": "🕹️", "min_speed": 3, "max_ping": 100, "category": "gaming"},
        {"name": "Large File Downloads (10GB+)", "icon": "📥", "min_speed": 50, "max_ping": 500, "category": "downloads"},
        {"name": "File Downloads (1-10GB)", "icon": "⬇️", "min_speed": 10, "max_ping": 500, "category": "downloads"},
        {"name": "Music Streaming", "icon": "🎵", "min_speed": 0.5, "max_ping": 400, "category": "streaming"},
        {"name": "Web Browsing", "icon": "🌐", "min_speed": 1, "max_ping": 300, "category": "browsing"},
        {"name": "Social Media", "icon": "📱", "min_speed": 2, "max_ping": 300, "category": "browsing"},
    ]

    recommended = []
    not_recommended = []

    for activity in activities:
        if speed >= activity["min_speed"] and ping <= activity["max_ping"]:
            recommended.append(activity)
        else:
            reason_parts = []
            if speed < activity["min_speed"]:
                reason_parts.append(f"Need {activity['min_speed']} Mbps (you have {speed:.1f} Mbps)")
            if ping > activity["max_ping"]:
                reason_parts.append(f"Ping too high ({ping:.0f}ms, need <{activity['max_ping']}ms)")
            
            not_recommended.append({
                **activity,
                "reason": ", ".join(reason_parts)
            })

    # Group by category
    from collections import defaultdict
    by_category = defaultdict(list)
    for act in recommended:
        by_category[act["category"]].append(act)

    return {
        "current_speed": round(speed, 1),
        "current_ping": round(ping, 1),
        "recommended": recommended,
        "not_recommended": not_recommended,
        "by_category": dict(by_category),
        "best_activity": recommended[0]["name"] if recommended else "Web browsing only",
        "total_recommended": len(recommended),
        "total_activities": len(activities),
    }


# ─── Is It Just Me? ───────────────────────────────────────────────────────────

@router.get("/is-it-just-me", tags=["diagnostics"],
            summary="Global outage checker",
            description="Checks if other users with same ISP are experiencing issues, or if it's a global problem.")
def check_if_global_outage(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Determines if outage is local, ISP-wide, or global."""
    # Get user's current status
    my_latest = (
        _scope(db.query(SpeedMeasurement), client_id)
        .order_by(desc(SpeedMeasurement.timestamp))
        .first()
    )

    if not my_latest:
        return {"error": "No speed test data. Run a test first."}

    my_isp = my_latest.isp
    my_status = "outage" if my_latest.is_outage else "ok"

    # Check other users with same ISP (last 30 minutes)
    cutoff = datetime.utcnow() - timedelta(minutes=30)
    same_isp_measurements = (
        db.query(SpeedMeasurement)
        .filter(
            SpeedMeasurement.isp == my_isp,
            SpeedMeasurement.timestamp >= cutoff,
            SpeedMeasurement.client_id != client_id  # Exclude self
        )
        .all()
    )

    outage_count = sum(1 for m in same_isp_measurements if m.is_outage)
    total_users = len(set(m.client_id for m in same_isp_measurements if m.client_id))
    total_measurements = len(same_isp_measurements)

    is_widespread = (outage_count / total_measurements > 0.3) if total_measurements > 0 else False

    # Check external services
    import socket
    def check_reachability(host, port=80):
        try:
            socket.create_connection((host, port), timeout=3)
            return True
        except:
            return False

    external_checks = {
        "google": check_reachability("8.8.8.8", 53),
        "cloudflare": check_reachability("1.1.1.1", 53),
        "aws": check_reachability("aws.amazon.com", 443),
    }

    internet_down = not any(external_checks.values())

    # Determine verdict
    if internet_down:
        verdict = "🌍 Global internet issue"
        is_just_you = False
    elif is_widespread:
        verdict = "🏢 ISP-wide outage"
        is_just_you = False
    else:
        verdict = "🏠 Issue with your connection"
        is_just_you = True

    # Recommendation
    if internet_down:
        recommendation = "Major internet backbone issue. Wait it out, nothing you can do."
    elif is_widespread:
        recommendation = f"Contact {my_isp} support. Many users are affected."
    else:
        recommendation = "Try rebooting your router or modem. Issue appears to be local."

    return {
        "is_just_you": is_just_you,
        "verdict": verdict,
        "my_status": my_status,
        "isp": my_isp,
        "affected_users": outage_count,
        "total_users_checked": total_users,
        "total_measurements": total_measurements,
        "outage_percentage": round((outage_count / total_measurements) * 100, 1) if total_measurements > 0 else 0,
        "external_services": external_checks,
        "recommendation": recommendation,
        "checked_at": datetime.utcnow().isoformat(),
    }


# ─── ML Predictions ───────────────────────────────────────────────────────────

@router.get("/predictions/next-hour", tags=["predictions"],
            summary="Predict next hour speed",
            description="ML-based prediction of download/upload speed for the next hour based on historical patterns.")
def predict_next_hour(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Predicts network speed for the next hour using historical patterns."""
    cutoff = datetime.utcnow() - timedelta(days=7)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    
    return NetworkPredictor.predict_next_hour_speed(measurements)


@router.get("/predictions/outage-probability", tags=["predictions"],
            summary="Outage probability forecast",
            description="Calculates probability of outage in the next hour based on historical patterns and recent trends.")
def predict_outage_probability(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Predicts probability of outage in the next hour."""
    cutoff = datetime.utcnow() - timedelta(days=7)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    
    return NetworkPredictor.predict_outage_probability(measurements)


@router.get("/predictions/best-download-time", tags=["predictions"],
            summary="Best time to download",
            description="Finds the optimal time in the next 24 hours to download large files based on historical speed patterns.")
def predict_best_download_time(
    hours_ahead: int = Query(24, ge=1, le=72),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Finds the best time to download large files."""
    cutoff = datetime.utcnow() - timedelta(days=14)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    
    return NetworkPredictor.find_best_download_time(measurements, hours_ahead)


@router.get("/predictions/congestion-24h", tags=["predictions"],
            summary="24-hour congestion forecast",
            description="Predicts network congestion levels for the next 24 hours based on historical patterns.")
def predict_congestion_24h(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Predicts congestion for the next 24 hours."""
    cutoff = datetime.utcnow() - timedelta(days=14)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    
    return NetworkPredictor.predict_congestion_24h(measurements)


# ─── Smart Alerts Configuration ──────────────────────────────────────────────

from ..services.smart_alerts import SmartAlertService
from ..models.measurement import AlertConfig, UserPreferences

class AlertConfigCreate(BaseModel):
    telegram_enabled: bool = False
    telegram_chat_id: Optional[str] = None
    discord_enabled: bool = False
    discord_webhook_url: Optional[str] = None
    sms_enabled: bool = False
    phone_number: Optional[str] = None
    min_download_speed: Optional[float] = None
    max_ping: Optional[float] = None
    quiet_hours_enabled: bool = False
    quiet_hours_start: Optional[str] = None  # HH:MM format
    quiet_hours_end: Optional[str] = None


@router.get("/alerts/config", tags=["alerts"],
            summary="Get alert configuration")
def get_alert_config(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    config = db.query(AlertConfig).filter(AlertConfig.client_id == client_id).first()
    if not config:
        return {"enabled": False, "message": "No alert configuration found"}
    
    return config


@router.post("/alerts/config", tags=["alerts"],
             summary="Configure smart alerts")
def configure_alerts(
    config_data: AlertConfigCreate,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    from datetime import time as dt_time
    
    config = db.query(AlertConfig).filter(AlertConfig.client_id == client_id).first()
    if not config:
        config = AlertConfig(client_id=client_id, enabled=True)
        db.add(config)
    
    config.telegram_enabled = config_data.telegram_enabled
    config.telegram_chat_id = config_data.telegram_chat_id
    config.discord_enabled = config_data.discord_enabled
    config.discord_webhook_url = config_data.discord_webhook_url
    config.sms_enabled = config_data.sms_enabled
    config.phone_number = config_data.phone_number
    config.min_download_speed = config_data.min_download_speed
    config.max_ping = config_data.max_ping
    config.quiet_hours_enabled = config_data.quiet_hours_enabled
    
    if config_data.quiet_hours_start:
        h, m = map(int, config_data.quiet_hours_start.split(":"))
        config.quiet_hours_start = dt_time(h, m)
    if config_data.quiet_hours_end:
        h, m = map(int, config_data.quiet_hours_end.split(":"))
        config.quiet_hours_end = dt_time(h, m)
    
    db.commit()
    db.refresh(config)
    return {"message": "Alert configuration saved", "config": config}


@router.post("/alerts/test", tags=["alerts"],
             summary="Test alert delivery")
async def test_alert(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = SmartAlertService(db)
    success = await service.send_alert(
        client_id=client_id,
        alert_type="test",
        message="🧪 Test alert from Internet Stability Tracker",
        severity="low"
    )
    
    return {"success": success, "message": "Test alert sent" if success else "Alert delivery failed"}


@router.get("/alerts/log", tags=["alerts"],
            summary="Alert history for this device")
def get_alert_log(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """Return the last N alert log entries scoped to this client."""
    if not client_id:
        return []
    from ..models.measurement import AlertLog
    logs = (
        db.query(AlertLog)
        .filter(AlertLog.client_id == client_id)
        .order_by(desc(AlertLog.timestamp))
        .limit(limit)
        .all()
    )
    return [
        {
            "id":         l.id,
            "alert_type": l.alert_type,
            "message":    l.message,
            "severity":   l.severity,
            "success":    l.success,
            "timestamp":  l.timestamp.isoformat(),
        }
        for l in logs
    ]


# ─── Prometheus Metrics ───────────────────────────────────────────────────────

@router.get("/metrics", tags=["monitoring"],
            summary="Prometheus-compatible metrics",
            response_class=None)
def prometheus_metrics(db: Session = Depends(get_db)):
    """Expose key counters in Prometheus text format for Grafana/Prometheus scraping."""
    from fastapi.responses import PlainTextResponse

    total_measurements = db.query(SpeedMeasurement).count()
    total_outages      = db.query(SpeedMeasurement).filter(SpeedMeasurement.is_outage == True).count()
    total_reports      = db.query(CommunityReport).count()
    total_outage_events = db.query(OutageEvent).count()
    open_outages       = db.query(OutageEvent).filter(OutageEvent.is_resolved == False).count()

    # Recent 24h averages (global, not per-device)
    cutoff = datetime.utcnow() - timedelta(hours=24)
    recent = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff).all()
    avg_dl  = round(sum(r.download_speed for r in recent) / len(recent), 2) if recent else 0
    avg_ul  = round(sum(r.upload_speed   for r in recent) / len(recent), 2) if recent else 0
    avg_png = round(sum(r.ping           for r in recent) / len(recent), 2) if recent else 0

    lines = [
        "# HELP ist_measurements_total Total speed test measurements stored",
        "# TYPE ist_measurements_total counter",
        f"ist_measurements_total {total_measurements}",
        "",
        "# HELP ist_outages_total Total outage measurements",
        "# TYPE ist_outages_total counter",
        f"ist_outages_total {total_outages}",
        "",
        "# HELP ist_community_reports_total Community-submitted reports",
        "# TYPE ist_community_reports_total counter",
        f"ist_community_reports_total {total_reports}",
        "",
        "# HELP ist_outage_events_total Structured outage events",
        "# TYPE ist_outage_events_total counter",
        f"ist_outage_events_total {total_outage_events}",
        "",
        "# HELP ist_outage_events_open Currently open (unresolved) outage events",
        "# TYPE ist_outage_events_open gauge",
        f"ist_outage_events_open {open_outages}",
        "",
        "# HELP ist_avg_download_mbps_24h Average download speed (Mbps) last 24h",
        "# TYPE ist_avg_download_mbps_24h gauge",
        f"ist_avg_download_mbps_24h {avg_dl}",
        "",
        "# HELP ist_avg_upload_mbps_24h Average upload speed (Mbps) last 24h",
        "# TYPE ist_avg_upload_mbps_24h gauge",
        f"ist_avg_upload_mbps_24h {avg_ul}",
        "",
        "# HELP ist_avg_ping_ms_24h Average ping (ms) last 24h",
        "# TYPE ist_avg_ping_ms_24h gauge",
        f"ist_avg_ping_ms_24h {avg_png}",
    ]
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")


# ─── Webhook Management ───────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    url:    str = Field(..., min_length=8, max_length=500)
    secret: Optional[str] = Field(None, max_length=120)
    events: List[str] = Field(
        default=["outage", "speed_drop", "recovery"],
        description="Events to subscribe to: outage, speed_drop, recovery, test",
    )


@router.get("/webhooks", tags=["webhooks"],
            summary="List registered webhooks for this device")
def list_webhooks(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        return []
    from ..models.measurement import Webhook
    hooks = db.query(Webhook).filter(Webhook.client_id == client_id, Webhook.is_active == True).all()
    return [
        {
            "id":         h.id,
            "url":        h.url,
            "events":     h.events,
            "created_at": h.created_at.isoformat(),
            "is_active":  h.is_active,
        }
        for h in hooks
    ]


@router.post("/webhooks", tags=["webhooks"],
             summary="Register a new webhook", status_code=201)
def create_webhook(
    data: WebhookCreate,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    from ..models.measurement import Webhook
    # Limit to 5 webhooks per device
    existing = db.query(Webhook).filter(Webhook.client_id == client_id, Webhook.is_active == True).count()
    if existing >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 active webhooks per device")
    hook = Webhook(client_id=client_id, url=data.url, secret=data.secret, events=data.events)
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return {"id": hook.id, "url": hook.url, "events": hook.events, "created_at": hook.created_at.isoformat()}


@router.delete("/webhooks/{webhook_id}", tags=["webhooks"],
               summary="Delete a webhook")
def delete_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    from ..models.measurement import Webhook
    hook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.client_id == client_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    hook.is_active = False
    db.commit()
    return {"message": "Webhook deleted"}


@router.post("/webhooks/test/{webhook_id}", tags=["webhooks"],
             summary="Send a test payload to a webhook")
async def test_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    from ..models.measurement import Webhook
    import httpx as _httpx
    hook = db.query(Webhook).filter(Webhook.id == webhook_id, Webhook.client_id == client_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    payload = {
        "event": "test",
        "source": "internet-stability-tracker",
        "timestamp": datetime.utcnow().isoformat(),
        "data": {"message": "Webhook test from Internet Stability Tracker"},
    }
    try:
        async with _httpx.AsyncClient(timeout=10) as client_http:
            r = await client_http.post(hook.url, json=payload)
            return {"success": r.status_code < 300, "status_code": r.status_code}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Advanced Diagnostics ────────────────────────────────────────────────────

from ..services.advanced_diagnostics import AdvancedDiagnostics

@router.get("/diagnostics/advanced", tags=["diagnostics"],
            summary="Advanced network diagnostics")
async def get_advanced_diagnostics():
    diag = AdvancedDiagnostics()
    return await diag.run_full_diagnostics()


@router.get("/diagnostics/packet-loss", tags=["diagnostics"],
            summary="Packet loss measurement")
async def measure_packet_loss(host: str = Query("8.8.8.8"), count: int = Query(20, ge=10, le=50)):
    diag = AdvancedDiagnostics()
    return await diag.measure_packet_loss(host, count)


@router.get("/diagnostics/jitter", tags=["diagnostics"],
            summary="Jitter measurement")
async def measure_jitter(host: str = Query("8.8.8.8"), samples: int = Query(30, ge=10, le=100)):
    diag = AdvancedDiagnostics()
    return await diag.measure_jitter(host, samples)


@router.get("/diagnostics/bufferbloat", tags=["diagnostics"],
            summary="Bufferbloat test")
async def test_bufferbloat():
    diag = AdvancedDiagnostics()
    return await diag.test_bufferbloat()


@router.get("/diagnostics/mtu", tags=["diagnostics"],
            summary="MTU discovery")
async def discover_mtu(host: str = Query("8.8.8.8")):
    diag = AdvancedDiagnostics()
    return await diag.discover_mtu(host)


@router.get("/diagnostics/dns-leak", tags=["diagnostics"],
            summary="DNS leak test")
async def test_dns_leak():
    diag = AdvancedDiagnostics()
    return await diag.test_dns_leak()


@router.get("/diagnostics/vpn-speed", tags=["diagnostics"],
            summary="VPN speed comparison — measures baseline speed and estimates VPN overhead")
async def compare_vpn_speed(vpn_interface: Optional[str] = Query(None, description="VPN network interface name (e.g. tun0, wg0)")):
    diag = AdvancedDiagnostics()
    return await diag.compare_vpn_speed(vpn_interface)


# ─── AI Insights Enhanced ─────────────────────────────────────────────────────

from ..services.ai_insights_enhanced import AIInsightsService

@router.get("/insights/root-cause", tags=["insights"],
            summary="Root cause analysis")
def analyze_root_cause(
    hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = AIInsightsService(db)
    return service.analyze_root_cause(client_id, hours)


@router.get("/insights/predictive-maintenance", tags=["insights"],
            summary="Predictive maintenance")
def predict_maintenance(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = AIInsightsService(db)
    return service.predict_maintenance(client_id)


@router.get("/insights/anomalies-advanced", tags=["insights"],
            summary="Advanced anomaly detection")
def detect_anomalies_advanced(
    sensitivity: float = Query(2.0, ge=1.0, le=3.0),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = AIInsightsService(db)
    return service.detect_anomalies_advanced(client_id, sensitivity)


@router.get("/insights/query", tags=["insights"],
            summary="Natural language query")
def answer_query(
    q: str = Query(..., description="Natural language question"),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = AIInsightsService(db)
    return service.answer_natural_query(client_id, q)


# ─── Network Security ─────────────────────────────────────────────────────────

from ..services.network_security import NetworkSecurityService

@router.get("/security/audit", tags=["security"],
            summary="Security audit")
async def run_security_audit(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = NetworkSecurityService(db)
    return await service.run_security_audit(client_id)


@router.get("/security/port-scan", tags=["security"],
            summary="Port scan")
async def scan_ports(target: str = Query("127.0.0.1")):
    service = NetworkSecurityService(None)
    return await service.scan_common_ports(target)


@router.get("/security/privacy-score", tags=["security"],
            summary="Privacy score")
async def get_privacy_score():
    service = NetworkSecurityService(None)
    return await service.calculate_privacy_score()


@router.get("/security/vpn-recommendation", tags=["security"],
            summary="VPN recommendation")
async def recommend_vpn():
    service = NetworkSecurityService(None)
    return await service.recommend_vpn()


# ─── Historical Visualization ─────────────────────────────────────────────────

from ..services.historical_visualization import HistoricalVisualizationService

@router.get("/history/heatmap-calendar", tags=["history"],
            summary="Heatmap calendar")
def get_heatmap_calendar(
    days: int = Query(90, ge=7, le=365),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = HistoricalVisualizationService(db)
    return service.get_heatmap_calendar(client_id, days)


@router.get("/history/distribution", tags=["history"],
            summary="Speed distribution histogram")
def get_speed_distribution(
    bins: int = Query(20, ge=5, le=50),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = HistoricalVisualizationService(db)
    return service.get_speed_distribution(client_id, bins)


@router.get("/history/percentiles", tags=["history"],
            summary="Percentile charts")
def get_percentile_charts(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = HistoricalVisualizationService(db)
    return service.get_percentile_charts(client_id)


@router.get("/history/correlation", tags=["history"],
            summary="Correlation analysis")
def get_correlation_analysis(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = HistoricalVisualizationService(db)
    return service.get_correlation_analysis(client_id)


@router.get("/history/interactive-timeline", tags=["history"],
            summary="Interactive timeline")
def get_interactive_timeline(
    hours: int = Query(168, ge=1, le=720),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    service = HistoricalVisualizationService(db)
    return service.get_interactive_timeline(client_id, hours)


# ─── User Preferences ─────────────────────────────────────────────────────────

class PreferencesUpdate(BaseModel):
    theme: Optional[str] = None
    custom_theme: Optional[dict] = None
    dashboard_layout: Optional[dict] = None
    favorite_metrics: Optional[list] = None
    chart_preferences: Optional[dict] = None


@router.get("/preferences", tags=["preferences"],
            summary="Get user preferences")
def get_preferences(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    prefs = db.query(UserPreferences).filter(UserPreferences.client_id == client_id).first()
    if not prefs:
        return {"theme": "dark", "message": "No preferences found"}
    
    return prefs


@router.post("/preferences", tags=["preferences"],
             summary="Update user preferences")
def update_preferences(
    prefs_data: PreferencesUpdate,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    
    prefs = db.query(UserPreferences).filter(UserPreferences.client_id == client_id).first()
    if not prefs:
        prefs = UserPreferences(client_id=client_id)
        db.add(prefs)
    
    if prefs_data.theme:
        prefs.theme = prefs_data.theme
    if prefs_data.custom_theme:
        prefs.custom_theme = prefs_data.custom_theme
    if prefs_data.dashboard_layout:
        prefs.dashboard_layout = prefs_data.dashboard_layout
    if prefs_data.favorite_metrics:
        prefs.favorite_metrics = prefs_data.favorite_metrics
    if prefs_data.chart_preferences:
        prefs.chart_preferences = prefs_data.chart_preferences
    
    db.commit()
    db.refresh(prefs)
    return {"message": "Preferences updated", "preferences": prefs}
