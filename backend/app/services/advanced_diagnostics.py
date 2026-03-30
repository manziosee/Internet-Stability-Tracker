"""Advanced Network Diagnostics Service

Hot paths (packet loss, jitter, bandwidth, ping) are delegated to the
Rust probe sidecar at PROBE_URL (default http://127.0.0.1:8001).
If the Rust service is not reachable, each method falls back gracefully
to the Python implementation so the API keeps working during local dev
or when the binary is not present.
"""
import asyncio
import logging
import socket
import statistics
import subprocess
import time
from typing import Any, Dict, List, Optional

import httpx
from datetime import datetime

from ..core.config import settings

logger = logging.getLogger(__name__)

# ── Rust probe client ─────────────────────────────────────────────────────────

class _ProbeClient:
    """Thin async wrapper around the Rust probe HTTP service."""

    def __init__(self) -> None:
        self._base = settings.PROBE_URL.rstrip("/") if settings.PROBE_URL else ""
        self._available: Optional[bool] = None  # None = not yet checked

    async def _post(self, path: str, body: dict) -> Optional[dict]:
        if not self._base:
            return None
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(f"{self._base}{path}", json=body)
                if resp.status_code == 200:
                    self._available = True
                    return resp.json()
        except Exception as exc:
            if self._available is not False:
                logger.info("Rust probe not reachable (%s) — using Python fallback", exc)
            self._available = False
        return None

    async def ping(self, host: str, port: int = 443, timeout_ms: int = 2000) -> Optional[dict]:
        return await self._post("/ping", {"host": host, "port": port, "timeout_ms": timeout_ms})

    async def packet_loss(self, host: str, count: int = 20, port: int = 443, timeout_ms: int = 2000) -> Optional[dict]:
        return await self._post("/packet-loss", {"host": host, "count": count, "port": port, "timeout_ms": timeout_ms})

    async def jitter(self, host: str, samples: int = 30, port: int = 443, interval_ms: int = 100, timeout_ms: int = 2000) -> Optional[dict]:
        return await self._post("/jitter", {"host": host, "samples": samples, "port": port, "interval_ms": interval_ms, "timeout_ms": timeout_ms})

    async def bandwidth(self, urls: Optional[List[str]] = None, duration_secs: int = 8) -> Optional[dict]:
        body: dict = {"duration_secs": duration_secs}
        if urls:
            body["urls"] = urls
        return await self._post("/bandwidth", body)

    async def traceroute(self, host: str, max_hops: int = 20, hop_timeout_secs: int = 2) -> Optional[dict]:
        return await self._post("/traceroute", {"host": host, "max_hops": max_hops, "hop_timeout_secs": hop_timeout_secs})

    async def mtu(self, host: str, port: int = 443, timeout_ms: int = 2000) -> Optional[dict]:
        return await self._post("/mtu", {"host": host, "port": port, "timeout_ms": timeout_ms})


_probe = _ProbeClient()

# ── Main diagnostics service ──────────────────────────────────────────────────

class AdvancedDiagnostics:
    """Advanced network diagnostics: packet loss, jitter, bufferbloat, MTU, DNS leak, VPN"""

    async def run_full_diagnostics(self) -> Dict[str, Any]:
        results = await asyncio.gather(
            self.measure_packet_loss(),
            self.measure_jitter(),
            self.test_bufferbloat(),
            self.discover_mtu(),
            self.test_dns_leak(),
            return_exceptions=True,
        )
        return {
            "packet_loss":  results[0] if not isinstance(results[0], Exception) else None,
            "jitter":       results[1] if not isinstance(results[1], Exception) else None,
            "bufferbloat":  results[2] if not isinstance(results[2], Exception) else None,
            "mtu":          results[3] if not isinstance(results[3], Exception) else None,
            "dns_leak":     results[4] if not isinstance(results[4], Exception) else None,
            "timestamp":    datetime.utcnow().isoformat(),
        }

    # ── Ping (single RTT) ────────────────────────────────────────────────────

    async def _ping_once(self, host: str, timeout: int = 2) -> Optional[float]:
        """Single RTT via Rust probe; falls back to Python TCP socket."""
        result = await _probe.ping(host, timeout_ms=timeout * 1000)
        if result and result.get("reachable"):
            return result["rtt_ms"]
        # Python fallback
        for port in (443, 80, 53):
            try:
                start = time.time()
                sock = socket.create_connection((host, port), timeout=timeout)
                rtt = (time.time() - start) * 1000
                sock.close()
                return round(rtt, 2)
            except Exception:
                continue
        return None

    # ── Packet loss ──────────────────────────────────────────────────────────

    async def measure_packet_loss(self, host: str = "8.8.8.8", count: int = 20) -> Dict[str, Any]:
        result = await _probe.packet_loss(host, count=count)
        if result:
            return result

        # Python fallback (sequential TCP probes)
        received, latencies = 0, []
        for _ in range(count):
            rtt = await self._ping_once(host)
            if rtt is not None:
                received += 1
                latencies.append(rtt)
            await asyncio.sleep(0.1)

        loss_pct = round((count - received) / count * 100, 1)
        return {
            "host": host,
            "packets_sent": count,
            "packets_received": received,
            "packet_loss_percent": loss_pct,
            "avg_latency_ms": round(statistics.mean(latencies), 2) if latencies else None,
            "method": "tcp_fallback_python",
        }

    # ── Jitter ───────────────────────────────────────────────────────────────

    async def measure_jitter(self, host: str = "8.8.8.8", samples: int = 30) -> Dict[str, Any]:
        result = await _probe.jitter(host, samples=samples)
        if result:
            return result

        # Python fallback
        latencies = []
        for _ in range(samples):
            rtt = await self._ping_once(host)
            if rtt is not None:
                latencies.append(rtt)
            await asyncio.sleep(0.1)

        if len(latencies) < 2:
            return {"error": "Insufficient samples — could not reach host"}

        diffs = [abs(latencies[i] - latencies[i - 1]) for i in range(1, len(latencies))]
        return {
            "host": host,
            "samples_collected": len(latencies),
            "jitter_ms": round(statistics.mean(diffs), 2),
            "jitter_stdev_ms": round(statistics.stdev(diffs), 2) if len(diffs) > 1 else 0,
            "min_jitter_ms": round(min(diffs), 2),
            "max_jitter_ms": round(max(diffs), 2),
            "avg_latency_ms": round(statistics.mean(latencies), 2),
            "quality": self._assess_jitter_quality(statistics.mean(diffs)),
            "method": "tcp_fallback_python",
        }

    def _assess_jitter_quality(self, jitter_ms: float) -> str:
        if jitter_ms < 5:
            return "excellent"
        elif jitter_ms < 15:
            return "good"
        elif jitter_ms < 30:
            return "fair"
        return "poor"

    # ── Bufferbloat ──────────────────────────────────────────────────────────

    async def test_bufferbloat(self) -> Dict[str, Any]:
        idle_latencies = []
        for _ in range(5):
            rtt = await self._ping_once("8.8.8.8")
            if rtt is not None:
                idle_latencies.append(rtt)
            await asyncio.sleep(0.2)

        if not idle_latencies:
            return {"error": "Could not measure idle latency — host unreachable"}

        idle_avg = statistics.mean(idle_latencies)

        # Generate load via Rust bandwidth probe (or Python HTTP fallback)
        load_latencies = []
        bandwidth_task = asyncio.create_task(self._load_test())
        await asyncio.sleep(1)

        for _ in range(5):
            rtt = await self._ping_once("8.8.8.8")
            if rtt is not None:
                load_latencies.append(rtt)
            await asyncio.sleep(0.2)

        try:
            await bandwidth_task
        except Exception:
            pass

        if not load_latencies:
            load_latencies = [idle_avg * 1.1]

        load_avg = statistics.mean(load_latencies)
        bloat_ms = max(load_avg - idle_avg, 0)

        return {
            "idle_latency_ms": round(idle_avg, 2),
            "loaded_latency_ms": round(load_avg, 2),
            "bufferbloat_ms": round(bloat_ms, 2),
            "grade": self._grade_bufferbloat(bloat_ms),
            "recommendation": self._bufferbloat_recommendation(bloat_ms),
        }

    async def _load_test(self) -> None:
        """Generate download load; try Rust probe first, then Python HTTP."""
        result = await _probe.bandwidth(duration_secs=5)
        if result and result.get("download_mbps", 0) > 0:
            return
        # Python HTTP fallback
        _DOWNLOAD_URLS = [
            "https://speed.cloudflare.com/__down?bytes=10000000",
            "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js",
        ]
        async with httpx.AsyncClient(timeout=15.0) as client:
            for url in _DOWNLOAD_URLS:
                try:
                    await client.get(url)
                    return
                except Exception:
                    continue

    def _grade_bufferbloat(self, bloat_ms: float) -> str:
        if bloat_ms < 50:   return "A"
        if bloat_ms < 100:  return "B"
        if bloat_ms < 200:  return "C"
        if bloat_ms < 300:  return "D"
        return "F"

    def _bufferbloat_recommendation(self, bloat_ms: float) -> str:
        if bloat_ms < 50:   return "Excellent — no action needed"
        if bloat_ms < 100:  return "Good — consider enabling QoS on your router"
        if bloat_ms < 200:  return "Fair — enable QoS and reduce simultaneous connections"
        return "Poor — router upgrade recommended; enable SQM/fq_codel"

    # ── MTU discovery ────────────────────────────────────────────────────────

    async def discover_mtu(self, host: str = "8.8.8.8") -> Dict[str, Any]:
        result = await _probe.mtu(host)
        if result:
            return result

        # Python fallback: try subprocess ping with DF bit
        sizes = [1500, 1492, 1472, 1450, 1400, 1350, 1300]
        for size in sizes:
            try:
                res = subprocess.run(
                    ["ping", "-c", "1", "-M", "do", "-s", str(size - 28), "-W", "2", host],
                    capture_output=True, text=True, timeout=3,
                )
                if res.returncode == 0 and "time=" in res.stdout:
                    return {
                        "host": host,
                        "optimal_mtu": size,
                        "standard_mtu": 1500,
                        "needs_adjustment": size != 1500,
                        "recommendation": f"Set MTU to {size}" if size != 1500 else "Standard MTU is optimal",
                        "method": "ping_df",
                    }
            except Exception:
                continue

        rtt = await self._ping_once(host)
        return {
            "host": host,
            "optimal_mtu": 1500 if rtt is not None else None,
            "standard_mtu": 1500,
            "needs_adjustment": False,
            "recommendation": "Standard MTU (estimated — DF probe unavailable)",
            "method": "estimated",
        }

    # ── DNS leak ─────────────────────────────────────────────────────────────

    async def test_dns_leak(self) -> Dict[str, Any]:
        SECURE_DNS = {
            "8.8.8.8", "8.8.4.4",
            "1.1.1.1", "1.0.0.1",
            "9.9.9.9", "149.112.112.112",
            "208.67.222.222", "208.67.220.220",
            "94.140.14.14", "94.140.15.15",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    "https://dns.google/resolve?name=whoami.akamai.net&type=A"
                )
                data = response.json()
                dns_server_ip = None
                if "Answer" in data and data["Answer"]:
                    dns_server_ip = data["Answer"][0]["data"]

                dns_country = dns_isp = None
                if dns_server_ip:
                    try:
                        geo = (await client.get(
                            f"https://ipapi.co/{dns_server_ip}/json/",
                            headers={"User-Agent": "curl/7.68.0"},
                        )).json()
                        dns_country = geo.get("country_name")
                        dns_isp     = geo.get("org")
                    except Exception:
                        pass

                is_secure = dns_server_ip in SECURE_DNS if dns_server_ip else False
                leaked = not is_secure
                return {
                    "dns_leaked":         leaked,
                    "dns_server_ip":      dns_server_ip,
                    "dns_server_country": dns_country,
                    "dns_server_isp":     dns_isp,
                    "is_secure_provider": is_secure,
                    "privacy_score":      100 if is_secure else 50,
                    "recommendation": (
                        "Your DNS may be handled by your ISP's resolver. "
                        "Consider switching to Cloudflare (1.1.1.1), Google (8.8.8.8), or Quad9 (9.9.9.9)."
                        if leaked else
                        "DNS is using a known secure provider — no leak detected."
                    ),
                }
        except Exception as exc:
            return {"error": str(exc)}

    # ── Bandwidth quick test (used by throttle detector etc.) ────────────────

    async def _quick_speed_test(self) -> float:
        result = await _probe.bandwidth(duration_secs=8)
        if result and result.get("download_mbps", 0) > 0:
            return result["download_mbps"]

        # Python HTTP fallback
        _URLS = [
            "https://speed.cloudflare.com/__down?bytes=10000000",
            "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js",
        ]
        async with httpx.AsyncClient(timeout=15.0) as client:
            for url in _URLS:
                try:
                    start = time.time()
                    resp = await client.get(url)
                    duration = time.time() - start
                    if duration > 0 and len(resp.content) > 0:
                        return round((len(resp.content) * 8) / (duration * 1_000_000), 2)
                except Exception:
                    continue
        return 0.0

    # ── VPN speed comparison ─────────────────────────────────────────────────

    async def compare_vpn_speed(self, vpn_interface: Optional[str] = None) -> Dict[str, Any]:
        try:
            without_vpn = await self._quick_speed_test()

            if vpn_interface:
                iface_exists = False
                try:
                    res = subprocess.run(
                        ["ip", "link", "show", vpn_interface],
                        capture_output=True, text=True, timeout=3,
                    )
                    iface_exists = res.returncode == 0
                except Exception:
                    pass

                if iface_exists:
                    with_vpn = await self._quick_speed_test()
                    loss = round(((without_vpn - with_vpn) / without_vpn * 100), 1) if without_vpn > 0 else 0
                    return {
                        "without_vpn_mbps":    without_vpn,
                        "with_vpn_mbps":       with_vpn,
                        "speed_loss_percent":  loss,
                        "vpn_overhead_mbps":   round(without_vpn - with_vpn, 2),
                        "recommendation":      self._vpn_recommendation(without_vpn, with_vpn),
                    }
                return {
                    "without_vpn_mbps":   without_vpn,
                    "with_vpn_mbps":      None,
                    "speed_loss_percent": None,
                    "vpn_overhead_mbps":  None,
                    "recommendation":     f"Interface '{vpn_interface}' not found. Connect your VPN first.",
                    "error":              f"VPN interface '{vpn_interface}' not found",
                }

            return {
                "without_vpn_mbps":   without_vpn,
                "with_vpn_mbps":      None,
                "speed_loss_percent": None,
                "vpn_overhead_mbps":  None,
                "recommendation":     f"Baseline: {without_vpn} Mbps. Provide a VPN interface (e.g. tun0) to compare.",
            }
        except Exception as exc:
            return {"error": str(exc)}

    def _vpn_recommendation(self, without: float, with_vpn: float) -> str:
        loss = ((without - with_vpn) / without * 100) if without > 0 else 0
        if loss < 10:  return "Excellent VPN — minimal speed impact"
        if loss < 25:  return "Good VPN — acceptable speed loss"
        if loss < 50:  return "Fair VPN — consider switching servers"
        return "Poor VPN — try a different protocol or provider"
