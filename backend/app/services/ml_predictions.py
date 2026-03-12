"""
ML-based predictions using simple statistical models (no external ML libraries needed).
All predictions are based on historical data patterns.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict
import statistics

logger = logging.getLogger(__name__)


class NetworkPredictor:
    """Predicts network performance based on historical patterns."""
    
    @staticmethod
    def predict_next_hour_speed(measurements: List) -> Dict:
        """
        Predicts speed for the next hour based on:
        1. Same hour yesterday
        2. Same hour last week
        3. Recent trend
        """
        if len(measurements) < 24:
            return {
                "predicted_download": None,
                "predicted_upload": None,
                "confidence": 0,
                "method": "insufficient_data",
            }
        
        now = datetime.utcnow()
        current_hour = now.hour
        
        # Group by hour
        hourly_data = defaultdict(list)
        for m in measurements:
            hourly_data[m.timestamp.hour].append(m.download_speed)
        
        # Get same hour from past days
        same_hour_speeds = hourly_data.get(current_hour, [])
        
        if not same_hour_speeds:
            # Fallback to overall average
            all_speeds = [m.download_speed for m in measurements]
            predicted = statistics.mean(all_speeds)
            confidence = 30
        else:
            # Weighted average: recent data has more weight
            recent_24h = [m.download_speed for m in measurements[-24:]]
            same_hour_avg = statistics.mean(same_hour_speeds)
            recent_avg = statistics.mean(recent_24h)
            
            # 70% same hour pattern, 30% recent trend
            predicted = (same_hour_avg * 0.7) + (recent_avg * 0.3)
            confidence = min(95, 50 + len(same_hour_speeds) * 5)
        
        # Calculate upload prediction (proportional to download)
        upload_ratio = statistics.mean([m.upload_speed / max(m.download_speed, 0.1) 
                                       for m in measurements[-50:]])
        predicted_upload = predicted * upload_ratio
        
        return {
            "predicted_download": round(predicted, 2),
            "predicted_upload": round(predicted_upload, 2),
            "confidence": confidence,
            "method": "hourly_pattern",
            "prediction_time": (now + timedelta(hours=1)).isoformat(),
        }
    
    @staticmethod
    def predict_outage_probability(measurements: List) -> Dict:
        """
        Calculates probability of outage in next hour based on:
        1. Historical outage patterns at this hour
        2. Recent degradation trend
        3. Day of week patterns
        """
        if len(measurements) < 48:
            return {
                "probability": 0,
                "risk_level": "unknown",
                "factors": ["Insufficient historical data"],
            }
        
        now = datetime.utcnow()
        current_hour = now.hour
        current_dow = now.weekday()
        
        # Count outages at this hour historically
        same_hour_measurements = [m for m in measurements if m.timestamp.hour == current_hour]
        same_hour_outages = sum(1 for m in same_hour_measurements if m.is_outage)
        
        if not same_hour_measurements:
            base_probability = 0
        else:
            base_probability = (same_hour_outages / len(same_hour_measurements)) * 100
        
        # Check recent trend (last 6 hours)
        recent = measurements[-6:]
        recent_outages = sum(1 for m in recent if m.is_outage)
        recent_degradation = sum(1 for i in range(1, len(recent)) 
                                if recent[i].download_speed < recent[i-1].download_speed * 0.8)
        
        # Adjust probability based on recent trend
        if recent_outages > 2:
            probability = min(95, base_probability + 30)
        elif recent_degradation > 3:
            probability = min(90, base_probability + 20)
        else:
            probability = base_probability
        
        # Risk level
        if probability >= 70:
            risk_level = "high"
        elif probability >= 40:
            risk_level = "medium"
        elif probability >= 15:
            risk_level = "low"
        else:
            risk_level = "minimal"
        
        factors = []
        if same_hour_outages > 0:
            factors.append(f"{same_hour_outages} outages at this hour historically")
        if recent_outages > 0:
            factors.append(f"{recent_outages} outages in last 6 hours")
        if recent_degradation > 0:
            factors.append(f"Speed declining in recent hours")
        
        return {
            "probability": round(probability, 1),
            "risk_level": risk_level,
            "factors": factors if factors else ["No risk factors detected"],
            "prediction_for": (now + timedelta(hours=1)).isoformat(),
        }
    
    @staticmethod
    def find_best_download_time(measurements: List, hours_ahead: int = 24) -> Dict:
        """
        Finds the best time to download large files in the next N hours.
        Based on historical speed patterns.
        """
        if len(measurements) < 24:
            return {
                "best_time": None,
                "expected_speed": None,
                "reason": "Insufficient data",
            }
        
        now = datetime.utcnow()
        
        # Group by hour and calculate average speeds
        hourly_speeds = defaultdict(list)
        for m in measurements:
            hourly_speeds[m.timestamp.hour].append(m.download_speed)
        
        hourly_avg = {h: statistics.mean(speeds) for h, speeds in hourly_speeds.items()}
        
        # Find best hours in the next 24 hours
        predictions = []
        for offset in range(hours_ahead):
            future_time = now + timedelta(hours=offset)
            hour = future_time.hour
            
            if hour in hourly_avg:
                predictions.append({
                    "time": future_time.isoformat(),
                    "hour": hour,
                    "expected_speed": hourly_avg[hour],
                })
        
        if not predictions:
            return {
                "best_time": None,
                "expected_speed": None,
                "reason": "No data for upcoming hours",
            }
        
        # Sort by speed (descending)
        predictions.sort(key=lambda x: x["expected_speed"], reverse=True)
        best = predictions[0]
        
        return {
            "best_time": best["time"],
            "best_hour": best["hour"],
            "expected_speed": round(best["expected_speed"], 2),
            "reason": f"Historically fastest at {best['hour']:02d}:00",
            "top_3_times": [
                {
                    "time": p["time"],
                    "hour": p["hour"],
                    "speed": round(p["expected_speed"], 2),
                }
                for p in predictions[:3]
            ],
        }
    
    @staticmethod
    def predict_congestion_24h(measurements: List) -> Dict:
        """
        Predicts congestion levels for the next 24 hours.
        Returns hourly congestion scores (0-100, higher = more congested).
        """
        if len(measurements) < 48:
            return {
                "predictions": [],
                "message": "Need at least 48 hours of data",
            }
        
        # Calculate baseline (average speed)
        baseline = statistics.mean([m.download_speed for m in measurements])
        
        # Group by hour
        hourly_speeds = defaultdict(list)
        for m in measurements:
            hourly_speeds[m.timestamp.hour].append(m.download_speed)
        
        now = datetime.utcnow()
        predictions = []
        
        for offset in range(24):
            future_time = now + timedelta(hours=offset)
            hour = future_time.hour
            
            if hour in hourly_speeds:
                avg_speed = statistics.mean(hourly_speeds[hour])
                # Congestion score: how much slower than baseline
                congestion = max(0, min(100, ((baseline - avg_speed) / baseline) * 100))
                
                if congestion >= 40:
                    level = "high"
                elif congestion >= 20:
                    level = "medium"
                else:
                    level = "low"
                
                predictions.append({
                    "time": future_time.isoformat(),
                    "hour": hour,
                    "congestion_score": round(congestion, 1),
                    "level": level,
                    "expected_speed": round(avg_speed, 2),
                })
            else:
                # No data for this hour
                predictions.append({
                    "time": future_time.isoformat(),
                    "hour": hour,
                    "congestion_score": None,
                    "level": "unknown",
                    "expected_speed": None,
                })
        
        return {
            "predictions": predictions,
            "baseline_speed": round(baseline, 2),
            "generated_at": now.isoformat(),
        }
