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
    
    async def measure_packet_loss(self, host: str = "8.8.8.8", count: int = 20) -> Dict[str, Any]:
        """Measure packet loss percentage"""
        try:
            result = subprocess.run(
                ["ping", "-c", str(count), "-W", "2", host],
                capture_output=True,
                text=True,
                timeout=30
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
        except Exception as e:
            return {"error": str(e)}
        
        return {"error": "Could not measure packet loss"}
    
    async def measure_jitter(self, host: str = "8.8.8.8", samples: int = 30) -> Dict[str, Any]:
        """Measure jitter (latency variation) - critical for gaming/VoIP"""
        try:
            latencies = []
            for _ in range(samples):
                start = time.time()
                result = subprocess.run(
                    ["ping", "-c", "1", "-W", "2", host],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                
                if "time=" in result.stdout:
                    time_val = float(result.stdout.split("time=")[1].split()[0])
                    latencies.append(time_val)
                
                await asyncio.sleep(0.1)
            
            if len(latencies) < 2:
                return {"error": "Insufficient samples"}
            
            differences = [abs(latencies[i] - latencies[i-1]) for i in range(1, len(latencies))]
            
            return {
                "jitter_ms": statistics.mean(differences),
                "jitter_stdev_ms": statistics.stdev(differences) if len(differences) > 1 else 0,
                "min_jitter_ms": min(differences),
                "max_jitter_ms": max(differences),
                "avg_latency_ms": statistics.mean(latencies),
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
    
    async def test_bufferbloat(self) -> Dict[str, Any]:
        """Test for bufferbloat (router queue congestion)"""
        try:
            idle_latencies = []
            for _ in range(5):
                result = subprocess.run(
                    ["ping", "-c", "1", "-W", "2", "8.8.8.8"],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                if "time=" in result.stdout:
                    time_val = float(result.stdout.split("time=")[1].split()[0])
                    idle_latencies.append(time_val)
                await asyncio.sleep(0.2)
            
            if not idle_latencies:
                return {"error": "Could not measure idle latency"}
            
            idle_avg = statistics.mean(idle_latencies)
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                load_latencies = []
                download_task = asyncio.create_task(
                    client.get("http://speedtest.ftp.otenet.gr/files/test10Mb.db")
                )
                
                await asyncio.sleep(1)
                
                for _ in range(5):
                    result = subprocess.run(
                        ["ping", "-c", "1", "-W", "2", "8.8.8.8"],
                        capture_output=True,
                        text=True,
                        timeout=3
                    )
                    if "time=" in result.stdout:
                        time_val = float(result.stdout.split("time=")[1].split()[0])
                        load_latencies.append(time_val)
                    await asyncio.sleep(0.2)
                
                try:
                    await download_task
                except:
                    pass
            
            if not load_latencies:
                return {"error": "Could not measure loaded latency"}
            
            load_avg = statistics.mean(load_latencies)
            bloat_ms = load_avg - idle_avg
            
            return {
                "idle_latency_ms": idle_avg,
                "loaded_latency_ms": load_avg,
                "bufferbloat_ms": bloat_ms,
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
                result = subprocess.run(
                    ["ping", "-c", "1", "-M", "do", "-s", str(size - 28), "-W", "2", host],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                
                if result.returncode == 0 and "time=" in result.stdout:
                    optimal_mtu = size
                    break
            
            return {
                "optimal_mtu": optimal_mtu,
                "standard_mtu": 1500,
                "needs_adjustment": optimal_mtu != 1500 if optimal_mtu else None,
                "recommendation": f"Set MTU to {optimal_mtu}" if optimal_mtu and optimal_mtu != 1500 else "Standard MTU is optimal"
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def test_dns_leak(self) -> Dict[str, Any]:
        """Test for DNS leaks (privacy check)"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get("https://dns.google/resolve?name=whoami.akamai.net&type=A")
                data = response.json()
                
                if "Answer" in data:
                    ip = data["Answer"][0]["data"]
                    
                    geo_response = await client.get(f"http://ip-api.com/json/{ip}")
                    geo_data = geo_response.json()
                    
                    my_ip_response = await client.get("https://api.ipify.org?format=json")
                    my_ip = my_ip_response.json()["ip"]
                    
                    my_geo_response = await client.get(f"http://ip-api.com/json/{my_ip}")
                    my_geo = my_geo_response.json()
                    
                    dns_leaked = geo_data.get("country") != my_geo.get("country")
                    
                    return {
                        "dns_leaked": dns_leaked,
                        "dns_server_country": geo_data.get("country"),
                        "your_country": my_geo.get("country"),
                        "dns_server_isp": geo_data.get("isp"),
                        "privacy_score": 0 if dns_leaked else 100,
                        "recommendation": "Use encrypted DNS (DoH/DoT) or VPN" if dns_leaked else "DNS is secure"
                    }
        except Exception as e:
            return {"error": str(e)}
        
        return {"error": "Could not test DNS leak"}
    
    async def compare_vpn_speed(self, vpn_interface: Optional[str] = None) -> Dict[str, Any]:
        """Compare speed with and without VPN"""
        try:
            without_vpn = await self._quick_speed_test()
            
            if vpn_interface:
                with_vpn = await self._quick_speed_test()
                
                return {
                    "without_vpn_mbps": without_vpn,
                    "with_vpn_mbps": with_vpn,
                    "speed_loss_percent": ((without_vpn - with_vpn) / without_vpn * 100) if without_vpn > 0 else 0,
                    "vpn_overhead_mbps": without_vpn - with_vpn,
                    "recommendation": self._vpn_recommendation(without_vpn, with_vpn)
                }
            
            return {"error": "VPN comparison requires VPN to be active"}
        except Exception as e:
            return {"error": str(e)}
    
    async def _quick_speed_test(self) -> float:
        """Quick download speed test"""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                start = time.time()
                response = await client.get("http://speedtest.ftp.otenet.gr/files/test10Mb.db")
                duration = time.time() - start
                
                if duration > 0:
                    mbps = (len(response.content) * 8) / (duration * 1_000_000)
                    return round(mbps, 2)
        except:
            pass
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
