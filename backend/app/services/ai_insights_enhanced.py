"""AI-Powered Insights Service - Enhanced"""
import statistics
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.measurement import Measurement


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
        """Answer natural language queries about network performance"""
        query_lower = query.lower()
        
        if "yesterday" in query_lower or "last 24" in query_lower:
            return self._analyze_period(client_id, hours=24, period_name="yesterday")
        elif "last week" in query_lower or "past week" in query_lower:
            return self._analyze_period(client_id, hours=168, period_name="last week")
        elif "slow" in query_lower or "bad" in query_lower:
            return self.analyze_root_cause(client_id, hours=48)
        elif "best time" in query_lower or "when to download" in query_lower:
            return self._find_best_times(client_id)
        elif "average" in query_lower or "typical" in query_lower:
            return self._get_averages(client_id)
        else:
            return {
                "answer": "I can help you understand your network performance. Try asking: 'Why was my speed bad yesterday?' or 'When is the best time to download?'",
                "suggestions": [
                    "Why is my speed slow?",
                    "What was my average speed last week?",
                    "When is the best time to download?",
                    "Show me yesterday's performance"
                ]
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
