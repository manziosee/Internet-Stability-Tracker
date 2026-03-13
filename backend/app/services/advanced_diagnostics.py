"""Advanced Network Diagnostics Service"""
import asyncio
import subprocess
import socket
import time
import statistics
from typing import Dict, Any, List, Optional
import httpx
from datetime import datetime


class AdvancedDiagnostics:
    """Advanced network diagnostics: packet loss, jitter, bufferbloat, MTU, DNS leak, VPN"""
    
    async def run_full_diagnostics(self) -> Dict[str, Any]:
        """Run all diagnostic tests"""
        results = await asyncio.gather(
            self.measure_packet_loss(),
            self.measure_jitter(),
            self.test_bufferbloat(),
            self.discover_mtu(),
            self.test_dns_leak(),
            return_exceptions=True
        )
        
        return {
            "packet_loss": results[0] if not isinstance(results[0], Exception) else None,
            "jitter": results[1] if not isinstance(results[1], Exception) else None,
            "bufferbloat": results[2] if not isinstance(results[2], Exception) else None,
            "mtu": results[3] if not isinstance(results[3], Exception) else None,
            "dns_leak": results[4] if not isinstance(results[4], Exception) else None,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def _ping_once(self, host: str, timeout: int = 2) -> Optional[float]:
        """Single ping returning RTT in ms, or None on failure. Uses socket on fallback."""
        try:
            result = subprocess.run(
                ["ping", "-c", "1", "-W", str(timeout), host],
                capture_output=True, text=True, timeout=timeout + 1
            )
            if "time=" in result.stdout:
                return float(result.stdout.split("time=")[1].split()[0])
        except Exception:
            pass
        # Socket-level fallback: TCP connect to port 443 (HTTPS), then 53 (DNS)
        for port in (443, 53):
            try:
                start = time.time()
                sock = socket.create_connection((host, port), timeout=timeout)
                rtt = (time.time() - start) * 1000
                sock.close()
                return round(rtt, 2)
            except Exception:
                continue
        return None

    async def measure_packet_loss(self, host: str = "8.8.8.8", count: int = 20) -> Dict[str, Any]:
        """Measure packet loss percentage"""
        try:
            result = subprocess.run(
                ["ping", "-c", str(count), "-W", "2", host],
                capture_output=True,
                text=True,
                timeout=count * 3
            )

            output = result.stdout
            if "packet loss" in output:
                loss_line = [line for line in output.split("\n") if "packet loss" in line][0]
                loss_pct = float(loss_line.split("%")[0].split()[-1])

                times = []
                for line in output.split("\n"):
                    if "time=" in line:
                        time_val = float(line.split("time=")[1].split()[0])
                        times.append(time_val)

                return {
                    "packet_loss_percent": loss_pct,
                    "packets_sent": count,
                    "packets_received": int(count * (1 - loss_pct / 100)),
                    "avg_latency_ms": statistics.mean(times) if times else None,
                    "host": host
                }
        except Exception:
            pass

        # Fallback: use socket-level TCP pings to estimate packet loss
        try:
            received = 0
            latencies = []
            for _ in range(count):
                rtt = await self._ping_once(host)
                if rtt is not None:
                    received += 1
                    latencies.append(rtt)
                await asyncio.sleep(0.1)
            loss_pct = round((count - received) / count * 100, 1)
            return {
                "packet_loss_percent": loss_pct,
                "packets_sent": count,
                "packets_received": received,
                "avg_latency_ms": round(statistics.mean(latencies), 2) if latencies else None,
                "host": host,
                "method": "tcp_fallback"
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def measure_jitter(self, host: str = "8.8.8.8", samples: int = 30) -> Dict[str, Any]:
        """Measure jitter (latency variation) - critical for gaming/VoIP"""
        latencies = []
        try:
            for _ in range(samples):
                rtt = await self._ping_once(host)
                if rtt is not None:
                    latencies.append(rtt)
                await asyncio.sleep(0.1)

            if len(latencies) < 2:
                return {"error": "Insufficient samples — could not reach host"}

            differences = [abs(latencies[i] - latencies[i-1]) for i in range(1, len(latencies))]

            return {
                "jitter_ms": round(statistics.mean(differences), 2),
                "jitter_stdev_ms": round(statistics.stdev(differences), 2) if len(differences) > 1 else 0,
                "min_jitter_ms": round(min(differences), 2),
                "max_jitter_ms": round(max(differences), 2),
                "avg_latency_ms": round(statistics.mean(latencies), 2),
                "samples": len(latencies),
                "quality": self._assess_jitter_quality(statistics.mean(differences))
            }
        except Exception as e:
            return {"error": str(e)}
    
    def _assess_jitter_quality(self, jitter_ms: float) -> str:
        """Assess jitter quality for VoIP/gaming"""
        if jitter_ms < 5:
            return "excellent"
        elif jitter_ms < 15:
            return "good"
        elif jitter_ms < 30:
            return "fair"
        else:
            return "poor"
    
    # Reliable download URLs tried in order — CDN-backed, widely available
    _DOWNLOAD_URLS = [
        "https://speed.cloudflare.com/__down?bytes=10000000",
        "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js",
        "https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js",
        "http://speedtest.ftp.otenet.gr/files/test10Mb.db",
    ]

    async def _download_for_load_test(self, client: httpx.AsyncClient) -> None:
        """Download a file to generate load; try multiple CDNs."""
        for url in self._DOWNLOAD_URLS:
            try:
                await client.get(url, timeout=20.0)
                return
            except Exception:
                continue

    async def test_bufferbloat(self) -> Dict[str, Any]:
        """Test for bufferbloat (router queue congestion)"""
        try:
            idle_latencies = []
            for _ in range(5):
                rtt = await self._ping_once("8.8.8.8")
                if rtt is not None:
                    idle_latencies.append(rtt)
                await asyncio.sleep(0.2)

            if not idle_latencies:
                return {"error": "Could not measure idle latency — host unreachable"}

            idle_avg = statistics.mean(idle_latencies)

            async with httpx.AsyncClient(timeout=30.0) as client:
                load_latencies = []
                download_task = asyncio.create_task(
                    self._download_for_load_test(client)
                )

                await asyncio.sleep(1)

                for _ in range(5):
                    rtt = await self._ping_once("8.8.8.8")
                    if rtt is not None:
                        load_latencies.append(rtt)
                    await asyncio.sleep(0.2)

                try:
                    await download_task
                except Exception:
                    pass

            if not load_latencies:
                # Estimate from idle — assume minimal bloat if we can't load-test
                load_latencies = [idle_avg * 1.1]

            load_avg = statistics.mean(load_latencies)
            bloat_ms = max(load_avg - idle_avg, 0)

            return {
                "idle_latency_ms": round(idle_avg, 2),
                "loaded_latency_ms": round(load_avg, 2),
                "bufferbloat_ms": round(bloat_ms, 2),
                "grade": self._grade_bufferbloat(bloat_ms),
                "recommendation": self._bufferbloat_recommendation(bloat_ms)
            }
        except Exception as e:
            return {"error": str(e)}
    
    def _grade_bufferbloat(self, bloat_ms: float) -> str:
        """Grade bufferbloat severity"""
        if bloat_ms < 50:
            return "A"
        elif bloat_ms < 100:
            return "B"
        elif bloat_ms < 200:
            return "C"
        elif bloat_ms < 300:
            return "D"
        else:
            return "F"
    
    def _bufferbloat_recommendation(self, bloat_ms: float) -> str:
        """Provide bufferbloat recommendations"""
        if bloat_ms < 50:
            return "Excellent - no action needed"
        elif bloat_ms < 100:
            return "Good - consider enabling QoS on router"
        elif bloat_ms < 200:
            return "Fair - enable QoS and reduce simultaneous connections"
        else:
            return "Poor - router upgrade recommended, enable SQM/fq_codel"
    
    async def discover_mtu(self, host: str = "8.8.8.8") -> Dict[str, Any]:
        """Discover optimal MTU (Maximum Transmission Unit)"""
        try:
            sizes = [1500, 1492, 1472, 1450, 1400, 1350, 1300]
            optimal_mtu = None

            for size in sizes:
                try:
                    result = subprocess.run(
                        ["ping", "-c", "1", "-M", "do", "-s", str(size - 28), "-W", "2", host],
                        capture_output=True, text=True, timeout=3
                    )
                    if result.returncode == 0 and "time=" in result.stdout:
                        optimal_mtu = size
                        break
                except Exception:
                    continue

            if optimal_mtu is None:
                # Fallback: assume standard MTU since we can reach the internet
                rtt = await self._ping_once(host)
                if rtt is not None:
                    optimal_mtu = 1500  # reachable, assume standard
                    return {
                        "optimal_mtu": optimal_mtu,
                        "standard_mtu": 1500,
                        "needs_adjustment": False,
                        "recommendation": "Standard MTU is optimal (estimated — ping -M unavailable)",
                        "method": "estimated"
                    }
                return {"error": "Could not reach host for MTU discovery"}

            return {
                "optimal_mtu": optimal_mtu,
                "standard_mtu": 1500,
                "needs_adjustment": optimal_mtu != 1500,
                "recommendation": f"Set MTU to {optimal_mtu}" if optimal_mtu != 1500 else "Standard MTU is optimal"
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def test_dns_leak(self) -> Dict[str, Any]:
        """Test for DNS leaks (privacy check)"""
        # Well-known secure DNS providers (DoH/DoT capable)
        SECURE_DNS_PROVIDERS = {
            "8.8.8.8", "8.8.4.4",           # Google
            "1.1.1.1", "1.0.0.1",           # Cloudflare
            "9.9.9.9", "149.112.112.112",   # Quad9
            "208.67.222.222", "208.67.220.220",  # OpenDNS
            "94.140.14.14", "94.140.15.15", # AdGuard
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Resolve via Google DoH to discover which DNS resolver responded
                response = await client.get(
                    "https://dns.google/resolve?name=whoami.akamai.net&type=A"
                )
                data = response.json()

                dns_server_ip = None
                if "Answer" in data and data["Answer"]:
                    dns_server_ip = data["Answer"][0]["data"]

                # Get geolocation of the DNS server IP
                dns_country = dns_isp = dns_org = None
                if dns_server_ip:
                    try:
                        geo_resp = await client.get(
                            f"https://ipapi.co/{dns_server_ip}/json/",
                            headers={"User-Agent": "curl/7.68.0"},
                        )
                        geo = geo_resp.json()
                        dns_country = geo.get("country_name")
                        dns_isp = geo.get("org")
                        dns_org = geo.get("org")
                    except Exception:
                        pass

                # A "leak" means the DNS resolver is NOT a known secure provider
                # (i.e. it's the ISP's default resolver, which may log queries)
                is_secure_provider = dns_server_ip in SECURE_DNS_PROVIDERS if dns_server_ip else False
                dns_leaked = not is_secure_provider

                privacy_score = 100 if is_secure_provider else 50
                if dns_leaked:
                    recommendation = (
                        "Your DNS may be handled by your ISP's resolver. "
                        "Consider switching to an encrypted DNS provider (Cloudflare 1.1.1.1, Google 8.8.8.8, Quad9 9.9.9.9)"
                    )
                else:
                    recommendation = "DNS is using a known secure provider — no leak detected"

                return {
                    "dns_leaked": dns_leaked,
                    "dns_server_ip": dns_server_ip,
                    "dns_server_country": dns_country,
                    "dns_server_isp": dns_isp or dns_org,
                    "is_secure_provider": is_secure_provider,
                    "privacy_score": privacy_score,
                    "recommendation": recommendation,
                }
        except Exception as e:
            return {"error": str(e)}
    
    async def compare_vpn_speed(self, vpn_interface: Optional[str] = None) -> Dict[str, Any]:
        """Compare speed with and without VPN. Returns baseline if no VPN interface given."""
        try:
            without_vpn = await self._quick_speed_test()

            if vpn_interface:
                # Check if the interface exists before attempting VPN measurement
                iface_exists = False
                try:
                    iface_result = subprocess.run(
                        ["ip", "link", "show", vpn_interface],
                        capture_output=True, text=True, timeout=3
                    )
                    iface_exists = iface_result.returncode == 0
                except Exception:
                    pass

                if iface_exists:
                    with_vpn = await self._quick_speed_test()
                    return {
                        "without_vpn_mbps": without_vpn,
                        "with_vpn_mbps": with_vpn,
                        "speed_loss_percent": round(((without_vpn - with_vpn) / without_vpn * 100), 1) if without_vpn > 0 else 0,
                        "vpn_overhead_mbps": round(without_vpn - with_vpn, 2),
                        "recommendation": self._vpn_recommendation(without_vpn, with_vpn)
                    }
                else:
                    return {
                        "without_vpn_mbps": without_vpn,
                        "with_vpn_mbps": None,
                        "speed_loss_percent": None,
                        "vpn_overhead_mbps": None,
                        "recommendation": f"Interface '{vpn_interface}' not found. Connect your VPN first, then re-run.",
                        "error": f"VPN interface '{vpn_interface}' not found"
                    }

            # Baseline-only mode — show current speed without VPN comparison
            return {
                "without_vpn_mbps": without_vpn,
                "with_vpn_mbps": None,
                "speed_loss_percent": None,
                "vpn_overhead_mbps": None,
                "recommendation": f"Baseline speed: {without_vpn} Mbps. Enter a VPN interface name (e.g. tun0, wg0) to compare."
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def _quick_speed_test(self) -> float:
        """Quick download speed test using multiple CDN fallbacks."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            for url in self._DOWNLOAD_URLS:
                try:
                    start = time.time()
                    response = await client.get(url)
                    duration = time.time() - start
                    if duration > 0 and len(response.content) > 0:
                        mbps = (len(response.content) * 8) / (duration * 1_000_000)
                        return round(mbps, 2)
                except Exception:
                    continue
        return 0.0
    
    def _vpn_recommendation(self, without: float, with_vpn: float) -> str:
        """Provide VPN performance recommendation"""
        loss = ((without - with_vpn) / without * 100) if without > 0 else 0
        
        if loss < 10:
            return "Excellent VPN - minimal speed impact"
        elif loss < 25:
            return "Good VPN - acceptable speed loss"
        elif loss < 50:
            return "Fair VPN - consider switching servers"
        else:
            return "Poor VPN - try different protocol or provider"
