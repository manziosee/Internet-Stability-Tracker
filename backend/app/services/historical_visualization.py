"""Historical Data Visualization Service"""
import statistics
from typing import Dict, Any, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.measurement import SpeedMeasurement
from collections import defaultdict


class HistoricalVisualizationService:
    """Advanced historical visualizations: heatmap calendar, histograms, percentiles, correlations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_heatmap_calendar(self, client_id: str, days: int = 90) -> Dict[str, Any]:
        """GitHub-style contribution heatmap for speed performance"""
        cutoff = datetime.utcnow() - timedelta(days=days)
        measurements = self.db.query(SpeedMeasurement).filter(
            and_(
                SpeedMeasurement.client_id == client_id,
                SpeedMeasurement.timestamp >= cutoff
            )
        ).all()
        
        if not measurements:
            # Return an empty heatmap rather than an error so the UI can render
            heatmap = []
            current_date = cutoff.date()
            end_date = datetime.utcnow().date()
            while current_date <= end_date:
                heatmap.append({
                    "date": current_date.isoformat(),
                    "avg_speed_mbps": 0,
                    "intensity": 0,
                    "measurement_count": 0,
                    "weekday": current_date.strftime("%A")
                })
                current_date += timedelta(days=1)
            return {
                "heatmap": heatmap,
                "days": days,
                "total_measurements": 0,
                "date_range": {
                    "start": cutoff.date().isoformat(),
                    "end": datetime.utcnow().date().isoformat()
                }
            }

        daily_data = defaultdict(list)
        for m in measurements:
            date_key = m.timestamp.date().isoformat()
            if m.download_speed:
                daily_data[date_key].append(m.download_speed)
        
        heatmap = []
        current_date = cutoff.date()
        end_date = datetime.utcnow().date()
        
        all_speeds = [speed for speeds in daily_data.values() for speed in speeds]
        if all_speeds:
            max_speed = max(all_speeds)
            min_speed = min(all_speeds)
        else:
            max_speed = min_speed = 0
        
        while current_date <= end_date:
            date_key = current_date.isoformat()
            speeds = daily_data.get(date_key, [])
            
            if speeds:
                avg_speed = statistics.mean(speeds)
                intensity = self._calculate_intensity(avg_speed, min_speed, max_speed)
                count = len(speeds)
            else:
                avg_speed = 0
                intensity = 0
                count = 0
            
            heatmap.append({
                "date": date_key,
                "avg_speed_mbps": round(avg_speed, 2),
                "intensity": intensity,
                "measurement_count": count,
                "weekday": current_date.strftime("%A")
            })
            
            current_date += timedelta(days=1)
        
        return {
            "heatmap": heatmap,
            "days": days,
            "total_measurements": len(measurements),
            "date_range": {
                "start": cutoff.date().isoformat(),
                "end": end_date.isoformat()
            }
        }
    
    def _calculate_intensity(self, speed: float, min_speed: float, max_speed: float) -> int:
        """Calculate intensity level (0-4) for heatmap coloring"""
        if max_speed == min_speed:
            return 2
        
        normalized = (speed - min_speed) / (max_speed - min_speed)
        
        if normalized >= 0.8:
            return 4
        elif normalized >= 0.6:
            return 3
        elif normalized >= 0.4:
            return 2
        elif normalized >= 0.2:
            return 1
        else:
            return 0
    
    def get_speed_distribution(self, client_id: str, bins: int = 20) -> Dict[str, Any]:
        """Speed distribution histogram - how often you get X Mbps"""
        measurements = self.db.query(SpeedMeasurement).filter(
            SpeedMeasurement.client_id == client_id
        ).order_by(SpeedMeasurement.timestamp.desc()).limit(1000).all()
        
        if not measurements:
            return {
                "histogram": [],
                "total_measurements": 0,
                "min_speed_mbps": 0, "max_speed_mbps": 0,
                "avg_speed_mbps": 0, "median_speed_mbps": 0
            }

        speeds = [m.download_speed for m in measurements if m.download_speed]

        if not speeds:
            return {
                "histogram": [],
                "total_measurements": 0,
                "min_speed_mbps": 0, "max_speed_mbps": 0,
                "avg_speed_mbps": 0, "median_speed_mbps": 0
            }
        
        min_speed = min(speeds)
        max_speed = max(speeds)
        bin_width = (max_speed - min_speed) / bins if max_speed > min_speed else 1
        
        histogram = []
        for i in range(bins):
            bin_start = min_speed + (i * bin_width)
            bin_end = bin_start + bin_width
            
            count = len([s for s in speeds if bin_start <= s < bin_end])
            percentage = (count / len(speeds)) * 100
            
            histogram.append({
                "range_start_mbps": round(bin_start, 2),
                "range_end_mbps": round(bin_end, 2),
                "count": count,
                "percentage": round(percentage, 2)
            })
        
        return {
            "histogram": histogram,
            "total_measurements": len(speeds),
            "min_speed_mbps": round(min_speed, 2),
            "max_speed_mbps": round(max_speed, 2),
            "avg_speed_mbps": round(statistics.mean(speeds), 2),
            "median_speed_mbps": round(statistics.median(speeds), 2)
        }
    
    def get_percentile_charts(self, client_id: str) -> Dict[str, Any]:
        """Percentile analysis: P50, P95, P99 speeds"""
        measurements = self.db.query(SpeedMeasurement).filter(
            SpeedMeasurement.client_id == client_id
        ).order_by(SpeedMeasurement.timestamp.desc()).limit(1000).all()
        
        if not measurements:
            return {"error": "No data available"}
        
        download_speeds = sorted([m.download_speed for m in measurements if m.download_speed])
        upload_speeds = sorted([m.upload_speed for m in measurements if m.upload_speed])
        pings = sorted([m.ping for m in measurements if m.ping])
        
        def percentile(data: List[float], p: float) -> float:
            if not data:
                return 0
            k = (len(data) - 1) * (p / 100)
            f = int(k)
            c = f + 1 if f < len(data) - 1 else f
            return data[f] + (k - f) * (data[c] - data[f])
        
        percentiles = [1, 5, 10, 25, 50, 75, 90, 95, 99]
        
        download_percentiles = {
            f"p{p}": round(percentile(download_speeds, p), 2)
            for p in percentiles
        }
        
        upload_percentiles = {
            f"p{p}": round(percentile(upload_speeds, p), 2)
            for p in percentiles
        }
        
        ping_percentiles = {
            f"p{p}": round(percentile(pings, p), 2)
            for p in percentiles
        }
        
        return {
            "download_speed_mbps": download_percentiles,
            "upload_speed_mbps": upload_percentiles,
            "ping_ms": ping_percentiles,
            "interpretation": {
                "p50": "Median - typical performance",
                "p95": "95% of measurements are below this",
                "p99": "99% of measurements are below this (worst case)"
            },
            "total_measurements": len(measurements)
        }
    
    def get_correlation_analysis(self, client_id: str) -> Dict[str, Any]:
        """Correlation analysis: speed vs time of day, day of week"""
        measurements = self.db.query(SpeedMeasurement).filter(
            SpeedMeasurement.client_id == client_id
        ).order_by(SpeedMeasurement.timestamp.desc()).limit(2000).all()
        
        if not measurements:
            return {"error": "No data available"}
        
        hourly_speeds = defaultdict(list)
        weekday_speeds = defaultdict(list)
        
        for m in measurements:
            if m.download_speed:
                hour = m.timestamp.hour
                weekday = m.timestamp.strftime("%A")
                
                hourly_speeds[hour].append(m.download_speed)
                weekday_speeds[weekday].append(m.download_speed)
        
        hourly_analysis = [
            {
                "hour": hour,
                "avg_speed_mbps": round(statistics.mean(speeds), 2),
                "min_speed_mbps": round(min(speeds), 2),
                "max_speed_mbps": round(max(speeds), 2),
                "measurement_count": len(speeds)
            }
            for hour, speeds in sorted(hourly_speeds.items())
        ]
        
        weekday_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        weekday_analysis = [
            {
                "weekday": day,
                "avg_speed_mbps": round(statistics.mean(weekday_speeds[day]), 2),
                "min_speed_mbps": round(min(weekday_speeds[day]), 2),
                "max_speed_mbps": round(max(weekday_speeds[day]), 2),
                "measurement_count": len(weekday_speeds[day])
            }
            for day in weekday_order if day in weekday_speeds
        ]
        
        if hourly_analysis:
            best_hour = max(hourly_analysis, key=lambda x: x["avg_speed_mbps"])
            worst_hour = min(hourly_analysis, key=lambda x: x["avg_speed_mbps"])
        else:
            best_hour = worst_hour = None
        
        if weekday_analysis:
            best_day = max(weekday_analysis, key=lambda x: x["avg_speed_mbps"])
            worst_day = min(weekday_analysis, key=lambda x: x["avg_speed_mbps"])
        else:
            best_day = worst_day = None
        
        return {
            "hourly_correlation": hourly_analysis,
            "weekday_correlation": weekday_analysis,
            "insights": {
                "best_hour": best_hour,
                "worst_hour": worst_hour,
                "best_day": best_day,
                "worst_day": worst_day
            },
            "total_measurements": len(measurements)
        }
    
    def get_interactive_timeline(self, client_id: str, hours: int = 168) -> Dict[str, Any]:
        """Interactive timeline with zoom/pan support"""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        measurements = self.db.query(SpeedMeasurement).filter(
            and_(
                SpeedMeasurement.client_id == client_id,
                SpeedMeasurement.timestamp >= cutoff
            )
        ).order_by(SpeedMeasurement.timestamp.asc()).all()
        
        if not measurements:
            return {
                "timeline": [],
                "total_points": 0,
                "time_range_hours": hours,
                "statistics": {
                    "avg_speed_mbps": 0, "min_speed_mbps": 0,
                    "max_speed_mbps": 0, "outage_count": 0
                },
                "zoom_levels": [
                    {"label": "1 hour",  "hours": 1},
                    {"label": "6 hours", "hours": 6},
                    {"label": "24 hours","hours": 24},
                    {"label": "7 days",  "hours": 168},
                    {"label": "30 days", "hours": 720},
                ]
            }

        timeline = []
        for m in measurements:
            timeline.append({
                "timestamp": m.timestamp.isoformat(),
                "download_speed_mbps": m.download_speed,
                "upload_speed_mbps": m.upload_speed,
                "ping_ms": m.ping,
                "is_outage": m.is_outage,
                "isp": m.isp
            })
        
        speeds = [m.download_speed for m in measurements if m.download_speed]
        
        return {
            "timeline": timeline,
            "total_points": len(timeline),
            "time_range_hours": hours,
            "statistics": {
                "avg_speed_mbps": round(statistics.mean(speeds), 2) if speeds else 0,
                "min_speed_mbps": round(min(speeds), 2) if speeds else 0,
                "max_speed_mbps": round(max(speeds), 2) if speeds else 0,
                "outage_count": len([m for m in measurements if m.is_outage])
            },
            "zoom_levels": [
                {"label": "1 hour", "hours": 1},
                {"label": "6 hours", "hours": 6},
                {"label": "24 hours", "hours": 24},
                {"label": "7 days", "hours": 168},
                {"label": "30 days", "hours": 720}
            ]
        }
