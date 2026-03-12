"""Network Security Features Service"""
import socket
import subprocess
import asyncio
from typing import Dict, Any, List, Optional
import httpx
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.measurement import SecurityScan


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
            "port_scan": results[0] if not isinstance(results[0], Exception) else {"error": str(results[0])},
            "intrusion_detection": results[1] if not isinstance(results[1], Exception) else {"error": str(results[1])},
            "privacy_score": results[2] if not isinstance(results[2], Exception) else {"error": str(results[2])},
            "vpn_recommendation": results[3] if not isinstance(results[3], Exception) else {"error": str(results[3])},
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
            8443: "HTTPS-Alt"
        }
        
        open_ports = []
        vulnerable_ports = []
        
        for port, service in common_ports.items():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.5)
                result = sock.connect_ex((target, port))
                sock.close()
                
                if result == 0:
                    open_ports.append({"port": port, "service": service})
                    
                    if port in [21, 23, 25, 110, 143, 445, 3389]:
                        vulnerable_ports.append({
                            "port": port,
                            "service": service,
                            "risk": "high",
                            "reason": "Unencrypted or commonly exploited service"
                        })
            except:
                continue
            
            await asyncio.sleep(0.01)
        
        risk_level = "high" if len(vulnerable_ports) > 0 else "medium" if len(open_ports) > 5 else "low"
        
        return {
            "open_ports": open_ports,
            "vulnerable_ports": vulnerable_ports,
            "total_open": len(open_ports),
            "total_vulnerable": len(vulnerable_ports),
            "risk_level": risk_level,
            "recommendations": self._port_recommendations(vulnerable_ports)
        }
    
    def _port_recommendations(self, vulnerable_ports: List[Dict]) -> List[str]:
        """Generate port security recommendations"""
        recommendations = []
        
        for port_info in vulnerable_ports:
            port = port_info["port"]
            service = port_info["service"]
            
            if port == 21:
                recommendations.append(f"Close FTP port {port} or use SFTP/FTPS instead")
            elif port == 23:
                recommendations.append(f"Close Telnet port {port} - use SSH instead")
            elif port == 3389:
                recommendations.append(f"Restrict RDP access on port {port} or use VPN")
            elif port == 445:
                recommendations.append(f"Close SMB port {port} if not needed - common ransomware target")
            else:
                recommendations.append(f"Review {service} on port {port} - ensure it's necessary")
        
        if not recommendations:
            recommendations.append("No immediate port security concerns")
        
        return recommendations
    
    async def detect_intrusions(self, client_id: str) -> Dict[str, Any]:
        """Detect unusual traffic patterns that may indicate intrusion"""
        recent_scans = self.db.query(SecurityScan).filter(
            SecurityScan.client_id == client_id
        ).order_by(SecurityScan.timestamp.desc()).limit(10).all()
        
        if len(recent_scans) < 2:
            return {
                "intrusions_detected": 0,
                "suspicious_activity": [],
                "status": "monitoring"
            }
        
        suspicious_activity = []
        
        port_changes = []
        for i in range(len(recent_scans) - 1):
            current_ports = set(recent_scans[i].open_ports or [])
            previous_ports = set(recent_scans[i + 1].open_ports or [])
            
            new_ports = current_ports - previous_ports
            if new_ports:
                port_changes.append({
                    "timestamp": recent_scans[i].timestamp.isoformat(),
                    "new_ports": list(new_ports),
                    "severity": "medium"
                })
        
        if port_changes:
            suspicious_activity.extend(port_changes)
        
        try:
            result = subprocess.run(
                ["netstat", "-an"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            connections = result.stdout.count("ESTABLISHED")
            if connections > 100:
                suspicious_activity.append({
                    "type": "high_connection_count",
                    "count": connections,
                    "severity": "high",
                    "description": "Unusually high number of network connections"
                })
        except:
            pass
        
        return {
            "intrusions_detected": len(suspicious_activity),
            "suspicious_activity": suspicious_activity,
            "status": "alert" if len(suspicious_activity) > 0 else "normal",
            "recommendations": [
                "Review firewall rules",
                "Check for unauthorized devices on network",
                "Run antivirus scan"
            ] if suspicious_activity else ["No action needed"]
        }
    
    async def calculate_privacy_score(self) -> Dict[str, Any]:
        """Calculate overall network privacy score"""
        score = 100
        issues = []
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                ip_response = await client.get("https://api.ipify.org?format=json")
                ip = ip_response.json()["ip"]
                
                geo_response = await client.get(f"http://ip-api.com/json/{ip}")
                geo_data = geo_response.json()
                
                if geo_data.get("proxy") or geo_data.get("hosting"):
                    score += 10
                else:
                    score -= 10
                    issues.append("Not using VPN or proxy")
                
                try:
                    dns_response = await client.get("https://dns.google/resolve?name=whoami.akamai.net&type=A")
                    dns_data = dns_response.json()
                    
                    if "Answer" in dns_data:
                        dns_ip = dns_data["Answer"][0]["data"]
                        dns_geo = await client.get(f"http://ip-api.com/json/{dns_ip}")
                        dns_geo_data = dns_geo.json()
                        
                        if dns_geo_data.get("country") != geo_data.get("country"):
                            score -= 15
                            issues.append("DNS leak detected")
                except:
                    pass
                
                try:
                    webrtc_response = await client.get("https://api.ipify.org?format=json")
                    if webrtc_response.status_code == 200:
                        score -= 5
                        issues.append("WebRTC may leak real IP")
                except:
                    pass
        except:
            score = 50
            issues.append("Could not complete privacy check")
        
        score = max(0, min(100, score))
        
        grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"
        
        return {
            "privacy_score": score,
            "grade": grade,
            "issues": issues,
            "recommendations": self._privacy_recommendations(issues),
            "status": "excellent" if score >= 90 else "good" if score >= 75 else "fair" if score >= 60 else "poor"
        }
    
    def _privacy_recommendations(self, issues: List[str]) -> List[str]:
        """Generate privacy recommendations"""
        recommendations = []
        
        for issue in issues:
            if "vpn" in issue.lower():
                recommendations.append("Use a reputable VPN service")
            elif "dns leak" in issue.lower():
                recommendations.append("Configure DNS over HTTPS (DoH) or DNS over TLS (DoT)")
                recommendations.append("Use VPN with DNS leak protection")
            elif "webrtc" in issue.lower():
                recommendations.append("Disable WebRTC in browser or use extension to block leaks")
        
        if not recommendations:
            recommendations.append("Privacy configuration is good - continue monitoring")
        
        return recommendations
    
    async def recommend_vpn(self) -> Dict[str, Any]:
        """Recommend VPN based on location and needs"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                ip_response = await client.get("https://api.ipify.org?format=json")
                ip = ip_response.json()["ip"]
                
                geo_response = await client.get(f"http://ip-api.com/json/{ip}")
                geo_data = geo_response.json()
                
                country = geo_data.get("country", "Unknown")
                isp = geo_data.get("isp", "Unknown")
                
                recommendations = []
                
                high_censorship_countries = ["China", "Russia", "Iran", "North Korea", "Turkey", "UAE"]
                if country in high_censorship_countries:
                    recommendations.append({
                        "reason": "High internet censorship in your region",
                        "priority": "high",
                        "vpn_features": ["Obfuscation", "Stealth protocols", "No logs policy"]
                    })
                
                if "mobile" in isp.lower() or "wireless" in isp.lower():
                    recommendations.append({
                        "reason": "Mobile/wireless connection - extra security recommended",
                        "priority": "medium",
                        "vpn_features": ["Kill switch", "Auto-connect on untrusted networks"]
                    })
                
                recommendations.append({
                    "reason": "General privacy protection",
                    "priority": "medium",
                    "vpn_features": ["AES-256 encryption", "WireGuard protocol", "Split tunneling"]
                })
                
                return {
                    "should_use_vpn": len(recommendations) > 1,
                    "your_location": country,
                    "your_isp": isp,
                    "recommendations": recommendations,
                    "suggested_protocols": ["WireGuard", "OpenVPN", "IKEv2"],
                    "features_to_look_for": [
                        "No logs policy",
                        "Kill switch",
                        "DNS leak protection",
                        "Multi-hop routing",
                        "Port forwarding"
                    ]
                }
        except Exception as e:
            return {"error": str(e)}
    
    def _save_security_scan(self, client_id: str, audit: Dict[str, Any]):
        """Save security scan results to database"""
        try:
            scan = SecurityScan(
                client_id=client_id,
                open_ports=audit.get("port_scan", {}).get("open_ports", []),
                vulnerable_ports=audit.get("port_scan", {}).get("vulnerable_ports", []),
                privacy_score=audit.get("privacy_score", {}).get("privacy_score", 0),
                intrusions_detected=audit.get("intrusion_detection", {}).get("intrusions_detected", 0),
                timestamp=datetime.utcnow()
            )
            self.db.add(scan)
            self.db.commit()
        except:
            pass
