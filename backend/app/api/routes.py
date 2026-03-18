import asyncio
import hmac
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
    if not hmac.compare_digest(x_admin_key.encode(), expected.encode()):
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


@router.get("/reports/weekly", tags=["reports"],
            summary="Generate weekly network performance report",
            description="Natural-language weekly summary with week-over-week comparison.")
def get_weekly_report_static(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    from ..services.weekly_report import generate_weekly_report
    cutoff = datetime.utcnow() - timedelta(days=14)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    outage_events = (
        _scope(db.query(OutageEvent), client_id)
        .filter(OutageEvent.started_at >= cutoff)
        .all()
    )
    return generate_weekly_report(measurements, outage_events)


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


@router.get("/predictions/summary", tags=["predictions"],
            summary="All predictions in one call",
            description="Returns next-hour speed, outage probability, best download time, and 24h congestion forecast as a single response with a headline summary.")
def predictions_summary(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    cutoff = datetime.utcnow() - timedelta(days=14)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    n = len(measurements)
    data_quality = "insufficient" if n < 12 else "limited" if n < 48 else "good"

    next_hour   = NetworkPredictor.predict_next_hour_speed(measurements)
    outage_prob = NetworkPredictor.predict_outage_probability(measurements)
    best_dl     = NetworkPredictor.find_best_download_time(measurements)
    congestion  = NetworkPredictor.predict_congestion_24h(measurements)

    # Build headline
    if data_quality == "insufficient":
        headline = f"Not enough data yet ({n} tests recorded). Run more speed tests for accurate predictions."
    else:
        pred_dl  = next_hour.get("predicted_download")
        risk     = outage_prob.get("risk_level", "unknown")
        best_h   = best_dl.get("best_hour")
        headline = (
            f"Next hour: ~{pred_dl} Mbps expected. "
            f"Outage risk: {risk}. "
            + (f"Best download window: {best_h:02d}:00." if best_h is not None else "")
        ) if pred_dl else next_hour.get("message", "Predictions ready.")

    return {
        "headline":              headline,
        "data_quality":          data_quality,
        "measurements_used":     n,
        "next_hour_summary":     next_hour.get("message", ""),
        "outage_risk_summary":   outage_prob.get("message", ""),
        "best_download_summary": best_dl.get("reason", ""),
        "congestion_summary":    congestion.get("notable_periods", []),
        "full_predictions": {
            "next_hour":   next_hour,
            "outage":      outage_prob,
            "best_dl":     best_dl,
            "congestion":  congestion,
        },
    }


# ─── ISP SLA Tracker ─────────────────────────────────────────────────────────

@router.get("/sla/analyze", tags=["sla"],
            summary="Analyze ISP SLA compliance",
            description="Compare actual speeds against your ISP's promised speeds.")
def analyze_sla_compliance(
    promised_download: float = 100.0,
    promised_upload:   float = 20.0,
    promised_ping:     float = 30.0,
    window_days:       int   = 30,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    from ..services.sla_tracker import analyze_sla
    cutoff = datetime.utcnow() - timedelta(days=max(window_days, 1))
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    return analyze_sla(measurements, promised_download, promised_upload, promised_ping, window_days)


# ─── Throttling Detector ──────────────────────────────────────────────────────

@router.get("/throttle/detect", tags=["throttle"],
            summary="Detect ISP throttling",
            description="Probes multiple CDN endpoints to detect selective bandwidth throttling.")
async def detect_throttling_endpoint(baseline_mbps: float = 0.0):
    from ..services.throttle_detector import detect_throttling
    return await detect_throttling(baseline_mbps)


# ─── Network Health Score ─────────────────────────────────────────────────────

@router.get("/health-score", tags=["health"],
            summary="Composite network health score (0–100)",
            description="Weighted composite score from download, upload, ping, stability, and uptime.")
def get_health_score(
    window_days: int = 7,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    from ..services.health_score import compute_health_score
    cutoff = datetime.utcnow() - timedelta(days=max(window_days, 1))
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    outage_events = (
        _scope(db.query(OutageEvent), client_id)
        .filter(OutageEvent.started_at >= cutoff)
        .all()
    )
    return compute_health_score(measurements, outage_events, window_days)


# ─── Cost-Per-Mbps Calculator ─────────────────────────────────────────────────

@router.get("/cost-calculator", tags=["cost"],
            summary="Calculate cost efficiency (cost per Mbps)")
def calculate_cost(
    monthly_cost_usd:   float = 50.0,
    plan_download_mbps: float = 100.0,
    plan_upload_mbps:   float = 20.0,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    cutoff = datetime.utcnow() - timedelta(days=30)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .all()
    )
    downloads  = [m.download_speed for m in measurements if m.download_speed]
    actual_avg = round(sum(downloads) / len(downloads), 2) if downloads else 0
    cost_per_plan_mbps   = round(monthly_cost_usd / plan_download_mbps, 4) if plan_download_mbps > 0 else 0
    cost_per_actual_mbps = round(monthly_cost_usd / actual_avg, 4)         if actual_avg > 0        else 0
    US_AVG     = 0.47
    GLOBAL_AVG = 0.65
    efficiency = "good" if cost_per_plan_mbps <= US_AVG else "average" if cost_per_plan_mbps <= GLOBAL_AVG * 1.5 else "poor"
    return {
        "monthly_cost_usd":          monthly_cost_usd,
        "plan_download_mbps":        plan_download_mbps,
        "plan_upload_mbps":          plan_upload_mbps,
        "actual_avg_download_mbps":  actual_avg,
        "cost_per_plan_mbps":        cost_per_plan_mbps,
        "cost_per_actual_mbps":      cost_per_actual_mbps,
        "efficiency":                efficiency,
        "benchmark": {"us_avg_usd_per_mbps": US_AVG, "global_avg_usd_per_mbps": GLOBAL_AVG},
        "verdict": (
            f"✅ Good value! At ${cost_per_plan_mbps}/Mbps you're below the US average (${US_AVG}/Mbps)."
            if efficiency == "good" else
            f"⚠️ Average value at ${cost_per_plan_mbps}/Mbps. US average is ${US_AVG}/Mbps."
            if efficiency == "average" else
            f"💸 Poor value at ${cost_per_plan_mbps}/Mbps — consider shopping around for better plans."
        ),
        "annual_cost_usd": round(monthly_cost_usd * 12, 2),
    }


# ─── Before/After Comparison ──────────────────────────────────────────────────

@router.get("/comparison/before-after", tags=["comparison"],
            summary="Before/after speed comparison between two date ranges")
def before_after_comparison(
    before_start: str = "",
    before_end:   str = "",
    after_start:  str = "",
    after_end:    str = "",
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    from datetime import datetime as dt
    try:
        now   = datetime.utcnow()
        b_start = dt.fromisoformat(before_start) if before_start else now - timedelta(days=60)
        b_end   = dt.fromisoformat(before_end)   if before_end   else now - timedelta(days=30)
        a_start = dt.fromisoformat(after_start)  if after_start  else now - timedelta(days=30)
        a_end   = dt.fromisoformat(after_end)    if after_end    else now
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601 (YYYY-MM-DD).")

    q        = _scope(db.query(SpeedMeasurement), client_id)
    before_m = q.filter(SpeedMeasurement.timestamp >= b_start, SpeedMeasurement.timestamp < b_end).all()
    after_m  = q.filter(SpeedMeasurement.timestamp >= a_start, SpeedMeasurement.timestamp < a_end).all()

    def _stats(lst):
        dls = [m.download_speed for m in lst if m.download_speed]
        uls = [m.upload_speed   for m in lst if m.upload_speed]
        pgs = [m.ping           for m in lst if m.ping]
        return {
            "count":        len(lst),
            "avg_download": round(sum(dls) / len(dls), 2) if dls else 0,
            "avg_upload":   round(sum(uls) / len(uls), 2) if uls else 0,
            "avg_ping":     round(sum(pgs) / len(pgs), 2) if pgs else 0,
        }

    b = _stats(before_m)
    a = _stats(after_m)

    def _delta(before, after):
        if before == 0:
            return None
        return round((after - before) / before * 100, 1)

    dl_delta = _delta(b["avg_download"], a["avg_download"])
    return {
        "before": {"period": f"{b_start.date()} → {b_end.date()}", **b},
        "after":  {"period": f"{a_start.date()} → {a_end.date()}", **a},
        "deltas": {
            "download_pct": dl_delta,
            "upload_pct":   _delta(b["avg_upload"], a["avg_upload"]),
            "ping_pct":     _delta(b["avg_ping"],   a["avg_ping"]),
        },
        "verdict": (
            "✅ Improvement detected after the change."
            if (dl_delta or 0) > 5 else
            "📉 Speed declined after the change."
            if (dl_delta or 0) < -5 else
            "➡️ No significant change detected between periods."
        ),
    }


# ─── Speed Leaderboard ────────────────────────────────────────────────────────

from ..models.measurement import SpeedChallenge

class ChallengeSubmit(BaseModel):
    display_name: str = "Anonymous"

@router.get("/leaderboard", tags=["leaderboard"],
            summary="Community speed leaderboard")
def get_leaderboard(
    metric: str = "download",
    limit:  int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(SpeedChallenge)
    if metric == "upload":
        q = q.order_by(SpeedChallenge.best_upload.desc())
    else:
        q = q.order_by(SpeedChallenge.best_download.desc())
    entries = q.limit(min(limit, 100)).all()
    return {
        "metric": metric,
        "entries": [
            {
                "rank":          i + 1,
                "display_name":  e.display_name,
                "best_download": round(e.best_download, 2),
                "best_upload":   round(e.best_upload,   2),
                "isp":           e.isp,
                "country":       e.country,
                "recorded_at":   e.recorded_at.isoformat() if e.recorded_at else None,
            }
            for i, e in enumerate(entries)
        ],
        "total_participants": db.query(SpeedChallenge).count(),
    }


@router.get("/leaderboard/my-rank", tags=["leaderboard"],
            summary="Get your personal best and rank on the leaderboard")
def get_my_rank(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID required.")
    entry = db.query(SpeedChallenge).filter(SpeedChallenge.client_id == client_id).first()
    if not entry:
        return {"submitted": False, "message": "You haven't submitted to the leaderboard yet."}
    # Compute rank
    dl_rank = db.query(SpeedChallenge).filter(SpeedChallenge.best_download > entry.best_download).count() + 1
    ul_rank = db.query(SpeedChallenge).filter(SpeedChallenge.best_upload   > entry.best_upload).count()   + 1
    total   = db.query(SpeedChallenge).count()
    return {
        "submitted":      True,
        "display_name":   entry.display_name,
        "best_download":  round(entry.best_download, 2),
        "best_upload":    round(entry.best_upload,   2),
        "isp":            entry.isp,
        "download_rank":  dl_rank,
        "upload_rank":    ul_rank,
        "total_participants": total,
        "download_percentile": round((1 - dl_rank / total) * 100, 1) if total else 0,
    }

@router.post("/leaderboard/submit", tags=["leaderboard"],
             summary="Submit your best speed to the leaderboard")
def submit_to_leaderboard(
    payload: ChallengeSubmit,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID header required.")
    cutoff = datetime.utcnow() - timedelta(days=90)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .all()
    )
    if not measurements:
        raise HTTPException(status_code=400, detail="No speed tests found. Run a test first.")
    best_dl  = max((m.download_speed for m in measurements if m.download_speed), default=0)
    best_ul  = max((m.upload_speed   for m in measurements if m.upload_speed),   default=0)
    last     = measurements[-1]
    existing = db.query(SpeedChallenge).filter(SpeedChallenge.client_id == client_id).first()
    if existing:
        existing.best_download = max(existing.best_download, best_dl)
        existing.best_upload   = max(existing.best_upload,   best_ul)
        existing.display_name  = payload.display_name
        existing.recorded_at   = datetime.utcnow()
    else:
        entry = SpeedChallenge(
            client_id    = client_id,
            display_name = payload.display_name,
            best_download= best_dl,
            best_upload  = best_ul,
            isp          = getattr(last, "isp", None),
            country      = getattr(last, "country_name", None),
        )
        db.add(entry)
    db.commit()
    return {"message": "Submitted!", "best_download": best_dl, "best_upload": best_ul}


# ─── Data Export ─────────────────────────────────────────────────────────────

@router.get("/export/csv", tags=["export"],
            summary="Export measurements as CSV")
def export_csv(
    days: int = 90,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    from fastapi.responses import StreamingResponse
    import io, csv as csv_mod
    cutoff = datetime.utcnow() - timedelta(days=days)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    output = io.StringIO()
    writer = csv_mod.writer(output)
    writer.writerow(["timestamp", "download_mbps", "upload_mbps", "ping_ms", "isp", "city", "country"])
    for m in measurements:
        writer.writerow([
            m.timestamp.isoformat() if m.timestamp else "",
            m.download_speed or "",
            m.upload_speed   or "",
            m.ping           or "",
            getattr(m, "isp",          "") or "",
            getattr(m, "city",         "") or "",
            getattr(m, "country_name", "") or "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=speed_tests_{datetime.utcnow().strftime('%Y%m%d')}.csv"},
    )

@router.get("/export/json", tags=["export"],
            summary="Export measurements as JSON")
def export_json_endpoint(
    days: int = 90,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )
    data = [
        {
            "timestamp":     m.timestamp.isoformat() if m.timestamp else None,
            "download_mbps": m.download_speed,
            "upload_mbps":   m.upload_speed,
            "ping_ms":       m.ping,
            "isp":           getattr(m, "isp",          None),
            "city":          getattr(m, "city",         None),
            "country":       getattr(m, "country_name", None),
        }
        for m in measurements
    ]
    return {"count": len(data), "exported_at": datetime.utcnow().isoformat(), "measurements": data}


# ─── API Keys ─────────────────────────────────────────────────────────────────

import hashlib, secrets as _secrets
from ..models.measurement import APIKey

class APIKeyCreate(BaseModel):
    label: str = "Default"

@router.get("/api-keys", tags=["api-keys"],
            summary="List API keys for this device")
def list_api_keys(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID header required.")
    keys = db.query(APIKey).filter(APIKey.client_id == client_id, APIKey.is_active == True).all()
    return [
        {"id": k.id, "label": k.label,
         "created_at": k.created_at.isoformat(),
         "last_used":  k.last_used.isoformat() if k.last_used else None}
        for k in keys
    ]

@router.post("/api-keys", tags=["api-keys"],
             summary="Generate a new API key")
def create_api_key(
    payload: APIKeyCreate,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID header required.")
    if db.query(APIKey).filter(APIKey.client_id == client_id, APIKey.is_active == True).count() >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 active API keys per device.")
    raw_key  = f"ist_{_secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key = APIKey(client_id=client_id, key_hash=key_hash, label=payload.label)
    db.add(key)
    db.commit()
    db.refresh(key)
    return {"id": key.id, "label": key.label, "key": raw_key,
            "message": "Save this key — it won't be shown again."}

@router.delete("/api-keys/{key_id}", tags=["api-keys"],
               summary="Revoke an API key")
def revoke_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID header required.")
    key = db.query(APIKey).filter(APIKey.id == key_id, APIKey.client_id == client_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found.")
    key.is_active = False
    db.commit()
    return {"message": "API key revoked."}


# ─── ISP Report Card ─────────────────────────────────────────────────────────

@router.get("/isp-report-card", tags=["isp"],
            summary="Community ISP report card — aggregated grades for all ISPs")
def isp_report_card(
    days: int = 30,
    db: Session = Depends(get_db),
):
    from collections import defaultdict
    cutoff = datetime.utcnow() - timedelta(days=days)
    measurements = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff).all()
    isp_data: dict = defaultdict(lambda: {"downloads": [], "uploads": [], "pings": [], "count": 0})
    for m in measurements:
        isp = getattr(m, "isp", None) or "Unknown"
        if m.download_speed: isp_data[isp]["downloads"].append(m.download_speed)
        if m.upload_speed:   isp_data[isp]["uploads"].append(m.upload_speed)
        if m.ping:           isp_data[isp]["pings"].append(m.ping)
        isp_data[isp]["count"] += 1

    grade_map = [(90, "A+"), (80, "A"), (70, "B"), (60, "C"), (50, "D"), (0, "F")]
    def _grade(score):
        for t, g in grade_map:
            if score >= t:
                return g
        return "F"

    report = []
    for isp, d in isp_data.items():
        dl = sum(d["downloads"]) / len(d["downloads"]) if d["downloads"] else 0
        ul = sum(d["uploads"])   / len(d["uploads"])   if d["uploads"]   else 0
        pg = sum(d["pings"])     / len(d["pings"])     if d["pings"]     else 999
        dl_s   = min(100, (dl / 100) * 100)
        ul_s   = min(100, (ul / 50)  * 100)
        pg_s   = max(0, 100 - (pg / 3))
        score  = round(dl_s * 0.4 + ul_s * 0.3 + pg_s * 0.3, 1)
        report.append({
            "isp":          isp,
            "score":        score,
            "grade":        _grade(score),
            "avg_download": round(dl, 2),
            "avg_upload":   round(ul, 2),
            "avg_ping":     round(pg, 2),
            "test_count":   d["count"],
        })
    report.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(report):
        r["rank"] = i + 1
    return {"window_days": days, "isp_count": len(report), "report_cards": report}


# ─── Slack / Teams Integration ────────────────────────────────────────────────

class SlackWebhookTest(BaseModel):
    webhook_url: str
    platform:   str = "slack"

@router.post("/integrations/test-webhook", tags=["integrations"],
             summary="Test a Slack or Teams webhook")
async def test_slack_teams_webhook(payload: SlackWebhookTest):
    import httpx
    platform = payload.platform.lower()
    if platform == "teams":
        body = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "summary": "IST Test",
            "sections": [{"activityTitle": "🌐 Internet Stability Tracker — Test Notification",
                          "activityText": "This is a test message from your IST integration."}],
        }
    else:
        body = {"text": "🌐 *Internet Stability Tracker* — Test notification! Your Slack integration is working."}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(payload.webhook_url, json=body, timeout=10)
        return {"success": r.status_code < 300, "status_code": r.status_code,
                "message": "Test message sent!" if r.status_code < 300 else f"Failed: HTTP {r.status_code}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


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


def _alert_config_dict(config) -> dict:
    """Serialize AlertConfig to a plain JSON-safe dict.
    datetime.time columns are converted to "HH:MM" strings so FastAPI
    doesn't try to encode them and cause a 500."""
    return {
        "enabled":              config.enabled,
        "telegram_enabled":     config.telegram_enabled,
        "telegram_chat_id":     config.telegram_chat_id,
        "discord_enabled":      config.discord_enabled,
        "discord_webhook_url":  config.discord_webhook_url,
        "sms_enabled":          config.sms_enabled,
        "phone_number":         config.phone_number,
        "min_download_speed":   config.min_download_speed,
        "max_ping":             config.max_ping,
        "quiet_hours_enabled":  config.quiet_hours_enabled,
        "quiet_hours_start":    config.quiet_hours_start.strftime("%H:%M") if config.quiet_hours_start else None,
        "quiet_hours_end":      config.quiet_hours_end.strftime("%H:%M")   if config.quiet_hours_end   else None,
    }


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
        return {"enabled": False}

    return _alert_config_dict(config)


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

    config.telegram_enabled    = config_data.telegram_enabled
    config.telegram_chat_id    = config_data.telegram_chat_id
    config.discord_enabled     = config_data.discord_enabled
    config.discord_webhook_url = config_data.discord_webhook_url
    config.sms_enabled         = config_data.sms_enabled
    config.phone_number        = config_data.phone_number
    config.min_download_speed  = config_data.min_download_speed
    config.max_ping            = config_data.max_ping
    config.quiet_hours_enabled = config_data.quiet_hours_enabled

    if config_data.quiet_hours_start:
        h, m = map(int, config_data.quiet_hours_start.split(":"))
        config.quiet_hours_start = dt_time(h, m)
    if config_data.quiet_hours_end:
        h, m = map(int, config_data.quiet_hours_end.split(":"))
        config.quiet_hours_end = dt_time(h, m)

    db.commit()
    db.refresh(config)
    return {"message": "Alert configuration saved", **_alert_config_dict(config)}


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


# ─── Uptime Calendar (90-day daily uptime grid) ───────────────────────────────

@router.get("/uptime-calendar", tags=["stats"],
            summary="90-day daily uptime calendar",
            description="Returns a grid of daily uptime % for the last 90 days — useful for GitHub-style heatmap visualization.")
def uptime_calendar(
    days:      int = 90,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    from datetime import date
    cutoff = datetime.utcnow() - timedelta(days=max(days, 7))
    measurements = (
        _scope(db.query(SpeedMeasurement), client_id)
        .filter(SpeedMeasurement.timestamp >= cutoff)
        .order_by(SpeedMeasurement.timestamp)
        .all()
    )

    # Group by date
    by_date: dict = {}
    for m in measurements:
        d = m.timestamp.date().isoformat()
        if d not in by_date:
            by_date[d] = {"total": 0, "outages": 0}
        by_date[d]["total"]   += 1
        by_date[d]["outages"] += 1 if m.is_outage else 0

    calendar = []
    for i in range(days):
        d = (datetime.utcnow() - timedelta(days=days - 1 - i)).date().isoformat()
        stats = by_date.get(d, {"total": 0, "outages": 0})
        total, outages = stats["total"], stats["outages"]
        uptime_pct = round((1 - outages / total) * 100, 1) if total > 0 else None
        level = (
            3 if uptime_pct is not None and uptime_pct >= 99 else
            2 if uptime_pct is not None and uptime_pct >= 90 else
            1 if uptime_pct is not None and uptime_pct >= 50 else
            0
        )
        calendar.append({"date": d, "uptime_pct": uptime_pct, "total": total, "outages": outages, "level": level})

    total_days = sum(1 for c in calendar if c["uptime_pct"] is not None)
    avg_uptime = round(sum(c["uptime_pct"] for c in calendar if c["uptime_pct"] is not None) / total_days, 1) if total_days else None
    perfect_days = sum(1 for c in calendar if c["uptime_pct"] == 100.0)
    outage_days  = sum(1 for c in calendar if c["uptime_pct"] is not None and c["uptime_pct"] < 90)

    return {
        "days": days,
        "calendar": calendar,
        "summary": {
            "avg_uptime_pct": avg_uptime,
            "perfect_days":   perfect_days,
            "outage_days":    outage_days,
            "tracked_days":   total_days,
        },
    }


# ─── ISP Community Status ─────────────────────────────────────────────────────

@router.get("/isp-community-status", tags=["isp"],
            summary="Community-wide ISP health status",
            description="Aggregates anonymous speed data across all users of the same ISP to show whether issues are local or ISP-wide.")
def isp_community_status(
    isp_name: str = "",
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    # Determine ISP from last measurement if not provided
    if not isp_name and client_id:
        last = (
            db.query(SpeedMeasurement)
            .filter(SpeedMeasurement.client_id == client_id)
            .order_by(SpeedMeasurement.timestamp.desc())
            .first()
        )
        if last:
            isp_name = last.isp or ""

    if not isp_name:
        raise HTTPException(status_code=400, detail="isp_name is required (or run a speed test first)")

    cutoff = datetime.utcnow() - timedelta(hours=24)
    isp_measurements = (
        db.query(SpeedMeasurement)
        .filter(
            SpeedMeasurement.isp.ilike(f"%{isp_name}%"),
            SpeedMeasurement.timestamp >= cutoff,
        )
        .all()
    )

    total  = len(isp_measurements)
    if total == 0:
        return {"isp": isp_name, "status": "no_data", "message": "No community data for this ISP in the last 24h."}

    outages  = sum(1 for m in isp_measurements if m.is_outage)
    avg_dl   = round(sum(m.download_speed for m in isp_measurements if m.download_speed) / max(total, 1), 1)
    avg_ping = round(sum(m.ping           for m in isp_measurements if m.ping)           / max(total, 1), 1)
    outage_pct = round(outages / total * 100, 1)
    unique_devices = len(set(m.client_id for m in isp_measurements if m.client_id))

    status = "healthy" if outage_pct < 10 else "degraded" if outage_pct < 40 else "outage"
    verdict = (
        f"✅ {isp_name} appears healthy for all users ({outage_pct}% outage rate)."
        if status == "healthy" else
        f"⚠️ {isp_name} is degraded — {outage_pct}% of users experiencing issues."
        if status == "degraded" else
        f"🔴 {isp_name} has a widespread outage — {outage_pct}% of users affected."
    )

    return {
        "isp":           isp_name,
        "status":        status,
        "outage_pct":    outage_pct,
        "avg_download":  avg_dl,
        "avg_ping":      avg_ping,
        "total_reports": total,
        "unique_devices": unique_devices,
        "window_hours":  24,
        "verdict":       verdict,
    }


# ─── Speed Trend (multi-week decline/improvement detector) ────────────────────

@router.get("/speed-trend", tags=["stats"],
            summary="Multi-week speed trend analysis",
            description="Detects if your internet speed is improving or declining over the past several weeks.")
def speed_trend(
    weeks: int = 4,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    from datetime import date

    results = []
    now = datetime.utcnow()

    for i in range(weeks):
        start = now - timedelta(weeks=weeks - i)
        end   = now - timedelta(weeks=weeks - i - 1)
        measurements = (
            _scope(db.query(SpeedMeasurement), client_id)
            .filter(SpeedMeasurement.timestamp >= start, SpeedMeasurement.timestamp < end)
            .all()
        )
        dls = [m.download_speed for m in measurements if m.download_speed]
        uls = [m.upload_speed   for m in measurements if m.upload_speed]
        pgs = [m.ping           for m in measurements if m.ping]
        results.append({
            "week_label":    f"Week {i+1}",
            "week_start":    start.date().isoformat(),
            "week_end":      end.date().isoformat(),
            "avg_download":  round(sum(dls)/len(dls), 1) if dls else None,
            "avg_upload":    round(sum(uls)/len(uls), 1) if uls else None,
            "avg_ping":      round(sum(pgs)/len(pgs), 1) if pgs else None,
            "sample_count":  len(measurements),
        })

    # Trend: compare first vs last non-null weeks
    valid = [r for r in results if r["avg_download"] is not None]
    trend = "insufficient_data"
    trend_pct = None
    if len(valid) >= 2:
        first_dl = valid[0]["avg_download"]
        last_dl  = valid[-1]["avg_download"]
        trend_pct = round((last_dl - first_dl) / first_dl * 100, 1) if first_dl else None
        if trend_pct is not None:
            trend = "improving" if trend_pct > 5 else "declining" if trend_pct < -5 else "stable"

    verdict = (
        f"📈 Speed improved by {abs(trend_pct)}% over {weeks} weeks."
        if trend == "improving" else
        f"📉 Speed declined by {abs(trend_pct)}% over {weeks} weeks. Consider contacting your ISP."
        if trend == "declining" else
        f"➡️ Speed has been stable over {weeks} weeks."
        if trend == "stable" else
        "Not enough data to determine trend."
    )

    return {
        "weeks":     weeks,
        "trend":     trend,
        "trend_pct": trend_pct,
        "verdict":   verdict,
        "data":      results,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# v3.3 — New Feature Routes
# ═══════════════════════════════════════════════════════════════════════════════

from ..models.measurement import (
    ISPContract, TestSchedule, PacketLossReading, DeviceGroup,
)


# ── Shared Pydantic schemas ────────────────────────────────────────────────────

class ISPContractIn(BaseModel):
    isp_name:          str
    plan_name:         Optional[str] = None
    promised_download: float
    promised_upload:   Optional[float] = None
    monthly_cost:      Optional[float] = None
    currency:          str = "USD"
    contract_start:    Optional[str] = None
    contract_end:      Optional[str] = None
    sla_threshold_pct: float = 80.0

class ScheduleIn(BaseModel):
    label:       str = "My Schedule"
    hours:       List[int] = [8, 13, 18, 23]
    days:        List[int] = [0,1,2,3,4,5,6]
    enabled:     bool = True
    burst_count: int  = 1

class DeviceLinkIn(BaseModel):
    group_id:   Optional[str] = None
    label:      str = "My Device"
    is_primary: bool = False


# ─────────────────────────────────────────────────────────────────────────────
# 1. ISP Contract vs Reality Tracker
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/contract", tags=["contract"], summary="Get ISP contract details")
def get_contract(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    c = db.query(ISPContract).filter(ISPContract.client_id == client_id).first()
    if not c:
        return {"exists": False}
    return {
        "exists": True,
        "isp_name": c.isp_name, "plan_name": c.plan_name,
        "promised_download": c.promised_download, "promised_upload": c.promised_upload,
        "monthly_cost": c.monthly_cost, "currency": c.currency,
        "contract_start": c.contract_start.isoformat() if c.contract_start else None,
        "contract_end":   c.contract_end.isoformat()   if c.contract_end   else None,
        "sla_threshold_pct": c.sla_threshold_pct,
    }


@router.post("/contract", tags=["contract"], summary="Save ISP contract details")
def save_contract(
    data: ISPContractIn,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    c = db.query(ISPContract).filter(ISPContract.client_id == client_id).first()
    if not c:
        c = ISPContract(client_id=client_id)
        db.add(c)
    c.isp_name          = data.isp_name
    c.plan_name         = data.plan_name
    c.promised_download = data.promised_download
    c.promised_upload   = data.promised_upload
    c.monthly_cost      = data.monthly_cost
    c.currency          = data.currency
    c.sla_threshold_pct = data.sla_threshold_pct
    if data.contract_start:
        c.contract_start = datetime.fromisoformat(data.contract_start)
    if data.contract_end:
        c.contract_end = datetime.fromisoformat(data.contract_end)
    db.commit()
    return {"message": "Contract saved"}


@router.get("/contract/compliance", tags=["contract"], summary="Promised vs actual compliance report")
def get_compliance(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    c = db.query(ISPContract).filter(ISPContract.client_id == client_id).first()
    if not c:
        # Return a graceful no-contract state (not a 404, so frontend renders correctly)
        return {
            "status": "no_contract",
            "verdict": "No contract configured",
            "message": "Add your ISP plan details to start tracking compliance.",
        }
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.client_id == client_id, SpeedMeasurement.timestamp >= since)
        .all()
    )
    if not rows:
        return {
            "status": "no_data",
            "verdict": f"Contract saved for {c.isp_name} — no speed tests yet",
            "message": "Run a speed test from the Dashboard to begin tracking.",
            "promised_download": c.promised_download,
            "promised_upload": c.promised_upload,
            "sla_threshold_pct": c.sla_threshold_pct,
        }

    dls = [r.download_speed for r in rows if r.download_speed]
    uls = [r.upload_speed   for r in rows if r.upload_speed]
    avg_dl = round(sum(dls)/len(dls), 2) if dls else 0
    avg_ul = round(sum(uls)/len(uls), 2) if uls else 0
    threshold = c.sla_threshold_pct / 100
    dl_pct   = round((avg_dl / c.promised_download) * 100, 1) if c.promised_download else None
    ul_pct   = round((avg_ul / c.promised_upload)   * 100, 1) if (c.promised_upload and avg_ul) else None
    dl_pass  = avg_dl >= c.promised_download * threshold if c.promised_download else True
    ul_pass  = avg_ul >= c.promised_upload   * threshold if (c.promised_upload and avg_ul) else True
    overall_pass = dl_pass and (ul_pass if c.promised_upload else True)
    cost_per_mbps = round(c.monthly_cost / avg_dl, 2) if (c.monthly_cost and avg_dl) else None

    verdict_str = (
        f"You're getting {dl_pct}% of promised download speed — {'above' if dl_pass else 'below'} SLA threshold."
        if dl_pct else "Compliance data available."
    )

    return {
        "status":             "passing" if overall_pass else "failing",
        "verdict":            verdict_str,
        "message":            f"Based on {len(rows)} tests over {days} days.",
        "promised_download":  c.promised_download,
        "promised_upload":    c.promised_upload,
        "actual_download":    avg_dl,
        "actual_upload":      avg_ul if uls else None,
        "dl_pct":             dl_pct,
        "ul_pct":             ul_pct,
        "dl_pass":            dl_pass,
        "ul_pass":            ul_pass,
        "sla_threshold_pct":  c.sla_threshold_pct,
        "monthly_cost":       c.monthly_cost,
        "currency":           c.currency,
        "cost_per_mbps":      cost_per_mbps,
        "samples":            len(rows),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Network Quality Certificate
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/certificate", tags=["certificate"], summary="Generate a network quality certificate")
def get_certificate(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.client_id == client_id, SpeedMeasurement.timestamp >= since)
        .order_by(SpeedMeasurement.timestamp.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Not enough data for a certificate. Run speed tests first.")

    dls = [r.download_speed for r in rows if r.download_speed]
    uls = [r.upload_speed   for r in rows if r.upload_speed]
    pgs = [r.ping           for r in rows if r.ping]
    outage_count = sum(1 for r in rows if r.is_outage)
    uptime_pct   = round((1 - outage_count / len(rows)) * 100, 2)
    avg_dl       = round(sum(dls)/len(dls), 2) if dls else 0
    avg_ul       = round(sum(uls)/len(uls), 2) if uls else 0
    avg_ping     = round(sum(pgs)/len(pgs), 1) if pgs else 0
    max_dl       = round(max(dls), 2) if dls else 0
    isp_name     = rows[-1].isp or "Unknown ISP"

    # Score 0-100
    dl_score   = min(100, (avg_dl / 100) * 100)
    ul_score   = min(100, (avg_ul / 50)  * 100)
    ping_score = max(0, 100 - (avg_ping / 2))
    up_score   = uptime_pct
    score      = round(dl_score * 0.3 + ul_score * 0.2 + ping_score * 0.25 + up_score * 0.25, 1)
    grade      = "A+" if score >= 95 else "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"

    import hashlib
    cert_data  = f"{client_id}|{days}|{avg_dl}|{avg_ul}|{avg_ping}|{uptime_pct}"
    cert_id    = hashlib.sha256(cert_data.encode()).hexdigest()[:16].upper()

    grade_label = {
        "A+": "Elite Network Quality",
        "A":  "Excellent Network Quality",
        "B":  "Good Network Quality",
        "C":  "Fair Network Quality",
        "D":  "Below Average Network Quality",
        "F":  "Poor Network Quality",
    }.get(grade, "Network Quality Report")

    period_label = (
        f"{rows[0].timestamp.strftime('%b %d')} – {rows[-1].timestamp.strftime('%b %d, %Y')}"
    )

    metrics = [
        {"label": "Avg Download", "value": f"{avg_dl} Mbps"},
        {"label": "Avg Upload",   "value": f"{avg_ul} Mbps"},
        {"label": "Avg Ping",     "value": f"{avg_ping} ms"},
        {"label": "Uptime",       "value": f"{uptime_pct}%"},
    ]

    criteria = [
        {
            "name":   "Download Speed",
            "detail": f"{avg_dl} Mbps average over {days} days",
            "pass":   avg_dl >= 25,
            "grade":  "A" if avg_dl >= 100 else "B" if avg_dl >= 50 else "C" if avg_dl >= 25 else "D",
        },
        {
            "name":   "Upload Speed",
            "detail": f"{avg_ul} Mbps average",
            "pass":   avg_ul >= 5,
            "grade":  "A" if avg_ul >= 20 else "B" if avg_ul >= 10 else "C" if avg_ul >= 5 else "D",
        },
        {
            "name":   "Latency",
            "detail": f"{avg_ping} ms average ping",
            "pass":   avg_ping <= 80,
            "grade":  "A" if avg_ping <= 20 else "B" if avg_ping <= 50 else "C" if avg_ping <= 80 else "D",
        },
        {
            "name":   "Reliability",
            "detail": f"{uptime_pct}% uptime, {outage_count} outage event(s)",
            "pass":   uptime_pct >= 99,
            "grade":  "A" if uptime_pct >= 99.9 else "B" if uptime_pct >= 99 else "C" if uptime_pct >= 95 else "D",
        },
    ]

    return {
        "grade":         grade,
        "score":         score,
        "title":         grade_label,
        "subtitle":      f"Based on {len(rows)} speed tests over {days} days",
        "issued_at":     datetime.utcnow().strftime("%B %d, %Y"),
        "period":        period_label,
        "sample_count":  len(rows),
        "certificate_id": cert_id,
        "isp":           isp_name,
        "metrics":       metrics,
        "criteria":      criteria,
        "verdict": (
            "Excellent — suitable for all professional and home use cases."
            if score >= 90 else
            "Good — suitable for most remote work and streaming needs."
            if score >= 75 else
            "Fair — may struggle with demanding tasks like 4K or large uploads."
            if score >= 60 else
            "Poor — recommend contacting your ISP or considering a plan upgrade."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Time-of-Day Best Time Recommender
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/best-time", tags=["analytics"], summary="Best time-of-day for internet activity")
def get_best_time(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.client_id == client_id, SpeedMeasurement.timestamp >= since)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Not enough data. Run auto-tests for a few days first.")

    from collections import defaultdict
    by_hour_dl: dict = defaultdict(list)
    by_hour_ul: dict = defaultdict(list)
    by_hour_pg: dict = defaultdict(list)
    by_dow:     dict = defaultdict(list)
    for r in rows:
        h   = r.timestamp.hour
        dow = r.timestamp.weekday()
        if r.download_speed:
            by_hour_dl[h].append(r.download_speed)
            by_dow[dow].append(r.download_speed)
        if r.upload_speed:
            by_hour_ul[h].append(r.upload_speed)
        if r.ping:
            by_hour_pg[h].append(r.ping)

    # Build hourly list covering all 24 hours (None if no data)
    hourly = []
    for h in range(24):
        dl_list = by_hour_dl.get(h, [])
        ul_list = by_hour_ul.get(h, [])
        pg_list = by_hour_pg.get(h, [])
        hourly.append({
            "hour":         h,
            "avg_download": round(sum(dl_list)/len(dl_list), 1) if dl_list else None,
            "avg_upload":   round(sum(ul_list)/len(ul_list), 1) if ul_list else None,
            "avg_ping":     round(sum(pg_list)/len(pg_list), 1) if pg_list else None,
            "sample_count": len(dl_list),
        })

    DAYS_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    daily = [
        {"dow": d, "label": DAYS_LABELS[d], "avg_download": round(sum(v)/len(v), 1), "samples": len(v)}
        for d, v in sorted(by_dow.items())
    ]

    hours_with_data = [h for h in hourly if h["avg_download"] is not None]
    best_hour  = max(hours_with_data, key=lambda x: x["avg_download"])["hour"] if hours_with_data else None
    worst_hour = min(hours_with_data, key=lambda x: x["avg_download"])["hour"] if hours_with_data else None

    best_day = max(daily, key=lambda x: x["avg_download"]) if daily else None

    # Best window description
    best_window = None
    if best_hour is not None:
        best_entry = hourly[best_hour]
        best_window = {
            "label": f"Best time to use internet: {best_hour:02d}:00",
            "description": (
                f"Average {best_entry['avg_download']} Mbps download at {best_hour:02d}:00"
                + (f" · avoid {worst_hour:02d}:00 ({hourly[worst_hour]['avg_download']} Mbps)" if worst_hour is not None and worst_hour != best_hour else "")
                + (f" · best day: {best_day['label']}" if best_day else "")
            ),
        }

    # Activity recommendations
    recommendations = []
    if hours_with_data:
        avg_dl_all = sum(h["avg_download"] for h in hours_with_data) / len(hours_with_data)
        activities = [
            ("4K Streaming",     25,  3),
            ("Video Calls",      5,   1),
            ("Large Downloads",  20,  0),
            ("Online Gaming",    3,   3),
            ("Cloud Backup",     10,  2),
        ]
        for activity, req_dl, req_ul in activities:
            feasible = avg_dl_all >= req_dl
            best_hrs = [h["hour"] for h in hours_with_data if (h["avg_download"] or 0) >= req_dl]
            recommendations.append({
                "activity":   activity,
                "feasible":   feasible,
                "best_hours": f"Best at: {', '.join(f'{h:02d}:00' for h in best_hrs[:3])}" if best_hrs else "No suitable hours found",
                "note":       f"Needs {req_dl} Mbps — your avg is {avg_dl_all:.1f} Mbps" if not feasible else "",
            })

    return {
        "period_days":   days,
        "samples":       len(rows),
        "hourly":        hourly,
        "daily":         daily,
        "best_download_hour":  best_hour,
        "worst_download_hour": worst_hour,
        "best_window":   best_window,
        "recommendations": recommendations,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. Multi-Device Aggregator
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/devices/link", tags=["devices"], summary="Join or create a device group")
def link_device(
    data: DeviceLinkIn,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    import uuid as _uuid
    group_id = data.group_id or str(_uuid.uuid4())
    # Check if this device is already in any group (mark first as primary)
    is_primary = not db.query(DeviceGroup).filter(DeviceGroup.client_id == client_id).first()
    existing = db.query(DeviceGroup).filter(
        DeviceGroup.group_id == group_id,
        DeviceGroup.client_id == client_id,
    ).first()
    if not existing:
        row = DeviceGroup(
            group_id=group_id, client_id=client_id,
            label=data.label, is_primary=is_primary,
        )
        db.add(row)
        db.commit()
    return {"message": "Device linked", "group_id": group_id}


@router.delete("/devices/link/{group_id}", tags=["devices"], summary="Leave device group")
def unlink_device(
    group_id: str,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    db.query(DeviceGroup).filter(
        DeviceGroup.group_id == group_id,
        DeviceGroup.client_id == client_id,
    ).delete()
    db.commit()
    return {"message": "Left group"}


@router.get("/devices/compare", tags=["devices"], summary="Compare all devices in a group")
def compare_devices(
    group_id: Optional[str] = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    # If no group_id given, use the first group this device belongs to
    if not group_id:
        my_group = db.query(DeviceGroup).filter(DeviceGroup.client_id == client_id).first()
        if not my_group:
            return {"devices": [], "message": "Not in any device group yet."}
        group_id = my_group.group_id

    members = db.query(DeviceGroup).filter(DeviceGroup.group_id == group_id).all()
    if not members:
        return {"devices": [], "message": "Group not found or empty."}

    since = datetime.utcnow() - timedelta(days=days)
    result = []
    for m in members:
        rows = (
            db.query(SpeedMeasurement)
            .filter(SpeedMeasurement.client_id == m.client_id, SpeedMeasurement.timestamp >= since)
            .all()
        )
        dls = [r.download_speed for r in rows if r.download_speed]
        uls = [r.upload_speed   for r in rows if r.upload_speed]
        pgs = [r.ping           for r in rows if r.ping]
        result.append({
            "client_id":    m.client_id,
            "label":        m.label,
            "is_primary":   m.is_primary,
            "is_me":        m.client_id == client_id,
            "sample_count": len(rows),
            "avg_download": round(sum(dls)/len(dls), 1) if dls else None,
            "avg_upload":   round(sum(uls)/len(uls), 1) if uls else None,
            "avg_ping":     round(sum(pgs)/len(pgs), 1) if pgs else None,
        })
    return {"group_id": group_id, "period_days": days, "devices": result}


@router.get("/devices/nearby", tags=["devices"], summary="Discover devices on the same local network")
def nearby_devices(
    request: Request,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """
    Detects other devices on the same WiFi/LAN by comparing public IP addresses.
    All devices behind the same router share one public IP, so this identifies
    devices on the same network without requiring Bluetooth or mDNS.

    Calling this endpoint also registers (or refreshes) this device as 'present'
    so that other devices on the network can discover it.
    """
    from ..models.measurement import UserLocation

    # Resolve client's public IP (behind Fly proxy the real IP is in X-Forwarded-For)
    forwarded = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host or "unknown")

    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")

    # Refresh / upsert presence record: delete stale then insert fresh
    db.query(UserLocation).filter(
        UserLocation.client_id == client_id,
        UserLocation.is_active == True,
    ).delete()
    presence = UserLocation(
        client_id=client_id,
        label="__nearby__",
        ip_hint=client_ip,
        is_active=True,
    )
    db.add(presence)
    db.commit()

    # Find other devices with the same IP seen in the last 10 minutes
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    others = (
        db.query(UserLocation)
        .filter(
            UserLocation.ip_hint == client_ip,
            UserLocation.client_id != client_id,
            UserLocation.is_active == True,
            UserLocation.created_at >= cutoff,
            UserLocation.label == "__nearby__",
        )
        .all()
    )

    # Find out which ones are already in a shared group with us
    my_group_ids = {
        r.group_id for r in db.query(DeviceGroup).filter(DeviceGroup.client_id == client_id).all()
    }

    nearby = []
    for o in others:
        already_linked = db.query(DeviceGroup).filter(
            DeviceGroup.client_id == o.client_id,
            DeviceGroup.group_id.in_(my_group_ids),
        ).first() is not None
        # Get a friendly label from the DeviceGroup if available
        dg = db.query(DeviceGroup).filter(DeviceGroup.client_id == o.client_id).first()
        nearby.append({
            "client_id":      o.client_id,
            "label":          dg.label if dg else "Unknown Device",
            "already_linked": already_linked,
            "last_seen":      o.created_at.isoformat(),
        })

    return {
        "nearby":    nearby,
        "total":     len(nearby),
        "my_ip":     client_ip,  # Returned so frontend can show "same network" confirmation
    }


@router.get("/devices/my-groups", tags=["devices"], summary="List groups this device belongs to")
def my_groups(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    rows = db.query(DeviceGroup).filter(DeviceGroup.client_id == client_id).all()
    groups = [
        {
            "id":         r.id,
            "group_id":   r.group_id,
            "label":      r.label,
            "is_primary": r.is_primary,
            "joined_at":  r.joined_at.isoformat() if r.joined_at else None,
        }
        for r in rows
    ]
    return {"groups": groups}


# ─────────────────────────────────────────────────────────────────────────────
# 5. DNS Performance Monitor
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/dns-test", tags=["diagnostics"], summary="Test response time of popular DNS resolvers")
async def dns_test(
    host: str = Query(default="example.com"),
):
    import asyncio as _aio, socket as _socket, time as _time

    RESOLVERS = [
        {"name": "Cloudflare",  "ip": "1.1.1.1"},
        {"name": "Google",      "ip": "8.8.8.8"},
        {"name": "Quad9",       "ip": "9.9.9.9"},
        {"name": "OpenDNS",     "ip": "208.67.222.222"},
        {"name": "Cloudflare2", "ip": "1.0.0.1"},
        {"name": "Google2",     "ip": "8.8.4.4"},
    ]

    async def test_resolver(name: str, ip: str) -> dict:
        loop = _aio.get_event_loop()
        try:
            t0 = _time.perf_counter()
            await loop.run_in_executor(None, lambda: _socket.getaddrinfo(host, None, _socket.AF_INET))
            ms = round((_time.perf_counter() - t0) * 1000, 1)
            return {"name": name, "ip": ip, "latency_ms": ms, "ok": True}
        except Exception as e:
            return {"name": name, "ip": ip, "latency_ms": None, "ok": False, "error": str(e)}

    results = await _aio.gather(*[test_resolver(r["name"], r["ip"]) for r in RESOLVERS])
    results = sorted(results, key=lambda x: x["latency_ms"] if x["latency_ms"] is not None else 9999)
    best = next((r for r in results if r["ok"]), None)
    return {
        "host":       host,
        "tested_at":  datetime.utcnow().isoformat(),
        "results":    list(results),
        "fastest":    best,
        "recommendation": (
            f"Use {best['name']} DNS ({best['ip']}) — fastest at {best['latency_ms']} ms."
            if best else "All resolvers failed."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. ISP Complaint Letter Generator
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/complaint-letter", tags=["contract"], summary="Generate an ISP complaint letter from your data")
def generate_complaint_letter(
    days:           int = Query(default=30, ge=7, le=90),
    your_name:      str = Query(default=""),
    your_address:   str = Query(default=""),
    isp_name:       str = Query(default=""),
    account_number: str = Query(default=""),
    issue_start:    str = Query(default=""),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")

    contract = db.query(ISPContract).filter(ISPContract.client_id == client_id).first()
    since = datetime.utcnow() - timedelta(days=days)
    rows  = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.client_id == client_id, SpeedMeasurement.timestamp >= since)
        .all()
    )

    dls    = [r.download_speed for r in rows if r.download_speed]
    avg_dl = round(sum(dls)/len(dls), 1) if dls else 0
    outages = sum(1 for r in rows if r.is_outage)

    isp          = isp_name or (contract.isp_name if contract else (rows[-1].isp if rows else "My ISP"))
    promised_dl  = contract.promised_download if contract else None
    plan_name    = contract.plan_name       if contract else None
    cost         = contract.monthly_cost    if contract else None
    currency     = contract.currency        if contract else "USD"
    sender_name  = your_name    or "[Your Full Name]"
    sender_addr  = your_address or "[Your Address]"
    acct_no      = account_number or "[Your Account Number]"
    issue_period = issue_start or start_date

    delivery_str = (
        f"{round((avg_dl / promised_dl)*100)}% of the contracted {promised_dl} Mbps"
        if promised_dl else f"{avg_dl} Mbps on average"
    )

    today    = datetime.utcnow().strftime("%B %d, %Y")
    end_date = datetime.utcnow().strftime("%B %d, %Y")
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%B %d, %Y")

    letter = f"""{today}

Customer Services Department
{isp}

Subject: Formal Complaint — Persistent Failure to Deliver Contracted Internet Speeds

Dear {isp} Customer Services,

I am writing to formally lodge a complaint regarding the consistent failure to deliver the internet speeds specified in my service agreement{f" ({plan_name})" if plan_name else ""}.

CONTRACTED SERVICE
{"Plan: " + plan_name + chr(10) if plan_name else ""}Promised download speed: {f"{promised_dl} Mbps" if promised_dl else "as per contract"}
{"Monthly cost: " + currency + " " + str(cost) + chr(10) if cost else ""}

MEASURED PERFORMANCE ({start_date} – {end_date})
I have conducted {len(rows)} independent speed tests over the past {days} days using the Internet Stability Tracker monitoring tool. The results are as follows:

- Average download speed: {avg_dl} Mbps ({delivery_str})
- Number of outage events recorded: {outages}
- Monitoring period: {days} days

{"This represents a significant shortfall from the contracted speed, amounting to a failure to deliver the agreed service." if promised_dl and avg_dl < promised_dl * 0.8 else "While speeds have occasionally met the contracted level, persistent variability has impacted the reliability of my connection."}

REQUESTED RESOLUTION
I respectfully request that you:

1. Investigate the cause of the persistent underperformance at my address.
2. Provide a written explanation within 14 days of the root cause and planned remediation.
3. Apply a pro-rata credit to my account for the period of underperformance.
4. If the issue cannot be resolved within 30 days, allow me to terminate my contract without early-termination penalties.

I have retained all speed test records as evidence and am prepared to submit them to the relevant telecommunications regulator if a satisfactory resolution is not reached.

Please respond in writing within 14 days.

Yours sincerely,

{sender_name}
{acct_no}
{sender_addr}
[Your Email / Phone]

---
Evidence reference: {len(rows)} speed tests, {issue_period} to {end_date}.
Generated by Internet Stability Tracker — https://backend-cold-butterfly-9535.fly.dev
"""

    sections = [
        {"title": "Header",            "content": f"{today}\n\nCustomer Services Department\n{isp}"},
        {"title": "Subject",           "content": f"Formal Complaint — Persistent Failure to Deliver Contracted Internet Speeds"},
        {"title": "Performance Data",  "content": f"Average download: {avg_dl} Mbps over {len(rows)} tests in {days} days. Outages: {outages}."},
        {"title": "Requested Action",  "content": "Investigation, written explanation, account credit, and option to cancel without penalty."},
    ]

    severity = (
        "high"   if (promised_dl and avg_dl < promised_dl * 0.5) or outages >= 5
        else "medium" if (promised_dl and avg_dl < promised_dl * 0.8) or outages >= 2
        else "low"
    )

    evidence = [
        {"label": "Measurement period",    "value": f"{start_date} – {end_date}"},
        {"label": "Total speed tests",     "value": str(len(rows))},
        {"label": "Avg download speed",    "value": f"{avg_dl} Mbps"},
        {"label": "Promised download",     "value": f"{promised_dl} Mbps" if promised_dl else "Not on file"},
        {"label": "Speed delivery",        "value": f"{delivery_str}"},
        {"label": "Outage events",         "value": str(outages)},
    ]
    if cost:
        evidence.append({"label": "Monthly cost", "value": f"{currency} {cost}"})

    return {
        "letter_text":       letter,
        "sections":          sections,
        "evidence":          evidence,
        "severity":          severity,
        "isp":               isp,
        "period_days":       days,
        "tests":             len(rows),
        "avg_download":      avg_dl,
        "promised_download": promised_dl,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 7. Scheduled Speed Tests
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/schedules", tags=["schedules"], summary="List speed test schedules")
def list_schedules(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    rows = db.query(TestSchedule).filter(TestSchedule.client_id == client_id).all()
    schedules = [
        {
            "id": r.id, "label": r.label, "hours": r.hours, "days": r.days,
            "enabled": r.enabled, "burst_count": r.burst_count,
            "last_run": r.last_run.isoformat() if r.last_run else None,
        }
        for r in rows
    ]
    return {"schedules": schedules}


@router.post("/schedules", tags=["schedules"], summary="Create a speed test schedule")
def create_schedule(
    data: ScheduleIn,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    count = db.query(TestSchedule).filter(TestSchedule.client_id == client_id).count()
    if count >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 schedules per device.")
    s = TestSchedule(
        client_id=client_id, label=data.label,
        hours=data.hours, days=data.days,
        enabled=data.enabled, burst_count=max(1, min(5, data.burst_count)),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "message": "Schedule created"}


@router.put("/schedules/{schedule_id}", tags=["schedules"], summary="Update a schedule")
def update_schedule(
    schedule_id: int,
    data: ScheduleIn,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    s = db.query(TestSchedule).filter(
        TestSchedule.id == schedule_id,
        TestSchedule.client_id == client_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    s.label = data.label; s.hours = data.hours; s.days = data.days
    s.enabled = data.enabled; s.burst_count = max(1, min(5, data.burst_count))
    db.commit()
    return {"message": "Schedule updated"}


@router.delete("/schedules/{schedule_id}", tags=["schedules"], summary="Delete a schedule")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    db.query(TestSchedule).filter(
        TestSchedule.id == schedule_id,
        TestSchedule.client_id == client_id,
    ).delete()
    db.commit()
    return {"message": "Schedule deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# 8. Packet Loss & Jitter Monitor
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/packet-loss/run", tags=["diagnostics"], summary="Run a packet loss and jitter test")
async def run_packet_loss(
    target: str = Query(default="1.1.1.1"),
    count:  int = Query(default=10, ge=4, le=30),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    """
    Measures RTT and packet loss using TCP probes (port 443 then 80).
    Does NOT use ICMP ping — no root/CAP_NET_RAW required.
    Each probe opens and immediately closes a TCP connection; the time
    is equivalent to network round-trip + TCP handshake overhead.
    """
    import asyncio as _aio, socket as _socket, time as _time

    # Resolve hostname once
    try:
        resolved_ip = (await _aio.get_event_loop().run_in_executor(
            None, lambda: _socket.getaddrinfo(target, None, _socket.AF_INET)[0][4][0]
        ))
    except Exception:
        resolved_ip = target

    async def tcp_probe(host: str) -> Optional[float]:
        """TCP connect to port 443, fallback 80. Returns RTT in ms or None."""
        for port in (443, 80, 53):
            try:
                t0 = _time.perf_counter()
                _, writer = await _aio.wait_for(
                    _aio.open_connection(host, port), timeout=2.0
                )
                ms = round((_time.perf_counter() - t0) * 1000, 1)
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                return ms
            except (_aio.TimeoutError, ConnectionRefusedError):
                continue
            except Exception:
                continue
        return None

    # Run probes sequentially (not all parallel) to better simulate real traffic
    times: list = []
    for _ in range(count):
        ms = await tcp_probe(resolved_ip)
        times.append(ms)
        await _aio.sleep(0.15)   # 150 ms between probes

    valid    = [t for t in times if t is not None]
    lost     = count - len(valid)
    loss_pct = round((lost / count) * 100, 1)

    avg_ms  = round(sum(valid) / len(valid), 1) if valid else None
    min_ms  = round(min(valid), 1)              if valid else None
    max_ms  = round(max(valid), 1)              if valid else None
    jitter  = None
    if len(valid) >= 2:
        diffs  = [abs(valid[i + 1] - valid[i]) for i in range(len(valid) - 1)]
        jitter = round(sum(diffs) / len(diffs), 1)

    reading = PacketLossReading(
        client_id=client_id or "anonymous",
        loss_pct=loss_pct,
        jitter_ms=jitter,
        avg_ping_ms=avg_ms,
        target=target,
    )
    db.add(reading)
    db.commit()

    quality = (
        "Excellent" if loss_pct == 0  and (jitter or 0) < 5
        else "Good" if loss_pct < 1   and (jitter or 0) < 15
        else "Fair" if loss_pct < 5   and (jitter or 0) < 30
        else "Poor"
    )

    return {
        "target":      target,
        "sent":        count,
        "received":    len(valid),
        "lost":        lost,
        "loss_pct":    loss_pct,
        "avg_ping_ms": avg_ms,
        "min_ping_ms": min_ms,
        "max_ping_ms": max_ms,
        "jitter_ms":   jitter,
        "quality":     quality,
        "suitable_for": {
            "video_calls": loss_pct < 1   and (avg_ms or 999) < 150,
            "gaming":      loss_pct < 0.5 and (avg_ms or 999) < 50  and (jitter or 999) < 10,
            "voip":        loss_pct < 1   and (jitter or 999) < 20,
            "streaming":   loss_pct < 2,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/packet-loss/history", tags=["diagnostics"], summary="Recent packet loss history")
def packet_loss_history(
    limit: int = Query(default=48, ge=1, le=200),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    rows = (
        db.query(PacketLossReading)
        .filter(PacketLossReading.client_id == client_id)
        .order_by(PacketLossReading.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "timestamp":  r.timestamp.isoformat(),
            "loss_pct":   r.loss_pct,
            "jitter_ms":  r.jitter_ms,
            "avg_ping_ms": r.avg_ping_ms,
            "target":     r.target,
        }
        for r in reversed(rows)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# 9. Neighborhood Outage Clustering
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/neighborhood-outages", tags=["outages"], summary="Geo-clustered community outage reports")
def neighborhood_outages(
    lat:    float = Query(..., description="Your latitude"),
    lon:    float = Query(..., description="Your longitude"),
    radius: float = Query(default=50.0, description="Radius in km"),
    hours:  int   = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
):
    import math

    since = datetime.utcnow() - timedelta(hours=hours)
    reports = (
        db.query(CommunityReport)
        .filter(
            CommunityReport.timestamp >= since,
            CommunityReport.latitude.isnot(None),
            CommunityReport.longitude.isnot(None),
        )
        .all()
    )

    def haversine(lat1, lon1, lat2, lon2) -> float:
        R = 6371
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    nearby = []
    for r in reports:
        dist = haversine(lat, lon, r.latitude, r.longitude)
        if dist <= radius:
            nearby.append({
                "id":        r.id,
                "isp":       r.isp,
                "issue_type": r.issue_type,
                "location":  r.location,
                "latitude":  r.latitude,
                "longitude": r.longitude,
                "distance_km": round(dist, 1),
                "timestamp": r.timestamp.isoformat(),
            })

    nearby.sort(key=lambda x: x["distance_km"])

    # Cluster by ISP
    from collections import Counter
    isp_counts = Counter(r["isp"] for r in nearby if r["isp"])
    issue_counts = Counter(r["issue_type"] for r in nearby if r["issue_type"])

    verdict = "local"
    if nearby:
        top_isp = isp_counts.most_common(1)[0]
        if top_isp[1] >= 3:
            verdict = "isp_wide"
        elif len(nearby) >= 5:
            verdict = "area_wide"

    return {
        "your_location":    {"lat": lat, "lon": lon},
        "radius_km":        radius,
        "hours":            hours,
        "total_reports":    len(nearby),
        "verdict":          verdict,
        "verdict_label": {
            "local":     "Likely a local issue — few nearby reports.",
            "area_wide": "Area-wide issue — multiple nearby reports across ISPs.",
            "isp_wide":  f"ISP-wide issue — concentrated reports for {isp_counts.most_common(1)[0][0] if isp_counts else 'your ISP'}.",
        }.get(verdict, "Unknown"),
        "top_isps":         [{"isp": k, "count": v} for k, v in isp_counts.most_common(5)],
        "issue_types":      [{"type": k, "count": v} for k, v in issue_counts.most_common()],
        "reports":          nearby[:50],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 10. Work From Home Readiness Score
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/wfh-score", tags=["analytics"], summary="Work-from-home readiness score")
def get_wfh_score(
    days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    since = datetime.utcnow() - timedelta(days=days)
    rows  = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.client_id == client_id, SpeedMeasurement.timestamp >= since)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No speed tests found. Run a test first.")

    dls  = [r.download_speed for r in rows if r.download_speed]
    uls  = [r.upload_speed   for r in rows if r.upload_speed]
    pgs  = [r.ping           for r in rows if r.ping]
    outs = sum(1 for r in rows if r.is_outage)

    avg_dl   = sum(dls)/len(dls) if dls else 0
    avg_ul   = sum(uls)/len(uls) if uls else 0
    avg_ping = sum(pgs)/len(pgs) if pgs else 999
    uptime   = round((1 - outs/len(rows)) * 100, 1)

    # Jitter estimate from ping variance
    if len(pgs) >= 2:
        mean_pg = sum(pgs)/len(pgs)
        jitter  = round(sum(abs(p - mean_pg) for p in pgs) / len(pgs), 1)
    else:
        jitter = 20.0  # assume moderate

    WFH_APPS = [
        {
            "name": "Zoom 1080p",
            "icon": "videocam",
            "req_dl": 3.8, "req_ul": 3.8, "req_ping": 150, "req_jitter": 30, "req_loss": 1.0,
            "color": "#2D8CFF",
        },
        {
            "name": "Microsoft Teams",
            "icon": "groups",
            "req_dl": 4.0, "req_ul": 1.5, "req_ping": 100, "req_jitter": 30, "req_loss": 1.0,
            "color": "#6264A7",
        },
        {
            "name": "Google Meet",
            "icon": "video_call",
            "req_dl": 3.2, "req_ul": 3.2, "req_ping": 150, "req_jitter": 40, "req_loss": 2.0,
            "color": "#00897B",
        },
        {
            "name": "4K Streaming",
            "icon": "tv",
            "req_dl": 25.0, "req_ul": 0, "req_ping": 500, "req_jitter": 100, "req_loss": 5.0,
            "color": "#E53935",
        },
        {
            "name": "Online Gaming",
            "icon": "sports_esports",
            "req_dl": 3.0, "req_ul": 1.0, "req_ping": 50, "req_jitter": 10, "req_loss": 0.5,
            "color": "#43A047",
        },
        {
            "name": "Large File Backup",
            "icon": "cloud_upload",
            "req_dl": 0, "req_ul": 10.0, "req_ping": 500, "req_jitter": 200, "req_loss": 5.0,
            "color": "#FB8C00",
        },
        {
            "name": "VoIP / Calls",
            "icon": "phone",
            "req_dl": 0.1, "req_ul": 0.1, "req_ping": 150, "req_jitter": 20, "req_loss": 1.0,
            "color": "#8E24AA",
        },
        {
            "name": "Slack / Chat",
            "icon": "chat",
            "req_dl": 0.5, "req_ul": 0.5, "req_ping": 300, "req_jitter": 50, "req_loss": 3.0,
            "color": "#4A154B",
        },
    ]

    app_results = []
    for app in WFH_APPS:
        requirements = []
        if app["req_dl"] > 0:
            requirements.append({
                "metric":   "Download",
                "actual":   f"{avg_dl:.1f} Mbps",
                "required": f"{app['req_dl']} Mbps",
                "pass":     avg_dl >= app["req_dl"],
            })
        if app["req_ul"] > 0:
            requirements.append({
                "metric":   "Upload",
                "actual":   f"{avg_ul:.1f} Mbps",
                "required": f"{app['req_ul']} Mbps",
                "pass":     avg_ul >= app["req_ul"],
            })
        if app["req_ping"] < 400:
            requirements.append({
                "metric":   "Ping",
                "actual":   f"{avg_ping:.0f} ms",
                "required": f"< {app['req_ping']} ms",
                "pass":     avg_ping <= app["req_ping"],
            })
        if app["req_jitter"] < 100:
            requirements.append({
                "metric":   "Jitter",
                "actual":   f"{jitter:.1f} ms",
                "required": f"< {app['req_jitter']} ms",
                "pass":     jitter <= app["req_jitter"],
            })

        passed = sum(1 for r in requirements if r["pass"])
        total  = len(requirements)
        status = "pass" if passed == total else "warn" if passed >= total * 0.5 else "fail"
        app_results.append({
            "name":         app["name"],
            "status":       status,
            "requirements": requirements,
            "note": (
                "Excellent!" if status == "pass"
                else "Marginal — may have issues in poor conditions."
                if status == "warn"
                else "Does not meet minimum requirements."
            ),
        })

    pass_count = sum(1 for a in app_results if a["status"] == "pass")
    warn_count = sum(1 for a in app_results if a["status"] == "warn")
    fail_count = sum(1 for a in app_results if a["status"] == "fail")
    overall_score = round((pass_count / len(app_results)) * 100)

    recommendations = []
    if avg_dl < 10:
        recommendations.append("Your download speed is below 10 Mbps — consider upgrading your plan for smooth video calls.")
    if avg_ul < 5:
        recommendations.append("Upload speed is low — large file transfers and screen sharing may be slow.")
    if avg_ping > 100:
        recommendations.append("High latency detected — try connecting via Ethernet instead of Wi-Fi.")
    if uptime < 95:
        recommendations.append(f"Connection uptime is {uptime}% — instability may disrupt live meetings.")

    return {
        "overall_score": overall_score,
        "current": {
            "download_mbps": round(avg_dl, 1),
            "upload_mbps":   round(avg_ul, 1),
            "ping_ms":       round(avg_ping, 1),
            "uptime_pct":    uptime,
        },
        "summary": {
            "pass": pass_count,
            "warn": warn_count,
            "fail": fail_count,
        },
        "apps":            app_results,
        "recommendations": recommendations,
        "period_days":     days,
        "tests":           len(rows),
    }



# ─────────────────────────────────────────────────────────────────────────────
# Internet Crisis Monitor
# ─────────────────────────────────────────────────────────────────────────────

from app.services.crisis_service import (
    fetch_global_status,
    analyze_local_crisis as _analyze_local,
    log_crisis_event,
    get_crisis_history,
    get_community_impact,
)


@router.get("/internet-crisis", tags=["crisis"], summary="Combined local + global internet crisis status")
async def get_internet_crisis(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    local         = _analyze_local(db, client_id) if client_id else {
        "status": "unknown", "message": "No client ID — run a speed test first.",
        "current_download_mbps": None, "baseline_download_mbps": None, "pct_of_baseline": None,
    }
    global_status = await fetch_global_status()

    sev_order = {"outage": 6, "critical": 5, "major": 4, "minor": 3, "none": 1, "unknown": 0}
    local_sev  = local.get("status", "unknown")
    global_sev = global_status.get("severity", "unknown")
    combined   = max(local_sev, global_sev, key=lambda x: sev_order.get(x, 0))

    # Contextual alert message using real data
    affected_names = [s["name"] for s in global_status.get("services", [])
                      if s.get("indicator") not in ("none", "unknown", None)]
    local_dl = local.get("current_download_mbps")
    pct      = local.get("pct_of_baseline")

    if combined in ("outage", "critical"):
        parts = []
        if local_sev in ("outage", "critical") and local_dl is not None:
            parts.append(f"your connection is at {local_dl} Mbps ({pct}% of baseline)")
        if affected_names:
            parts.append(f"{', '.join(affected_names[:3])} {'are' if len(affected_names) > 1 else 'is'} reporting incidents")
        alert = "⚠️ Serious internet crisis — " + ("; ".join(parts) if parts else "both local and global issues detected") + "."
    elif combined == "major":
        parts = []
        if local_dl is not None and pct is not None and pct < 80:
            parts.append(f"your speed is at {pct}% of normal")
        if affected_names:
            parts.append(f"{len(affected_names)} provider(s) affected")
        alert = "🔶 Major disruption — " + (", ".join(parts) if parts else "significant issues detected") + "."
    elif combined == "minor":
        parts = []
        if affected_names:
            parts.append(f"{affected_names[0]} reporting minor issues")
        if local_dl is not None and pct is not None and pct < 90:
            parts.append(f"your speed is {pct}% of baseline")
        alert = "🟡 Minor disruptions — " + (", ".join(parts) if parts else "slight degradation detected") + "."
    elif combined == "none":
        dl_str = f" ({local_dl} Mbps)" if local_dl else ""
        alert = f"✅ All systems normal{dl_str}. No crisis signals detected."
    else:
        alert = "ℹ️ Run a speed test to get your local status. Global infrastructure is being monitored."

    # Persist event to history (non-blocking — ignore errors)
    try:
        log_crisis_event(db, combined, local, global_status, client_id)
    except Exception:
        pass

    return {
        "combined_severity": combined,
        "alert_message":     alert,
        "local":             local,
        "global":            global_status,
        "generated_at":      datetime.utcnow().isoformat() + "Z",
    }


@router.get("/internet-crisis/global", tags=["crisis"], summary="Live global infrastructure status (cached 5 min)")
async def get_global_crisis():
    return await fetch_global_status()


@router.get("/internet-crisis/local", tags=["crisis"], summary="Local connection crisis analysis")
def get_local_crisis(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID required")
    return _analyze_local(db, client_id)


@router.get("/internet-crisis/history", tags=["crisis"], summary="Crisis event history (last N days)")
def get_crisis_history_route(
    days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Depends(get_client_id),
):
    return {
        "days": days,
        "events": get_crisis_history(db, client_id, days),
    }


@router.get("/internet-crisis/community-impact", tags=["crisis"], summary="Community outage reports and ISP impact")
def get_crisis_community_impact(
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
):
    return get_community_impact(db, hours)
