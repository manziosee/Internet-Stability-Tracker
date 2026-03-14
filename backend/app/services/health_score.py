"""Network Health Score — composite 0–100 score."""
from typing import List, Dict, Any
from datetime import datetime, timedelta
from ..models.measurement import SpeedMeasurement, OutageEvent


def compute_health_score(
    measurements: List[SpeedMeasurement],
    outage_events: List[OutageEvent],
    window_days: int = 7,
) -> Dict[str, Any]:
    if not measurements:
        return {
            "score": 0, "grade": "N/A",
            "message": "No data yet. Run a speed test first.",
            "components": {},
        }

    cutoff = datetime.utcnow() - timedelta(days=window_days)
    recent = [m for m in measurements if m.timestamp and m.timestamp >= cutoff] or measurements

    downloads = [m.download_speed for m in recent if m.download_speed]
    uploads   = [m.upload_speed   for m in recent if m.upload_speed]
    pings     = [m.ping           for m in recent if m.ping]

    avg_dl = sum(downloads) / len(downloads) if downloads else 0
    avg_ul = sum(uploads)   / len(uploads)   if uploads   else 0
    avg_pg = sum(pings)     / len(pings)     if pings     else 999

    # Component scores (each 0–100)
    dl_score = min(100, (avg_dl / 100) * 100)
    ul_score = min(100, (avg_ul / 50)  * 100)

    if avg_pg <= 20:    pg_score = 100
    elif avg_pg <= 50:  pg_score = 85
    elif avg_pg <= 100: pg_score = 65
    elif avg_pg <= 150: pg_score = 45
    elif avg_pg <= 250: pg_score = 25
    else:               pg_score = 10

    if len(downloads) >= 2:
        mean_dl = sum(downloads) / len(downloads)
        variance = sum((x - mean_dl) ** 2 for x in downloads) / len(downloads)
        cv = (variance ** 0.5 / mean_dl) if mean_dl > 0 else 1
        stab_score = max(0, min(100, 100 - cv * 100))
    else:
        stab_score = 75

    recent_outages = [e for e in outage_events if e.started_at and e.started_at >= cutoff]
    outage_hours = sum(
        (e.resolved_at - e.started_at).total_seconds() / 3600
        if e.resolved_at else 1.0
        for e in recent_outages
    )
    total_hours  = window_days * 24
    uptime_pct   = max(0, (total_hours - outage_hours) / total_hours)
    uptime_score = uptime_pct * 100

    weights = {"download": 0.25, "upload": 0.20, "ping": 0.25, "stability": 0.15, "uptime": 0.15}
    score = (
        dl_score    * weights["download"] +
        ul_score    * weights["upload"]   +
        pg_score    * weights["ping"]     +
        stab_score  * weights["stability"] +
        uptime_score * weights["uptime"]
    )
    score = round(score, 1)

    grade_map = [(90, "A+"), (80, "A"), (70, "B"), (60, "C"), (50, "D"), (0, "F")]
    grade = next(g for threshold, g in grade_map if score >= threshold)

    tips = []
    if dl_score    < 60: tips.append("Download speed is below average — consider upgrading your plan.")
    if ul_score    < 60: tips.append("Upload speed is low — affects video calls and cloud backups.")
    if pg_score    < 60: tips.append("High ping — check for background downloads or router congestion.")
    if stab_score  < 60: tips.append("Inconsistent speeds — may indicate signal or line quality issues.")
    if uptime_score < 90: tips.append(f"Outage time detected ({outage_hours:.1f}h in {window_days}d) — contact your ISP.")

    return {
        "score":       score,
        "grade":       grade,
        "window_days": window_days,
        "message":     f"Your network health score is {score}/100 (Grade {grade}). {tips[0] if tips else 'Keep it up!'}",
        "components": {
            "download_speed": round(dl_score,    1),
            "upload_speed":   round(ul_score,    1),
            "ping_latency":   round(pg_score,    1),
            "stability":      round(stab_score,  1),
            "uptime":         round(uptime_score, 1),
        },
        "averages": {
            "download_mbps": round(avg_dl, 2),
            "upload_mbps":   round(avg_ul, 2),
            "ping_ms":       round(avg_pg, 2),
        },
        "tips":         tips,
        "sample_count": len(recent),
    }
