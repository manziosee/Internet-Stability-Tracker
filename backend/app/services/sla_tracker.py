"""ISP SLA Tracker — compare promised vs actual speeds."""
from typing import List, Dict, Any
from datetime import datetime, timedelta
from ..models.measurement import SpeedMeasurement


def analyze_sla(
    measurements: List[SpeedMeasurement],
    promised_download: float = 100.0,
    promised_upload:   float = 20.0,
    promised_ping:     float = 30.0,
    window_days: int   = 30,
) -> Dict[str, Any]:
    if not measurements:
        return {"error": "No measurements available", "sla_met": None}

    cutoff = datetime.utcnow() - timedelta(days=window_days)
    recent = [m for m in measurements if m.timestamp and m.timestamp >= cutoff] or measurements

    downloads = [m.download_speed for m in recent if m.download_speed]
    uploads   = [m.upload_speed   for m in recent if m.upload_speed]
    pings     = [m.ping           for m in recent if m.ping]

    def _stats(vals):
        if not vals:
            return {"avg": 0, "min": 0, "max": 0, "p10": 0, "p90": 0}
        s = sorted(vals)
        n = len(s)
        return {
            "avg": round(sum(s) / n, 2),
            "min": round(s[0], 2),
            "max": round(s[-1], 2),
            "p10": round(s[max(0, int(n * 0.1))], 2),
            "p90": round(s[min(n - 1, int(n * 0.9))], 2),
        }

    dl_stats = _stats(downloads)
    ul_stats = _stats(uploads)
    pg_stats = _stats(pings)

    dl_ratio = dl_stats["avg"] / promised_download if promised_download > 0 else 1.0
    ul_ratio = ul_stats["avg"] / promised_upload   if promised_upload   > 0 else 1.0
    pg_ok    = pg_stats["avg"] <= promised_ping     if promised_ping    > 0 else True

    dl_met  = dl_ratio >= 0.80
    ul_met  = ul_ratio >= 0.80
    sla_met = dl_met and ul_met and pg_ok

    dl_sla_pct = round(sum(1 for v in downloads if v >= promised_download * 0.8) / len(downloads) * 100, 1) if downloads else 0
    ul_sla_pct = round(sum(1 for v in uploads   if v >= promised_upload   * 0.8) / len(uploads)   * 100, 1) if uploads   else 0

    grade_map = [(0.95, "A"), (0.85, "B"), (0.70, "C"), (0.50, "D"), (0.0, "F")]
    def _grade(ratio):
        for threshold, letter in grade_map:
            if ratio >= threshold:
                return letter
        return "F"

    return {
        "sla_met":     sla_met,
        "window_days": window_days,
        "sample_count": len(recent),
        "promised": {
            "download_mbps": promised_download,
            "upload_mbps":   promised_upload,
            "ping_ms":       promised_ping,
        },
        "actual": {
            "download": dl_stats,
            "upload":   ul_stats,
            "ping":     pg_stats,
        },
        "ratios": {
            "download": round(dl_ratio, 3),
            "upload":   round(ul_ratio, 3),
        },
        "sla_compliance_pct": {
            "download": dl_sla_pct,
            "upload":   ul_sla_pct,
        },
        "grades": {
            "download": _grade(dl_ratio),
            "upload":   _grade(ul_ratio),
            "overall":  _grade((dl_ratio + ul_ratio) / 2),
        },
        "verdict": (
            "✅ Your ISP is delivering on its promises."
            if sla_met else
            f"⚠️ SLA breach detected — download at {dl_ratio*100:.0f}% of promised, "
            f"upload at {ul_ratio*100:.0f}% of promised."
        ),
    }
