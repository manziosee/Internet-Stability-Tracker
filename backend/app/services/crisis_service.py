"""Internet Crisis Detection Service

Signals combined:
  1. LOCAL  — user's own recent speed tests vs 7-day baseline
  2. GLOBAL — live Atlassian Statuspage JSON feeds (Cloudflare, GitHub, Discord, Reddit, Atlassian)
  3. IODA   — Georgia Tech Internet Outage Detection & Analysis (public API, no auth)
  4. HISTORY — stores detected events in DB for trending
"""
import asyncio
import statistics
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from app.models.measurement import CommunityReport, CrisisLog, SpeedMeasurement

# ── Simple in-process cache ───────────────────────────────────────────────────
_cache: Dict[str, Any] = {}
_CACHE_TTL = 300  # 5 minutes

# ── Atlassian Statuspage providers (public, no auth) ─────────────────────────
_STATUSPAGE_PROVIDERS = [
    {"name": "Cloudflare", "url": "https://www.cloudflarestatus.com/api/v2/summary.json",
     "description": "CDN & DNS powering ~20% of the web", "icon": "🌐"},
    {"name": "GitHub",     "url": "https://www.githubstatus.com/api/v2/summary.json",
     "description": "Developer infrastructure & code hosting", "icon": "🐙"},
    {"name": "Discord",    "url": "https://discordstatus.com/api/v2/summary.json",
     "description": "Real-time communication platform", "icon": "💬"},
    {"name": "Reddit",     "url": "https://www.redditstatus.com/api/v2/summary.json",
     "description": "Large-scale social media platform", "icon": "🟠"},
    {"name": "Atlassian",  "url": "https://status.atlassian.com/api/v2/summary.json",
     "description": "Jira, Confluence & developer tools", "icon": "⚙️"},
    {"name": "Stripe",     "url": "https://status.stripe.com/api/v2/summary.json",
     "description": "Global payment infrastructure", "icon": "💳"},
    {"name": "Twilio",     "url": "https://status.twilio.com/api/v2/summary.json",
     "description": "Communications APIs (SMS, voice)", "icon": "📞"},
]

_SEV_ORDER = {"critical": 5, "major": 4, "minor": 3, "none": 1, "unknown": 0}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _fetch_statuspage(provider: Dict) -> Dict:
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(provider["url"])
            if r.status_code != 200:
                raise ValueError(f"HTTP {r.status_code}")
            data = r.json()

        status      = data.get("status", {})
        indicator   = status.get("indicator", "none")
        description = status.get("description", "All Systems Operational")
        incidents   = [i for i in data.get("incidents", [])
                       if i.get("status") not in ("resolved", "postmortem")]
        degraded    = [c["name"] for c in data.get("components", [])
                       if c.get("status") not in ("operational", "")][:5]

        return {
            "name":              provider["name"],
            "icon":              provider["icon"],
            "description":       provider["description"],
            "indicator":         indicator,
            "status_text":       description,
            "ok":                indicator == "none",
            "active_incidents":  len(incidents),
            "degraded_components": degraded,
            "incidents": [
                {"name":       i.get("name", "Untitled"),
                 "status":     i.get("status"),
                 "impact":     i.get("impact"),
                 "started_at": i.get("created_at"),
                 "updated_at": i.get("updated_at"),
                 "shortlink":  i.get("shortlink")}
                for i in incidents[:3]
            ],
        }
    except Exception as exc:
        return {
            "name": provider["name"], "icon": provider["icon"],
            "description": provider["description"],
            "indicator": "unknown", "status_text": "Status page unreachable",
            "ok": None, "active_incidents": 0,
            "degraded_components": [], "incidents": [],
            "error": str(exc)[:100],
        }


async def _fetch_ioda() -> Dict:
    """Fetch global internet outage summary from IODA (Georgia Tech, free public API)."""
    try:
        now   = int(time.time())
        start = now - 3600  # last hour
        url   = f"https://ioda.inetintel.cc.gatech.edu/api/v2/signals/raw?from={start}&until={now}&datasource=bgp&limit=1"
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
        if r.status_code == 200:
            data = r.json()
            # IODA returns signal data — derive a basic health score
            signals = data.get("data", {}).get("bgp", {})
            return {
                "source": "IODA (Georgia Tech)",
                "available": True,
                "raw_signals": signals,
                "description": "BGP routing health from Internet Outage Detection & Analysis",
            }
    except Exception as exc:
        pass
    return {"source": "IODA (Georgia Tech)", "available": False,
            "description": "BGP routing health — currently unreachable"}


def _global_severity(services: List[Dict]) -> str:
    known = [s["indicator"] for s in services if s.get("indicator") not in (None, "unknown")]
    if not known:
        return "unknown"
    return max(known, key=lambda x: _SEV_ORDER.get(x, 0))


# ── Public API ────────────────────────────────────────────────────────────────

async def fetch_global_status() -> Dict:
    """Fetch live status from all providers + IODA. Cached 5 min."""
    now = time.time()
    cached = _cache.get("global")
    if cached and now - cached["_fetched_at"] < _CACHE_TTL:
        return cached

    statuspage_results, ioda = await asyncio.gather(
        asyncio.gather(*[_fetch_statuspage(p) for p in _STATUSPAGE_PROVIDERS], return_exceptions=True),
        _fetch_ioda(),
    )

    services: List[Dict] = [r for r in statuspage_results if isinstance(r, dict)]
    severity    = _global_severity(services)
    affected    = [s for s in services if s.get("indicator") not in ("none", "unknown", None)]
    total_inc   = sum(s.get("active_incidents", 0) for s in services)

    summary = (
        "Multiple major infrastructure providers are experiencing issues — widespread impact likely."
        if len(affected) >= 3 else
        f"{len(affected)} provider(s) reporting issues." if affected else
        "All monitored infrastructure providers are operating normally."
    )

    out: Dict[str, Any] = {
        "severity":          severity,
        "summary":           summary,
        "affected_count":    len(affected),
        "total_incidents":   total_inc,
        "services":          services,
        "providers_checked": len(services),
        "ioda":              ioda,
        "checked_at":        datetime.utcnow().isoformat() + "Z",
        "_fetched_at":       now,
    }
    _cache["global"] = out
    return out


def analyze_local_crisis(db: Session, client_id: str) -> Dict:
    """Compare last 5 tests against 7-day baseline."""
    now = datetime.utcnow()

    recent: List[SpeedMeasurement] = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.client_id == client_id)
        .order_by(SpeedMeasurement.timestamp.desc())
        .limit(5).all()
    )

    if not recent:
        return {"status": "unknown", "message": "No speed tests yet — run one from the Dashboard.",
                "current_download_mbps": None, "baseline_download_mbps": None, "pct_of_baseline": None}

    week_ago = now - timedelta(days=7)
    baseline_rows = (
        db.query(SpeedMeasurement)
        .filter(SpeedMeasurement.client_id == client_id, SpeedMeasurement.timestamp >= week_ago)
        .all()
    )

    recent_dls   = [r.download_speed for r in recent       if r.download_speed and r.download_speed > 0]
    baseline_dls = [r.download_speed for r in baseline_rows if r.download_speed and r.download_speed > 0]
    recent_pings = [r.ping for r in recent if r.ping and r.ping > 0]
    recent_uls   = [r.upload_speed for r in recent if r.upload_speed and r.upload_speed > 0]

    if not recent_dls:
        return {"status": "unknown", "message": "Recent measurements have no download data.",
                "current_download_mbps": None, "baseline_download_mbps": None, "pct_of_baseline": None}

    recent_avg   = statistics.mean(recent_dls)
    baseline_avg = statistics.mean(baseline_dls) if baseline_dls else recent_avg
    pct          = round((recent_avg / baseline_avg) * 100) if baseline_avg else 100
    outage_count = sum(1 for r in recent if r.is_outage)
    avg_ping     = round(statistics.mean(recent_pings)) if recent_pings else None
    avg_ul       = round(statistics.mean(recent_uls), 1) if recent_uls else None

    # Jitter (std dev of pings)
    jitter = None
    if len(recent_pings) > 1:
        try:
            jitter = round(statistics.stdev(recent_pings), 1)
        except Exception:
            pass

    if outage_count >= 2 or recent_avg < 0.5:
        sev = "outage"
        msg = f"Outage detected — {recent_avg:.1f} Mbps vs normal {baseline_avg:.1f} Mbps."
    elif pct < 20:
        sev = "critical"
        msg = f"Critical degradation: only {pct}% of your normal speed."
    elif pct < 50:
        sev = "major"
        msg = f"Major slowdown: {pct}% of your normal speed ({recent_avg:.1f} Mbps)."
    elif pct < 80:
        sev = "minor"
        msg = f"Slight degradation: {pct}% of baseline speed."
    else:
        sev = "none"
        msg = f"Connection is normal — {recent_avg:.1f} Mbps ({pct}% of baseline)."

    day_ago = now - timedelta(hours=24)
    community_24h: int = (
        db.query(CommunityReport).filter(CommunityReport.timestamp >= day_ago).count()
    )

    # ISP of most recent test
    isp = recent[0].isp if recent[0].isp else None

    # Trend vs 24h average
    day_rows = [r for r in baseline_rows if r.timestamp >= day_ago and r.download_speed]
    day_avg  = round(statistics.mean([r.download_speed for r in day_rows]), 1) if day_rows else None

    return {
        "status":                  sev,
        "message":                 msg,
        "current_download_mbps":   round(recent_avg, 1),
        "current_upload_mbps":     avg_ul,
        "baseline_download_mbps":  round(baseline_avg, 1),
        "pct_of_baseline":         pct,
        "outage_events_in_sample": outage_count,
        "avg_ping_ms":             avg_ping,
        "jitter_ms":               jitter,
        "day_avg_download_mbps":   day_avg,
        "community_reports_24h":   community_24h,
        "isp":                     isp,
        "last_test_at":            recent[0].timestamp.isoformat() + "Z",
        "samples_analyzed":        len(recent),
        "baseline_samples":        len(baseline_dls),
    }


def log_crisis_event(db: Session, combined: str, local: Dict, global_data: Dict,
                     client_id: Optional[str] = None) -> None:
    """Persist a crisis event to DB when severity >= minor. Deduplicates within 30 min."""
    if combined in ("none", "unknown"):
        return

    cutoff = datetime.utcnow() - timedelta(minutes=30)
    recent = (
        db.query(CrisisLog)
        .filter(
            CrisisLog.client_id == client_id,
            CrisisLog.combined_severity == combined,
            CrisisLog.timestamp >= cutoff,
        )
        .first()
    )
    if recent:
        return  # already logged recently

    affected = [s["name"] for s in global_data.get("services", [])
                if s.get("indicator") not in ("none", "unknown", None)]

    entry = CrisisLog(
        combined_severity    = combined,
        local_severity       = local.get("status"),
        global_severity      = global_data.get("severity"),
        local_download_mbps  = local.get("current_download_mbps"),
        pct_of_baseline      = local.get("pct_of_baseline"),
        affected_services    = affected,
        total_incidents      = global_data.get("total_incidents", 0),
        community_reports_24h = local.get("community_reports_24h", 0),
        client_id            = client_id,
    )
    try:
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()


def get_crisis_history(db: Session, client_id: Optional[str], days: int = 7) -> List[Dict]:
    """Return crisis events from the last N days."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(CrisisLog)
        .filter(
            CrisisLog.timestamp >= cutoff,
            (CrisisLog.client_id == client_id) if client_id else True,
        )
        .order_by(CrisisLog.timestamp.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "timestamp":          r.timestamp.isoformat() + "Z",
            "combined_severity":  r.combined_severity,
            "local_severity":     r.local_severity,
            "global_severity":    r.global_severity,
            "local_download_mbps": r.local_download_mbps,
            "pct_of_baseline":    r.pct_of_baseline,
            "affected_services":  r.affected_services or [],
            "total_incidents":    r.total_incidents,
            "community_reports_24h": r.community_reports_24h,
        }
        for r in rows
    ]


def get_community_impact(db: Session, hours: int = 24) -> Dict:
    """Aggregate community reports and outage events for impact summary."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    reports = (
        db.query(CommunityReport)
        .filter(CommunityReport.timestamp >= cutoff)
        .all()
    )

    from app.models.measurement import OutageEvent
    outages = (
        db.query(OutageEvent)
        .filter(OutageEvent.started_at >= cutoff)
        .all()
    )

    # ISP breakdown
    isp_counts: Dict[str, int] = {}
    issue_types: Dict[str, int] = {}
    for r in reports:
        if r.isp:
            isp_counts[r.isp] = isp_counts.get(r.isp, 0) + 1
        if r.issue_type:
            issue_types[r.issue_type] = issue_types.get(r.issue_type, 0) + 1

    top_isps = sorted(isp_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # Outage stats
    resolved   = sum(1 for o in outages if o.is_resolved)
    unresolved = len(outages) - resolved

    return {
        "period_hours":        hours,
        "community_reports":   len(reports),
        "outage_events":       len(outages),
        "unresolved_outages":  unresolved,
        "top_affected_isps":   [{"isp": k, "reports": v} for k, v in top_isps],
        "issue_breakdown":     [{"type": k, "count": v}
                                for k, v in sorted(issue_types.items(), key=lambda x: x[1], reverse=True)],
        "generated_at":        datetime.utcnow().isoformat() + "Z",
    }
