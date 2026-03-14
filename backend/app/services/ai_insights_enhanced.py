"""AI-Powered Insights Service - Enhanced"""
import statistics
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.measurement import SpeedMeasurement as Measurement


class AIInsightsService:
    """Enhanced AI insights: root cause analysis, predictive maintenance, anomaly detection, NLP"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def analyze_root_cause(self, client_id: str, hours: int = 24) -> Dict[str, Any]:
        """Analyze root cause of slow speeds"""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        measurements = self.db.query(Measurement).filter(
            and_(
                Measurement.client_id == client_id,
                Measurement.timestamp >= cutoff
            )
        ).order_by(Measurement.timestamp.desc()).all()
        
        if not measurements:
            return {"error": "No data available"}
        
        avg_download = statistics.mean([m.download_speed for m in measurements if m.download_speed])
        avg_ping = statistics.mean([m.ping for m in measurements if m.ping])
        
        causes = []
        confidence_scores = []
        
        slow_measurements = [m for m in measurements if m.download_speed and m.download_speed < avg_download * 0.5]
        if len(slow_measurements) > len(measurements) * 0.3:
            hour_distribution = {}
            for m in slow_measurements:
                hour = m.timestamp.hour
                hour_distribution[hour] = hour_distribution.get(hour, 0) + 1
            
            if hour_distribution:
                peak_hour = max(hour_distribution, key=hour_distribution.get)
                if 18 <= peak_hour <= 23:
                    causes.append("Network congestion during peak hours (6 PM - 11 PM)")
                    confidence_scores.append(85)
                elif 8 <= peak_hour <= 17:
                    causes.append("Daytime congestion (work hours)")
                    confidence_scores.append(75)
        
        high_ping_count = len([m for m in measurements if m.ping and m.ping > 100])
        if high_ping_count > len(measurements) * 0.4:
            causes.append("High latency - possible ISP routing issues or distance to server")
            confidence_scores.append(80)
        
        if measurements:
            recent_speeds = [m.download_speed for m in measurements[:10] if m.download_speed]
            older_speeds = [m.download_speed for m in measurements[-10:] if m.download_speed]
            
            if recent_speeds and older_speeds:
                recent_avg = statistics.mean(recent_speeds)
                older_avg = statistics.mean(older_speeds)
                
                if recent_avg < older_avg * 0.7:
                    causes.append("Progressive speed degradation - router may need reboot")
                    confidence_scores.append(70)
        
        weekend_speeds = []
        weekday_speeds = []
        for m in measurements:
            if m.download_speed:
                if m.timestamp.weekday() >= 5:
                    weekend_speeds.append(m.download_speed)
                else:
                    weekday_speeds.append(m.download_speed)
        
        if weekend_speeds and weekday_speeds:
            weekend_avg = statistics.mean(weekend_speeds)
            weekday_avg = statistics.mean(weekday_speeds)
            
            if weekday_avg < weekend_avg * 0.8:
                causes.append("Weekday slowdown - shared bandwidth in residential area")
                confidence_scores.append(65)
        
        if not causes:
            causes.append("No specific issues detected - speeds within normal range")
            confidence_scores.append(90)
        
        recommendations = self._generate_recommendations(causes)
        
        return {
            "root_causes": [
                {"cause": cause, "confidence": score}
                for cause, score in zip(causes, confidence_scores)
            ],
            "primary_cause": causes[0] if causes else None,
            "recommendations": recommendations,
            "analysis_period_hours": hours,
            "measurements_analyzed": len(measurements)
        }
    
    def _generate_recommendations(self, causes: List[str]) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []
        
        for cause in causes:
            if "peak hours" in cause.lower():
                recommendations.append("Schedule large downloads during off-peak hours (2 AM - 6 AM)")
                recommendations.append("Enable QoS on router to prioritize critical traffic")
            elif "high latency" in cause.lower():
                recommendations.append("Contact ISP to check routing configuration")
                recommendations.append("Try using a wired connection instead of WiFi")
            elif "degradation" in cause.lower():
                recommendations.append("Reboot your router and modem")
                recommendations.append("Check for router firmware updates")
            elif "weekday" in cause.lower():
                recommendations.append("Consider upgrading to a higher-tier plan")
                recommendations.append("Use bandwidth monitoring to identify heavy users")
        
        if not recommendations:
            recommendations.append("Continue monitoring - no immediate action needed")
        
        return list(set(recommendations))
    
    def predict_maintenance(self, client_id: str) -> Dict[str, Any]:
        """Predict when router/equipment needs maintenance"""
        measurements = self.db.query(Measurement).filter(
            Measurement.client_id == client_id
        ).order_by(Measurement.timestamp.desc()).limit(200).all()
        
        if len(measurements) < 50:
            return {"error": "Insufficient data for prediction"}
        
        measurements.reverse()
        
        speed_trend = []
        window_size = 10
        for i in range(len(measurements) - window_size):
            window = measurements[i:i+window_size]
            avg_speed = statistics.mean([m.download_speed for m in window if m.download_speed])
            speed_trend.append(avg_speed)
        
        if len(speed_trend) < 2:
            return {"error": "Insufficient trend data"}
        
        recent_trend = speed_trend[-5:]
        older_trend = speed_trend[:5]
        
        recent_avg = statistics.mean(recent_trend)
        older_avg = statistics.mean(older_trend)
        
        degradation_rate = (older_avg - recent_avg) / older_avg if older_avg > 0 else 0
        
        needs_reboot = False
        days_until_reboot = None
        confidence = 0
        
        if degradation_rate > 0.3:
            needs_reboot = True
            days_until_reboot = 2
            confidence = 85
        elif degradation_rate > 0.2:
            needs_reboot = True
            days_until_reboot = 5
            confidence = 70
        elif degradation_rate > 0.1:
            days_until_reboot = 10
            confidence = 55
        
        uptime_estimate = self._estimate_uptime(measurements)
        
        return {
            "needs_maintenance": needs_reboot,
            "days_until_maintenance": days_until_reboot,
            "confidence_percent": confidence,
            "degradation_rate_percent": round(degradation_rate * 100, 2),
            "estimated_uptime_days": uptime_estimate,
            "recommendation": self._maintenance_recommendation(needs_reboot, days_until_reboot),
            "actions": [
                "Reboot router and modem",
                "Check for firmware updates",
                "Clear DNS cache",
                "Inspect cable connections"
            ] if needs_reboot else ["Continue monitoring"]
        }
    
    def _estimate_uptime(self, measurements: List[Measurement]) -> Optional[int]:
        """Estimate router uptime based on patterns"""
        if not measurements:
            return None
        
        time_span = (measurements[-1].timestamp - measurements[0].timestamp).days
        return max(time_span, 1)
    
    def _maintenance_recommendation(self, needs_reboot: bool, days: Optional[int]) -> str:
        """Generate maintenance recommendation"""
        if needs_reboot and days:
            if days <= 2:
                return f"⚠️ Router reboot recommended within {days} days"
            else:
                return f"Router reboot suggested in approximately {days} days"
        return "✅ Equipment operating normally"
    
    def detect_anomalies_advanced(self, client_id: str, sensitivity: float = 2.0) -> Dict[str, Any]:
        """Advanced anomaly detection with pattern recognition"""
        measurements = self.db.query(Measurement).filter(
            Measurement.client_id == client_id
        ).order_by(Measurement.timestamp.desc()).limit(500).all()
        
        if len(measurements) < 30:
            return {"error": "Insufficient data"}
        
        speeds = [m.download_speed for m in measurements if m.download_speed]
        pings = [m.ping for m in measurements if m.ping]
        
        if not speeds:
            return {"error": "No speed data"}
        
        speed_mean = statistics.mean(speeds)
        speed_stdev = statistics.stdev(speeds) if len(speeds) > 1 else 0
        
        ping_mean = statistics.mean(pings) if pings else 0
        ping_stdev = statistics.stdev(pings) if len(pings) > 1 else 0
        
        anomalies = []
        
        for m in measurements[:50]:
            if m.download_speed:
                z_score = abs((m.download_speed - speed_mean) / speed_stdev) if speed_stdev > 0 else 0
                
                if z_score > sensitivity:
                    anomalies.append({
                        "timestamp": m.timestamp.isoformat(),
                        "type": "speed_anomaly",
                        "value": m.download_speed,
                        "expected": round(speed_mean, 2),
                        "deviation": round(z_score, 2),
                        "severity": "high" if z_score > 3 else "medium"
                    })
            
            if m.ping and ping_stdev > 0:
                z_score = abs((m.ping - ping_mean) / ping_stdev)
                
                if z_score > sensitivity:
                    anomalies.append({
                        "timestamp": m.timestamp.isoformat(),
                        "type": "latency_anomaly",
                        "value": m.ping,
                        "expected": round(ping_mean, 2),
                        "deviation": round(z_score, 2),
                        "severity": "high" if z_score > 3 else "medium"
                    })
        
        patterns = self._detect_patterns(measurements)
        
        return {
            "anomalies_detected": len(anomalies),
            "anomalies": anomalies[:20],
            "patterns": patterns,
            "sensitivity_threshold": sensitivity,
            "baseline_speed_mbps": round(speed_mean, 2),
            "baseline_ping_ms": round(ping_mean, 2)
        }
    
    def _detect_patterns(self, measurements: List[Measurement]) -> List[str]:
        """Detect recurring patterns"""
        patterns = []
        
        hourly_speeds = {}
        for m in measurements:
            if m.download_speed:
                hour = m.timestamp.hour
                if hour not in hourly_speeds:
                    hourly_speeds[hour] = []
                hourly_speeds[hour].append(m.download_speed)
        
        if hourly_speeds:
            hourly_avgs = {h: statistics.mean(speeds) for h, speeds in hourly_speeds.items()}
            overall_avg = statistics.mean(hourly_avgs.values())
            
            slow_hours = [h for h, avg in hourly_avgs.items() if avg < overall_avg * 0.7]
            if slow_hours:
                patterns.append(f"Recurring slowdown at hours: {sorted(slow_hours)}")
        
        return patterns
    
    def answer_natural_query(self, client_id: str, query: str) -> Dict[str, Any]:
        """Answer natural language queries about network performance using real DB data.
        Every code path MUST return a dict with an 'answer' key so the frontend chatbot
        always has something to display."""
        query_lower = query.lower().strip()

        # ── Load last 168 hours of measurements for this client ───────────────
        cutoff = datetime.utcnow() - timedelta(hours=168)
        measurements = self.db.query(Measurement).filter(
            and_(
                Measurement.client_id == client_id,
                Measurement.timestamp >= cutoff
            )
        ).order_by(Measurement.timestamp.asc()).all()

        # ── Greeting — respond before data check ─────────────────────────────
        if any(k in query_lower for k in ("hi", "hello", "hey", "howdy", "sup", "good morning", "good evening")):
            if not measurements:
                return {
                    "answer": (
                        "👋 Hello! I'm your AI network assistant. "
                        "I don't have any data for your device yet — run a speed test first and I'll be ready to answer your questions!"
                    ),
                    "suggestions": ["Why is my speed slow?", "Is my connection good for gaming?", "Show network summary"],
                }
            speeds  = [m.download_speed for m in measurements if m.download_speed is not None]
            pings   = [m.ping           for m in measurements if m.ping           is not None]
            avg_dl  = round(statistics.mean(speeds), 1) if speeds else 0
            avg_p   = round(statistics.mean(pings),  1) if pings  else 0
            ping_q  = "excellent" if avg_p < 20 else "good" if avg_p < 50 else "fair" if avg_p < 100 else "poor"
            return {
                "answer": (
                    f"👋 Hello! I'm your AI network assistant. "
                    f"Based on {len(measurements)} test(s) in the past 7 days, your connection is running at "
                    f"↓{avg_dl} Mbps with {avg_p} ms ping ({ping_q}). "
                    "Ask me anything about your network performance!"
                ),
                "avg_download_mbps": avg_dl,
                "avg_ping_ms": avg_p,
                "total_tests": len(measurements),
                "suggestions": [
                    "How is my upload speed?",
                    "Is my connection good for gaming?",
                    "When is the best time to download?",
                    "Why is my speed slow?",
                ],
            }

        if not measurements:
            return {
                "answer": (
                    "I don't have any measurement data for your session yet. "
                    "Run a speed test first so I can analyze your connection and answer your questions."
                ),
                "suggestions": [
                    "Why is my speed slow?",
                    "When is the best time to download?",
                    "How many outages did I have?",
                    "What is my average ping?",
                ]
            }

        # ── Compute live stats from real DB data ──────────────────────────────
        speeds  = [m.download_speed for m in measurements if m.download_speed is not None]
        uploads = [m.upload_speed   for m in measurements if m.upload_speed   is not None]
        pings   = [m.ping           for m in measurements if m.ping           is not None]
        outages = [m for m in measurements if m.is_outage]

        avg_download = round(statistics.mean(speeds),  2) if speeds  else 0
        avg_upload   = round(statistics.mean(uploads), 2) if uploads else 0
        avg_ping     = round(statistics.mean(pings),   2) if pings   else 0
        max_download = round(max(speeds),  2) if speeds  else 0
        min_download = round(min(speeds),  2) if speeds  else 0
        max_upload   = round(max(uploads), 2) if uploads else 0
        outage_count = len(outages)
        total_tests  = len(measurements)

        # Hourly breakdown for best/worst hours
        hourly: Dict[int, list] = {}
        for m in measurements:
            if m.download_speed is not None:
                hourly.setdefault(m.timestamp.hour, []).append(m.download_speed)
        hourly_avgs = {h: statistics.mean(v) for h, v in hourly.items()} if hourly else {}
        best_hour  = max(hourly_avgs, key=hourly_avgs.get) if hourly_avgs else None
        worst_hour = min(hourly_avgs, key=hourly_avgs.get) if hourly_avgs else None
        best_str   = f"{best_hour:02d}:00"  if best_hour  is not None else "N/A"
        worst_str  = f"{worst_hour:02d}:00" if worst_hour is not None else "N/A"

        # Ping quality label
        ping_quality = (
            "excellent" if avg_ping < 20 else
            "good"      if avg_ping < 50 else
            "fair"      if avg_ping < 100 else "poor"
        )

        # Upload quality label
        upload_quality = (
            "excellent" if avg_upload > 50 else
            "good"      if avg_upload > 20 else
            "fair"      if avg_upload > 5  else "poor"
        )

        # Download quality label
        download_quality = (
            "excellent" if avg_download > 100 else
            "good"      if avg_download > 50  else
            "fair"      if avg_download > 10  else "poor"
        )

        uptime_pct = round(((total_tests - outage_count) / total_tests) * 100, 1) if total_tests else 0

        # ── Base context for all responses ────────────────────────────────────
        base = {
            "avg_download_mbps": avg_download,
            "avg_upload_mbps":   avg_upload,
            "avg_ping_ms":       avg_ping,
            "outage_count":      outage_count,
            "total_tests":       total_tests,
            "best_hour":         best_hour,
            "worst_hour":        worst_hour,
        }

        suggestions = [
            "Why is my speed slow?",
            "When is the best time to download?",
            "How many outages did I have this week?",
            "Is my connection good for gaming?",
            "Compare my upload vs download",
            "Show last week summary",
        ]

        # ── Helper: does query contain a whole word / phrase? ─────────────────
        def has(phrase: str) -> bool:
            return phrase in query_lower

        def has_any(*phrases) -> bool:
            return any(p in query_lower for p in phrases)

        # ═══════════════════════════════════════════════════════════════════════
        # IMPORTANT: upload/download checks come BEFORE outage check to avoid
        # "download" matching the "down" in the outage pattern.
        # ═══════════════════════════════════════════════════════════════════════

        # Upload speed — MUST be before outage check
        if has_any("upload", "up speed", "upstream", "how fast is my upload", "upload rate",
                   "upload speed", "my upload", "send speed"):
            upload_tip = (
                "Great for cloud backups and video streaming!" if avg_upload > 50 else
                "Suitable for most video calls and uploads." if avg_upload > 10 else
                "⚠️ Low upload speed — may struggle with video calls or large file uploads."
            )
            return {
                **base,
                "answer": (
                    f"Your upload speed: ↑{avg_upload} Mbps ({upload_quality}) — "
                    f"peak {max_upload} Mbps over {total_tests} test(s). {upload_tip}"
                ),
                "upload_quality": upload_quality,
                "max_upload_mbps": max_upload,
                "suggestions": suggestions,
            }

        # Download speed — MUST be before outage check
        if has_any("download", "down speed", "downstream", "how fast is my download", "dl speed",
                   "download rate", "my download", "receive speed"):
            dl_tip = (
                "✅ Excellent — handles 4K streaming, large downloads, and multiple devices." if avg_download > 100 else
                "✅ Good — suitable for HD streaming and most online activities." if avg_download > 50 else
                "✅ Adequate for standard HD streaming." if avg_download > 10 else
                "⚠️ Low download speed — consider checking your connection or contacting your ISP."
            )
            return {
                **base,
                "answer": (
                    f"Your download speed: ↓{avg_download} Mbps ({download_quality}) — "
                    f"peak {max_download} Mbps, lowest {min_download} Mbps over {total_tests} test(s). {dl_tip}"
                ),
                "download_quality": download_quality,
                "max_download_mbps": max_download,
                "min_download_mbps": min_download,
                "suggestions": suggestions,
            }

        # Compare upload vs download
        if has_any("compare", "versus", " vs ", "difference between", "upload and download",
                   "download and upload", "asymmetric", "symmetric"):
            ratio = round(avg_upload / avg_download, 2) if avg_download > 0 else 0
            sym = "roughly symmetric" if 0.8 <= ratio <= 1.2 else ("upload-heavy" if ratio > 1.2 else "download-heavy")
            return {
                **base,
                "answer": (
                    f"Speed comparison over {total_tests} test(s): "
                    f"↓{avg_download} Mbps download vs ↑{avg_upload} Mbps upload. "
                    f"Your connection is {sym} (ratio {ratio}:1 upload/download). "
                    f"Peak download: {max_download} Mbps, peak upload: {max_upload} Mbps."
                ),
                "upload_to_download_ratio": ratio,
                "connection_type": sym,
                "suggestions": suggestions,
            }

        # Trend / improving / getting worse
        if has_any("trend", "improving", "getting better", "getting worse", "degrading",
                   "over time", "change", "improved", "worsened"):
            if len(speeds) >= 4:
                half = len(speeds) // 2
                older_avg = round(statistics.mean(speeds[:half]), 1)
                newer_avg = round(statistics.mean(speeds[half:]), 1)
                delta = round(newer_avg - older_avg, 1)
                direction = "improving ↑" if delta > 1 else ("declining ↓" if delta < -1 else "stable →")
                trend_msg = (
                    f"Your connection is {direction}. "
                    f"Earlier average: {older_avg} Mbps → Recent average: {newer_avg} Mbps "
                    f"({'+' if delta >= 0 else ''}{delta} Mbps change)."
                )
            else:
                trend_msg = f"Not enough data for trend analysis yet ({total_tests} tests). Current avg: {avg_download} Mbps."
            return {**base, "answer": trend_msg, "suggestions": suggestions}

        # Yesterday / last 24 hours
        if has_any("yesterday", "last 24", "24 hour", "today", "24h"):
            result = self._analyze_period(client_id, hours=24, period_name="the past 24 hours")
            result.setdefault("answer", f"In the past 24 hours: avg download {avg_download} Mbps, ping {avg_ping} ms.")
            return {**base, **result, "suggestions": suggestions}

        # Last week
        if has_any("last week", "past week", "weekly", "7 day", "this week", "week summary"):
            return {
                **base,
                "answer": (
                    f"Last week summary ({total_tests} tests): "
                    f"↓{avg_download} Mbps / ↑{avg_upload} Mbps, ping {avg_ping} ms ({ping_quality}). "
                    f"Uptime: {uptime_pct}%, outages: {outage_count}. "
                    f"Best hour: {best_str}, slowest: {worst_str}."
                ),
                "uptime_percent": uptime_pct,
                "suggestions": suggestions,
            }

        # Why slow / issues / bad connection
        if has_any("slow", "bad", "why", "issue", "problem", "worse", "degrad", "not working"):
            result = self.analyze_root_cause(client_id, hours=48)
            if "error" in result:
                answer = (
                    f"Based on {total_tests} measurements: your avg download is {avg_download} Mbps "
                    f"with {avg_ping} ms ping. Need more data for detailed root cause analysis."
                )
            else:
                primary = result.get("primary_cause", "No specific issues found")
                causes = result.get("root_causes", [])
                extra = ""
                if len(causes) > 1:
                    extras = [c["cause"] for c in causes[1:3]]
                    extra = f" Also: {'; '.join(extras)}."
                answer = (
                    f"Root cause ({result.get('measurements_analyzed', total_tests)} measurements): "
                    f"{primary}.{extra} "
                    f"Current avg: ↓{avg_download} Mbps, {avg_ping} ms ping."
                )
            result["answer"] = answer
            return {**base, **result, "suggestions": suggestions}

        # Best time to use / download / schedule
        if has_any("best time", "when to download", "schedule", "when should", "optimal time",
                   "best hour", "when is the best", "when to use", "best to use",
                   "when can i", "best moment"):
            result = self._find_best_times(client_id)
            best_times = result.get("best_hours", [])
            if best_times:
                top = best_times[0]
                top3 = ", ".join(f"{h['hour']:02d}:00 ({h['avg_speed_mbps']} Mbps)" for h in best_times[:3])
                answer = (
                    f"Best times to use your internet: {top3}. "
                    f"Peak performance at {top['hour']:02d}:00 ({top['avg_speed_mbps']} Mbps). "
                    f"Avoid {worst_str} — your historically slowest hour."
                )
            else:
                answer = f"Best hour based on history: {best_str}. Avoid {worst_str}."
            result["answer"] = answer
            return {**base, **result, "suggestions": suggestions}

        # Outage / downtime — NOTE: "download" is excluded via order (handled above)
        if has_any("outage", "offline", "disconnect", "cut off", "no internet",
                   "connection dropped", "went down", "was down", "how many outages",
                   "uptime", "availability"):
            worst_info = f" Worst period around {worst_str}." if worst_hour is not None else ""
            return {
                **base,
                "answer": (
                    f"Outage report (past 7 days): {outage_count} outage event(s) out of {total_tests} tests "
                    f"({uptime_pct}% uptime).{worst_info}"
                    + (" ✅ Great reliability!" if uptime_pct >= 99
                       else " ⚠️ Some instability detected." if uptime_pct < 95 else "")
                ),
                "uptime_percent": uptime_pct,
                "suggestions": suggestions,
            }

        # Ping / latency / lag
        if has_any("ping", "latency", "lag", " ms ", "delay", "response time", "jitter"):
            latency_tip = (
                "✅ Excellent latency — perfect for gaming and real-time apps!" if avg_ping < 20 else
                "✅ Good latency." if avg_ping < 50 else
                "Fair — wired connection may improve this." if avg_ping < 100 else
                "⚠️ High latency — contact your ISP or try a wired connection."
            )
            return {
                **base,
                "answer": (
                    f"Your ping: {avg_ping} ms ({ping_quality}) over {total_tests} tests. "
                    f"Best hour for low latency: {best_str}. {latency_tip}"
                ),
                "ping_quality": ping_quality,
                "suggestions": suggestions,
            }

        # Gaming
        if has_any("gaming", "game", "fps", "competitive", "esport", "fortnite", "warzone",
                   "valorant", "csgo", "minecraft", "multiplayer"):
            gaming_ok = avg_ping < 60 and outage_count == 0 and avg_download >= 3
            game_grade = "A (Excellent)" if avg_ping < 20 else "B (Good)" if avg_ping < 50 else "C (Fair)" if avg_ping < 100 else "D (Poor)"
            return {
                **base,
                "answer": (
                    f"Gaming assessment — Grade {game_grade}: "
                    f"ping {avg_ping} ms, ↓{avg_download} Mbps, {outage_count} outage(s). "
                    + ("✅ Great for competitive gaming!" if gaming_ok
                       else "⚠️ May cause lag in competitive games. Wired connection recommended.")
                ),
                "gaming_suitable": gaming_ok,
                "gaming_grade": game_grade,
                "suggestions": suggestions,
            }

        # Video calls
        if has_any("video call", "zoom", "teams", "meet", "skype", "webex", "conference",
                   "google meet", "facetime", "video chat"):
            vcall_ok = avg_download >= 5 and avg_upload >= 1.5 and avg_ping < 150
            hd_vcall = avg_download >= 15 and avg_upload >= 3
            return {
                **base,
                "answer": (
                    f"Video call assessment: ↓{avg_download} Mbps / ↑{avg_upload} Mbps, ping {avg_ping} ms. "
                    + ("✅ Excellent — supports HD group calls!" if hd_vcall
                       else "✅ Suitable for standard video calls." if vcall_ok
                       else "⚠️ Marginal — may experience quality drops.")
                ),
                "vcall_suitable": vcall_ok,
                "hd_vcall_ok": hd_vcall,
                "suggestions": suggestions,
            }

        # Streaming
        if has_any("stream", "netflix", "youtube", "4k", "hd video", "video quality", "prime video",
                   "disney", "twitch", "tv quality"):
            uhd_ok = avg_download >= 25
            hd_ok  = avg_download >= 5
            return {
                **base,
                "answer": (
                    f"Streaming assessment: avg download {avg_download} Mbps. "
                    + ("✅ Supports 4K/UHD streaming on multiple devices!" if uhd_ok
                       else "✅ Supports HD streaming." if hd_ok
                       else "⚠️ May struggle with HD — check for background downloads.")
                ),
                "supports_4k": uhd_ok,
                "supports_hd": hd_ok,
                "suggestions": suggestions,
            }

        # ISP / provider
        if has_any("isp", "provider", "internet provider", "carrier", "network provider", "who is my isp"):
            isps = list({m.isp for m in measurements if m.isp})
            isp_str = ", ".join(isps) if isps else "unknown"
            return {
                **base,
                "answer": (
                    f"Detected ISP(s): {isp_str}. "
                    f"Over {total_tests} tests: ↓{avg_download} Mbps / ↑{avg_upload} Mbps, "
                    f"{avg_ping} ms ping, {uptime_pct}% uptime."
                ),
                "isps_detected": isps,
                "suggestions": suggestions,
            }

        # Router / maintenance
        if has_any("reboot", "router", "restart", "maintenance", "reset", "modem",
                   "firmware", "equipment"):
            result = self.predict_maintenance(client_id)
            if "error" in result:
                answer = (
                    f"Not enough data for maintenance prediction yet ({total_tests} tests, need 50+). "
                    f"Current avg: {avg_download} Mbps, ping {avg_ping} ms."
                )
            else:
                answer = result.get("recommendation", "✅ Router operating normally.")
            result["answer"] = answer
            return {**base, **result, "suggestions": suggestions}

        # Speed / bandwidth / how fast (generic)
        if has_any("speed", "how fast", "mbps", "bandwidth", "how quick", "connection speed",
                   "internet speed", "my speed", "current speed"):
            return {
                **base,
                "answer": (
                    f"Your connection speed ({total_tests} tests): "
                    f"↓{avg_download} Mbps ({download_quality}) / ↑{avg_upload} Mbps ({upload_quality}), "
                    f"ping {avg_ping} ms ({ping_quality}). "
                    f"Peak download: {max_download} Mbps."
                ),
                "download_quality": download_quality,
                "upload_quality": upload_quality,
                "ping_quality": ping_quality,
                "suggestions": suggestions,
            }

        # Overall health / status / summary / how is
        if has_any("overall", "summary", "status", "health", "report", "overview", "how is my",
                   "how am i doing", "give me a summary"):
            score = (
                "excellent" if avg_download > 100 and avg_ping < 20 and uptime_pct >= 99 else
                "good"      if avg_download > 50  and avg_ping < 50 and uptime_pct >= 95 else
                "fair"      if avg_download > 10  and avg_ping < 100 else "poor"
            )
            return {
                **base,
                "answer": (
                    f"Network health: {score.upper()} ({total_tests} tests, past 7 days) — "
                    f"↓{avg_download} Mbps / ↑{avg_upload} Mbps, ping {avg_ping} ms ({ping_quality}), "
                    f"uptime {uptime_pct}%, {outage_count} outage(s). "
                    f"Best hour: {best_str}, slowest: {worst_str}."
                ),
                "health_score": score,
                "uptime_percent": uptime_pct,
                "suggestions": suggestions,
            }

        # ── Default: comprehensive summary ────────────────────────────────────
        return {
            **base,
            "answer": (
                f"Here's your connection snapshot ({total_tests} tests, past 7 days): "
                f"↓{avg_download} Mbps / ↑{avg_upload} Mbps, ping {avg_ping} ms ({ping_quality}). "
                f"Uptime: {uptime_pct}%, {outage_count} outage(s). "
                f"Best hour: {best_str}. "
                "Try: 'How is my upload?', 'Am I good for gaming?', 'When is the best time to download?', or 'Why is my speed slow?'"
            ),
            "uptime_percent": uptime_pct,
            "suggestions": [
                "How is my upload speed?",
                "How is my download speed?",
                "Is my connection good for gaming?",
                "When is the best time to use my internet?",
                "Why is my speed slow?",
                "Compare my upload vs download",
            ],
        }
    
    def _analyze_period(self, client_id: str, hours: int, period_name: str) -> Dict[str, Any]:
        """Analyze specific time period"""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        measurements = self.db.query(Measurement).filter(
            and_(
                Measurement.client_id == client_id,
                Measurement.timestamp >= cutoff
            )
        ).all()
        
        if not measurements:
            return {"answer": f"No data available for {period_name}"}
        
        speeds = [m.download_speed for m in measurements if m.download_speed]
        pings = [m.ping for m in measurements if m.ping]
        
        avg_speed = statistics.mean(speeds) if speeds else 0
        avg_ping = statistics.mean(pings) if pings else 0
        
        return {
            "answer": f"During {period_name}, your average speed was {avg_speed:.1f} Mbps with {avg_ping:.1f}ms ping. {len(measurements)} measurements were taken.",
            "avg_speed_mbps": round(avg_speed, 2),
            "avg_ping_ms": round(avg_ping, 2),
            "measurements": len(measurements),
            "period": period_name
        }
    
    def _find_best_times(self, client_id: str) -> Dict[str, Any]:
        """Find best times for downloads"""
        measurements = self.db.query(Measurement).filter(
            Measurement.client_id == client_id
        ).order_by(Measurement.timestamp.desc()).limit(500).all()
        
        if not measurements:
            return {"answer": "Not enough data to determine best times"}
        
        hourly_speeds = {}
        for m in measurements:
            if m.download_speed:
                hour = m.timestamp.hour
                if hour not in hourly_speeds:
                    hourly_speeds[hour] = []
                hourly_speeds[hour].append(m.download_speed)
        
        hourly_avgs = {h: statistics.mean(speeds) for h, speeds in hourly_speeds.items()}
        best_hours = sorted(hourly_avgs.items(), key=lambda x: x[1], reverse=True)[:3]
        
        best_times_str = ", ".join([f"{h:02d}:00-{(h+1)%24:02d}:00" for h, _ in best_hours])
        
        return {
            "answer": f"Best times to download are: {best_times_str}",
            "best_hours": [{"hour": h, "avg_speed_mbps": round(s, 2)} for h, s in best_hours]
        }
    
    def _get_averages(self, client_id: str) -> Dict[str, Any]:
        """Get overall averages"""
        measurements = self.db.query(Measurement).filter(
            Measurement.client_id == client_id
        ).order_by(Measurement.timestamp.desc()).limit(200).all()
        
        if not measurements:
            return {"answer": "No data available"}
        
        speeds = [m.download_speed for m in measurements if m.download_speed]
        uploads = [m.upload_speed for m in measurements if m.upload_speed]
        pings = [m.ping for m in measurements if m.ping]
        
        return {
            "answer": f"Your typical speeds: {statistics.mean(speeds):.1f} Mbps download, {statistics.mean(uploads):.1f} Mbps upload, {statistics.mean(pings):.1f}ms ping",
            "avg_download_mbps": round(statistics.mean(speeds), 2) if speeds else 0,
            "avg_upload_mbps": round(statistics.mean(uploads), 2) if uploads else 0,
            "avg_ping_ms": round(statistics.mean(pings), 2) if pings else 0
        }
