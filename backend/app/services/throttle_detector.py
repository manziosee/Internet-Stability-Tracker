"""Throttle Detector — detects ISP bandwidth throttling by comparing speeds across multiple CDNs."""
import time
import asyncio
import httpx
from typing import Dict, Any

_PROBE_URLS = [
    ("Cloudflare",   "https://speed.cloudflare.com/__down?bytes=5000000"),
    ("jsDelivr CDN", "https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"),
    ("Google APIs",  "https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"),
    ("Fastly CDN",   "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"),
]


async def _probe_speed(client: httpx.AsyncClient, label: str, url: str) -> Dict[str, Any]:
    try:
        t0 = time.monotonic()
        r = await client.get(url, timeout=15)
        elapsed = time.monotonic() - t0
        size = len(r.content)
        mbps = round((size * 8) / (elapsed * 1_000_000), 2) if elapsed > 0 else 0
        return {"label": label, "url": url, "mbps": mbps, "status": r.status_code, "ok": True}
    except Exception as e:
        return {"label": label, "url": url, "mbps": 0, "ok": False, "error": str(e)}


async def detect_throttling(baseline_mbps: float = 0.0) -> Dict[str, Any]:
    """Run parallel probes to multiple CDNs and compare speeds."""
    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [_probe_speed(client, label, url) for label, url in _PROBE_URLS]
        results = await asyncio.gather(*tasks)

    ok_results = [r for r in results if r["ok"] and r["mbps"] > 0]
    if not ok_results:
        return {
            "is_throttled": False,
            "confidence": 0,
            "message": "Could not reach probe endpoints. Check your connection.",
            "probes": results,
            "throttled_categories": [],
        }

    speeds = [r["mbps"] for r in ok_results]
    max_speed = max(speeds)
    min_speed = min(speeds)
    avg_speed = sum(speeds) / len(speeds)
    ratio = min_speed / max_speed if max_speed > 0 else 1.0

    throttled_categories = []
    is_throttled = False
    confidence = 0

    if ratio < 0.4:
        is_throttled = True
        confidence = min(95, int((1 - ratio) * 100))
        slow = [r["label"] for r in ok_results if r["mbps"] < avg_speed * 0.5]
        throttled_categories = slow

    if baseline_mbps > 0 and avg_speed < baseline_mbps * 0.4:
        is_throttled = True
        confidence = max(confidence, 75)
        throttled_categories.append("All traffic (vs baseline)")

    if is_throttled:
        msg = (f"Throttling detected with {confidence}% confidence. "
               f"Speeds ranged {min_speed}–{max_speed} Mbps across CDNs. "
               f"Affected: {', '.join(throttled_categories) or 'unknown'}.")
    else:
        msg = (f"No throttling detected. Speeds consistent across CDNs "
               f"({min_speed}–{max_speed} Mbps, avg {avg_speed:.1f} Mbps).")

    return {
        "is_throttled":         is_throttled,
        "confidence":           confidence,
        "message":              msg,
        "avg_mbps":             round(avg_speed, 2),
        "max_mbps":             round(max_speed, 2),
        "min_mbps":             round(min_speed, 2),
        "baseline_mbps":        baseline_mbps,
        "throttled_categories": throttled_categories,
        "probes":               results,
    }
