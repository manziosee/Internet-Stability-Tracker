"""Weekly report generator — builds a human-readable summary."""
from typing import List, Dict, Any
from collections import defaultdict
from datetime import datetime, timedelta
from ..models.measurement import SpeedMeasurement, OutageEvent


def generate_weekly_report(
    measurements: List[SpeedMeasurement],
    outage_events: List[OutageEvent],
    isp_name: str = "your ISP",
) -> Dict[str, Any]:
    now   = datetime.utcnow()
    week1 = [m for m in measurements if m.timestamp and m.timestamp >= now - timedelta(days=7)]
    week2 = [m for m in measurements if m.timestamp and
             now - timedelta(days=14) <= m.timestamp < now - timedelta(days=7)]

    def _avg(lst, attr):
        vals = [getattr(m, attr) for m in lst if getattr(m, attr)]
        return round(sum(vals) / len(vals), 2) if vals else 0

    dl  = _avg(week1, "download_speed")
    ul  = _avg(week1, "upload_speed")
    pg  = _avg(week1, "ping")
    cnt = len(week1)

    p_dl = _avg(week2, "download_speed")
    p_ul = _avg(week2, "upload_speed")

    dl_delta = round(((dl - p_dl) / p_dl * 100) if p_dl > 0 else 0, 1)
    ul_delta = round(((ul - p_ul) / p_ul * 100) if p_ul > 0 else 0, 1)

    recent_outages = [e for e in outage_events
                      if e.started_at and e.started_at >= now - timedelta(days=7)]
    outage_count = len(recent_outages)
    outage_hours = sum(
        (e.resolved_at - e.started_at).total_seconds() / 3600
        if e.resolved_at else 0.5
        for e in recent_outages
    )
    uptime_pct = round(max(0, (168 - outage_hours) / 168 * 100), 2)

    hour_speeds: Dict[int, list] = defaultdict(list)
    for m in week1:
        if m.timestamp and m.download_speed:
            hour_speeds[m.timestamp.hour].append(m.download_speed)
    hour_avgs  = {h: sum(v) / len(v) for h, v in hour_speeds.items() if v}
    best_hour  = max(hour_avgs, key=hour_avgs.get) if hour_avgs else None
    worst_hour = min(hour_avgs, key=hour_avgs.get) if hour_avgs else None

    dl_trend = "📈 improved" if dl_delta > 5 else "📉 declined" if dl_delta < -5 else "➡️ stable"
    lines = [
        f"📊 **Weekly Network Report** — {now.strftime('%B %d, %Y')}",
        "",
        f"**Summary:** {cnt} speed tests recorded this week.",
        f"- Download: {dl} Mbps ({dl_trend} {abs(dl_delta)}% vs last week)",
        f"- Upload: {ul} Mbps ({'+' if ul_delta >= 0 else ''}{ul_delta}% vs last week)",
        f"- Avg Ping: {pg} ms",
        f"- Uptime: {uptime_pct}% ({outage_count} outage event{'s' if outage_count != 1 else ''})",
    ]
    if best_hour is not None:
        lines.append(f"- Best hour: {best_hour:02d}:00  |  Worst hour: {worst_hour:02d}:00")
    if outage_count > 0:
        lines.append(f"⚠️ {outage_count} outage(s) totaling {outage_hours:.1f}h detected.")
    if dl_delta < -10:
        lines.append(f"💡 Tip: Download speeds dropped {abs(dl_delta)}%. Consider rebooting your router or contacting {isp_name}.")
    elif dl_delta > 10:
        lines.append(f"✅ Great week! Speeds improved by {dl_delta}%.")
    else:
        lines.append("✅ Connection has been consistent this week.")

    return {
        "report_date": now.isoformat(),
        "period":      "7 days",
        "narrative":   "\n".join(lines),
        "stats": {
            "tests_run":     cnt,
            "avg_download":  dl,
            "avg_upload":    ul,
            "avg_ping":      pg,
            "uptime_pct":    uptime_pct,
            "outage_count":  outage_count,
            "outage_hours":  round(outage_hours, 2),
        },
        "week_over_week": {
            "download_delta_pct": dl_delta,
            "upload_delta_pct":   ul_delta,
        },
        "best_hour":  best_hour,
        "worst_hour": worst_hour,
    }
