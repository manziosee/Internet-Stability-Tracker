"""Network Security Features Service"""
import socket
import subprocess
import asyncio
from typing import Dict, Any, List, Optional
import httpx
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.measurement import SecurityScan


# Known secure DNS providers (DoH/DoT-capable) — same list as advanced_diagnostics.py
SECURE_DNS_PROVIDERS = {
    "8.8.8.8", "8.8.4.4",           # Google
    "1.1.1.1", "1.0.0.1",           # Cloudflare
    "9.9.9.9", "149.112.112.112",   # Quad9
    "208.67.222.222", "208.67.220.220",  # OpenDNS
    "94.140.14.14", "94.140.15.15", # AdGuard
}

# Private IP prefixes — skip geo for these
_PRIVATE_PREFIXES = ("127.", "10.", "192.168.", "::1", "::ffff:127.")


def _is_private(ip: str) -> bool:
    return not ip or any(ip.startswith(p) for p in _PRIVATE_PREFIXES)


async def _geo_lookup(client: httpx.AsyncClient, ip: str) -> dict:
    """Look up IP geolocation via ip-api.com with ipapi.co fallback.
    Returns empty dict on failure — callers must not assume any field exists."""
    if _is_private(ip):
        return {}
    try:
        r = await client.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,country,countryCode,isp,org,proxy,hosting"},
            timeout=5,
        )
        if r.status_code == 200:
            d = r.json()
            if d.get("status") == "success":
                return d
    except Exception:
        pass
    try:
        r2 = await client.get(
            f"https://ipapi.co/{ip}/json/",
            headers={"User-Agent": "curl/7.68.0"},
            timeout=5,
        )
        if r2.status_code == 200:
            d2 = r2.json()
            if not d2.get("error"):
                return {
                    "country": d2.get("country_name"),
                    "countryCode": d2.get("country_code"),
                    "isp": d2.get("org"),
                    "org": d2.get("org"),
                    "proxy": False,
                    "hosting": False,
                    "status": "success",
                }
    except Exception:
        pass
    return {}


class NetworkSecurityService:
    """Network security: port scanning, intrusion detection, VPN recommendations, privacy score"""

    def __init__(self, db: Session):
        self.db = db

    async def run_security_audit(self, client_id: str) -> Dict[str, Any]:
        """Run comprehensive security audit"""
        results = await asyncio.gather(
            self.scan_common_ports(),
            self.detect_intrusions(client_id),
            self.calculate_privacy_score(),
            self.recommend_vpn(),
            return_exceptions=True
        )

        audit = {
            "port_scan":           results[0] if not isinstance(results[0], Exception) else {"error": str(results[0])},
            "intrusion_detection": results[1] if not isinstance(results[1], Exception) else {"error": str(results[1])},
            "privacy_score":       results[2] if not isinstance(results[2], Exception) else {"error": str(results[2])},
            "vpn_recommendation":  results[3] if not isinstance(results[3], Exception) else {"error": str(results[3])},
            "timestamp": datetime.utcnow().isoformat()
        }

        self._save_security_scan(client_id, audit)
        return audit

    async def scan_common_ports(self, target: str = "127.0.0.1") -> Dict[str, Any]:
        """Scan common ports for security vulnerabilities"""
        common_ports = {
            21: "FTP",
            22: "SSH",
            23: "Telnet",
            25: "SMTP",
            53: "DNS",
            80: "HTTP",
            110: "POP3",
            143: "IMAP",
            443: "HTTPS",
            445: "SMB",
            3306: "MySQL",
            3389: "RDP",
            5432: "PostgreSQL",
            8080: "HTTP-Alt",
            8443: "HTTPS-Alt",
        }

        open_ports: List[dict] = []
        vulnerable_ports: List[dict] = []
        HIGH_RISK = {21, 23, 25, 110, 143, 445, 3389}

        for port, service in common_ports.items():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.5)
                if sock.connect_ex((target, port)) == 0:
                    open_ports.append({"port": port, "service": service})
                    if port in HIGH_RISK:
                        vulnerable_ports.append({
                            "port": port,
                            "service": service,
                            "risk": "high",
                            "reason": "Unencrypted or commonly exploited service",
                        })
                sock.close()
            except Exception:
                continue
            await asyncio.sleep(0.01)

        risk_level = "high" if vulnerable_ports else "medium" if len(open_ports) > 5 else "low"

        return {
            "open_ports":       open_ports,
            "vulnerable_ports": vulnerable_ports,
            "total_open":       len(open_ports),
            "total_vulnerable": len(vulnerable_ports),
            "risk_level":       risk_level,
            "recommendations":  self._port_recommendations(vulnerable_ports),
        }

    def _port_recommendations(self, vulnerable_ports: List[Dict]) -> List[str]:
        recs = []
        for p in vulnerable_ports:
            port = p["port"]
            svc  = p["service"]
            if port == 21:
                recs.append("Close FTP (port 21) or switch to SFTP/FTPS")
            elif port == 23:
                recs.append("Close Telnet (port 23) — use SSH instead")
            elif port == 3389:
                recs.append("Restrict RDP (port 3389) or route through VPN")
            elif port == 445:
                recs.append("Close SMB (port 445) — common ransomware vector")
            else:
                recs.append(f"Review {svc} on port {port} — ensure it is necessary")
        return recs if recs else ["No immediate port security concerns"]

    async def detect_intrusions(self, client_id: str) -> Dict[str, Any]:
        """Detect unusual traffic patterns that may indicate intrusion"""
        recent_scans = (
            self.db.query(SecurityScan)
            .filter(SecurityScan.client_id == client_id)
            .order_by(SecurityScan.timestamp.desc())
            .limit(10)
            .all()
        )

        if len(recent_scans) < 2:
            return {
                "intrusions_detected": 0,
                "suspicious_activity": [],
                "status": "monitoring",
                "message": "Collecting baseline data — run more scans to enable anomaly detection"
            }

        suspicious_activity = []

        # Detect newly opened ports between scans
        for i in range(len(recent_scans) - 1):
            current_ports  = set(recent_scans[i].open_ports or [])
            previous_ports = set(recent_scans[i + 1].open_ports or [])
            new_ports = current_ports - previous_ports
            if new_ports:
                suspicious_activity.append({
                    "type": "new_open_ports",
                    "timestamp": recent_scans[i].timestamp.isoformat(),
                    "new_ports": list(new_ports),
                    "severity": "medium",
                    "description": f"New ports opened since last scan: {list(new_ports)}",
                })

        # Connection count anomaly
        try:
            result = subprocess.run(
                ["netstat", "-an"], capture_output=True, text=True, timeout=5
            )
            connections = result.stdout.count("ESTABLISHED")
            if connections > 100:
                suspicious_activity.append({
                    "type": "high_connection_count",
                    "count": connections,
                    "severity": "high",
                    "description": f"Unusually high number of established connections: {connections}",
                })
        except Exception:
            pass

        return {
            "intrusions_detected": len(suspicious_activity),
            "suspicious_activity": suspicious_activity,
            "status": "alert" if suspicious_activity else "normal",
            "recommendations": (
                ["Review firewall rules", "Check for unauthorized devices on network", "Run antivirus scan"]
                if suspicious_activity else ["No action needed — network appears normal"]
            ),
        }

    async def calculate_privacy_score(self) -> Dict[str, Any]:
        """Calculate overall network privacy score.
        Uses secure-DNS-provider list (not country comparison) to avoid false positives."""
        score = 100
        issues: List[str] = []

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Get server's public IP
                try:
                    ip_resp = await client.get("https://api.ipify.org?format=json", timeout=5)
                    server_ip = ip_resp.json().get("ip", "")
                except Exception:
                    server_ip = ""

                # Geo-lookup for proxy/hosting detection
                geo = await _geo_lookup(client, server_ip) if server_ip else {}
                if geo.get("proxy") or geo.get("hosting"):
                    score += 10   # bonus: traffic routed via VPN/proxy
                else:
                    score -= 10
                    issues.append("Not using VPN or proxy — your real IP is exposed")

                # DNS leak check — use SECURE_DNS_PROVIDERS list (not country comparison)
                try:
                    dns_resp = await client.get(
                        "https://dns.google/resolve?name=whoami.akamai.net&type=A",
                        timeout=7,
                    )
                    dns_data = dns_resp.json()
                    dns_server_ip = None
                    if "Answer" in dns_data and dns_data["Answer"]:
                        dns_server_ip = dns_data["Answer"][0]["data"]

                    is_secure_dns = dns_server_ip in SECURE_DNS_PROVIDERS if dns_server_ip else False
                    if not is_secure_dns:
                        score -= 20
                        issues.append(
                            f"DNS leak detected — resolver ({dns_server_ip or 'unknown'}) "
                            "is not a known encrypted provider"
                        )
                    else:
                        score += 5   # bonus for encrypted DNS
                except Exception:
                    pass

                # WebRTC leak indicator — flag only if IP is public and no proxy
                if server_ip and not (geo.get("proxy") or geo.get("hosting")):
                    score -= 5
                    issues.append("WebRTC may expose your real IP address in browsers")

        except Exception:
            score = 50
            issues.append("Could not complete privacy check — network unreachable")

        score = max(0, min(100, score))
        grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"

        return {
            "privacy_score": score,
            "grade": grade,
            "issues": issues,
            "recommendations": self._privacy_recommendations(issues),
            "status": (
                "excellent" if score >= 90 else
                "good"      if score >= 75 else
                "fair"      if score >= 60 else "poor"
            ),
        }

    def _privacy_recommendations(self, issues: List[str]) -> List[str]:
        recs = []
        for issue in issues:
            if "vpn" in issue.lower() or "proxy" in issue.lower():
                recs.append("Use a reputable VPN service (WireGuard or OpenVPN-based)")
            if "dns leak" in issue.lower():
                recs.append("Enable DNS over HTTPS (DoH) in your browser or OS")
                recs.append("Switch to Cloudflare 1.1.1.1 or Google 8.8.8.8 with DoH")
            if "webrtc" in issue.lower():
                recs.append("Install a WebRTC leak prevention browser extension")
                recs.append("Disable WebRTC in about:config (Firefox) or via extension (Chrome)")
        return list(dict.fromkeys(recs)) if recs else ["Privacy configuration looks good — continue monitoring"]

    async def recommend_vpn(self) -> Dict[str, Any]:
        """Recommend VPN based on location and ISP"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                ip_resp = await client.get("https://api.ipify.org?format=json", timeout=5)
                server_ip = ip_resp.json().get("ip", "")
                geo = await _geo_lookup(client, server_ip)

                country = geo.get("country", "Unknown")
                isp     = geo.get("isp", "Unknown")

                recommendations = []
                HIGH_CENSORSHIP = {
                    "China", "Russia", "Iran", "North Korea", "Turkey",
                    "United Arab Emirates", "Saudi Arabia", "Egypt",
                }
                if country in HIGH_CENSORSHIP:
                    recommendations.append({
                        "reason": f"High internet censorship in {country}",
                        "priority": "high",
                        "vpn_features": ["Obfuscation / stealth protocols", "No-logs policy", "Multi-hop"],
                    })

                if any(k in (isp or "").lower() for k in ("mobile", "wireless", "cellular")):
                    recommendations.append({
                        "reason": "Mobile/wireless connection — extra encryption recommended",
                        "priority": "medium",
                        "vpn_features": ["Kill switch", "Auto-connect on untrusted networks"],
                    })

                recommendations.append({
                    "reason": "General privacy and security on any network",
                    "priority": "low",
                    "vpn_features": ["AES-256 encryption", "WireGuard protocol", "Split tunneling"],
                })

                return {
                    "should_use_vpn":         len(recommendations) > 1,
                    "your_location":          country,
                    "your_isp":               isp,
                    "recommendations":        recommendations,
                    "suggested_protocols":    ["WireGuard", "OpenVPN", "IKEv2/IPSec"],
                    "features_to_look_for":   [
                        "No-logs policy",
                        "Kill switch",
                        "DNS leak protection",
                        "Multi-hop routing",
                        "Open-source client",
                    ],
                }
        except Exception as e:
            return {"error": str(e)}

    def _save_security_scan(self, client_id: str, audit: Dict[str, Any]):
        try:
            scan = SecurityScan(
                client_id=client_id,
                open_ports=audit.get("port_scan", {}).get("open_ports", []),
                vulnerable_ports=audit.get("port_scan", {}).get("vulnerable_ports", []),
                privacy_score=audit.get("privacy_score", {}).get("privacy_score", 0),
                intrusions_detected=audit.get("intrusion_detection", {}).get("intrusions_detected", 0),
                timestamp=datetime.utcnow(),
            )
            self.db.add(scan)
            self.db.commit()
        except Exception:
            pass
