"""
ML-based predictions using scikit-learn LinearRegression and statistical models.
All predictions are based on historical data patterns, with day-of-week weighting,
confidence scoring, and human-readable natural-language messages.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from collections import defaultdict
import statistics

import numpy as np

try:
    from sklearn.linear_model import LinearRegression
    SKLEARN_AVAILABLE = True
except ImportError:  # pragma: no cover
    SKLEARN_AVAILABLE = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Monday=0 … Sunday=6; 5 and 6 are weekend
_WEEKEND_DAYS = {5, 6}

# Hours that are historically "prime-time" for residential congestion
_EVENING_PEAK_HOURS = range(19, 23)   # 7 PM – 10 PM
_MORNING_PEAK_HOURS = range(7, 10)    # 7 AM –  9 AM
_NIGHT_OFF_HOURS    = range(0, 6)     # midnight – 5 AM  (typically fast)

# Minimum samples required for various predictions
_MIN_NEXT_HOUR  = 12   # reduced from 24 so the feature is useful sooner
_MIN_OUTAGE     = 24   # reduced from 48
_MIN_DOWNLOAD   = 12
_MIN_CONGESTION = 24   # reduced from 48


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_weekend(dt: datetime) -> bool:
    return dt.weekday() in _WEEKEND_DAYS


def _day_weight(dt: datetime) -> float:
    """Return a multiplier that de-emphasises weekend data on weekdays and vice-versa."""
    if _is_weekend(dt):
        return 1.3   # weekends tend to be slower – slight upward adjustment
    return 1.0


def _hour_label(hour: int) -> str:
    """Format an integer hour as a human-readable 12-hour clock string."""
    if hour == 0:
        return "12 AM"
    elif hour < 12:
        return f"{hour} AM"
    elif hour == 12:
        return "12 PM"
    else:
        return f"{hour - 12} PM"


def _speed_label(speed_mbps: float) -> str:
    if speed_mbps >= 100:
        return "very fast"
    elif speed_mbps >= 50:
        return "fast"
    elif speed_mbps >= 20:
        return "moderate"
    elif speed_mbps >= 5:
        return "slow"
    else:
        return "very slow"


def _congestion_description(score: float, hour: int) -> str:
    """Return a natural-language congestion description."""
    h_label = _hour_label(hour)
    if score >= 50:
        return f"Heavy congestion expected around {h_label} — network may feel sluggish"
    elif score >= 30:
        return f"Moderate congestion around {h_label} — expect some slowdowns"
    elif score >= 15:
        return f"Light congestion possible around {h_label}"
    else:
        return f"Network should be clear around {h_label}"


def _fit_linear_trend(speeds: List[float]) -> Tuple[float, float]:
    """
    Fit a sklearn LinearRegression on a speed series and return
    (slope_per_sample, r_squared).  Falls back to a manual slope if sklearn
    is not available.
    """
    n = len(speeds)
    if n < 3:
        return 0.0, 0.0

    X = np.array(range(n)).reshape(-1, 1)
    y = np.array(speeds)

    if SKLEARN_AVAILABLE:
        model = LinearRegression()
        model.fit(X, y)
        y_pred = model.predict(X)
        ss_res = float(np.sum((y - y_pred) ** 2))
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
        return float(model.coef_[0]), max(0.0, r2)
    else:
        # Manual fallback
        x_mean = (n - 1) / 2
        y_mean = float(np.mean(y))
        num = sum((i - x_mean) * (speeds[i] - y_mean) for i in range(n))
        den = sum((i - x_mean) ** 2 for i in range(n))
        slope = num / den if den else 0.0
        return slope, 0.0


def _weighted_mean(values: List[float], weights: List[float]) -> float:
    total_w = sum(weights)
    if total_w == 0:
        return statistics.mean(values)
    return sum(v * w for v, w in zip(values, weights)) / total_w


# ---------------------------------------------------------------------------
# Main predictor class
# ---------------------------------------------------------------------------

class NetworkPredictor:
    """Predicts network performance based on historical patterns using
    scikit-learn LinearRegression for trend analysis and day-of-week weighting."""

    # ------------------------------------------------------------------
    # 1. predict_next_hour_speed
    # ------------------------------------------------------------------

    @staticmethod
    def predict_next_hour_speed(measurements: List) -> Dict:
        """
        Predicts download speed, upload speed, and ping for the next hour.

        Strategy:
        - sklearn LinearRegression on the 12 most recent readings gives a
          short-term trend (slope) and an R² that feeds into confidence.
        - Historical averages for the same hour-of-day are blended in,
          weighted by whether today matches the weekday/weekend profile.
        - Confidence is penalised for high variance and boosted by
          sufficient sample size and a good R².

        Returns a dict with keys:
            predicted_download, predicted_upload, predicted_ping,
            confidence, method, message, prediction_time
        """
        if len(measurements) < _MIN_NEXT_HOUR:
            needed = _MIN_NEXT_HOUR - len(measurements)
            return {
                "predicted_download": None,
                "predicted_upload":   None,
                "predicted_ping":     None,
                "confidence":         0,
                "method":             "insufficient_data",
                "message": (
                    f"Not enough data yet — need {needed} more measurement(s) "
                    f"(have {len(measurements)}, need {_MIN_NEXT_HOUR})."
                ),
                "prediction_time": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
            }

        now          = datetime.utcnow()
        next_hour_dt = now + timedelta(hours=1)
        target_hour  = next_hour_dt.hour
        is_next_wknd = _is_weekend(next_hour_dt)

        # ---- trend via LinearRegression on last 12 samples ----------------
        recent_window = measurements[-12:]
        recent_dl  = [m.download_speed for m in recent_window]
        recent_ul  = [m.upload_speed   for m in recent_window]
        recent_pings = [m.ping          for m in recent_window if m.ping is not None]

        dl_slope, dl_r2 = _fit_linear_trend(recent_dl)
        ul_slope, _     = _fit_linear_trend(recent_ul)
        ping_slope, _   = _fit_linear_trend(recent_pings) if len(recent_pings) >= 3 else (0.0, 0.0)

        trend_dl   = recent_dl[-1]  + dl_slope   # one step ahead
        trend_ul   = recent_ul[-1]  + ul_slope
        trend_ping = (recent_pings[-1] + ping_slope) if recent_pings else None

        # ---- same-hour historical average (day-type weighted) ---------------
        same_hour_dl   = []
        same_hour_ul   = []
        same_hour_ping = []
        wknd_match_weights = []

        for m in measurements:
            if m.timestamp.hour == target_hour:
                m_is_wknd = _is_weekend(m.timestamp)
                # Higher weight when day-type matches the prediction target
                w = 2.0 if (m_is_wknd == is_next_wknd) else 0.7
                same_hour_dl.append(m.download_speed)
                same_hour_ul.append(m.upload_speed)
                if m.ping is not None:
                    same_hour_ping.append(m.ping)
                wknd_match_weights.append(w)

        if same_hour_dl:
            hist_dl   = _weighted_mean(same_hour_dl,   wknd_match_weights)
            hist_ul   = _weighted_mean(same_hour_ul,   wknd_match_weights)
            hist_ping = (
                _weighted_mean(same_hour_ping, wknd_match_weights[:len(same_hour_ping)])
                if same_hour_ping else None
            )
            # Blend: 60 % historical pattern, 40 % recent linear trend
            predicted_dl   = hist_dl   * 0.60 + trend_dl   * 0.40
            predicted_ul   = hist_ul   * 0.60 + trend_ul   * 0.40
            predicted_ping = (
                (hist_ping * 0.60 + trend_ping * 0.40) if (hist_ping and trend_ping) else
                hist_ping or trend_ping
            )
            method = "lr_trend_plus_hourly_history"
        else:
            # No same-hour samples yet — rely purely on trend
            predicted_dl   = trend_dl
            predicted_ul   = trend_ul
            predicted_ping = trend_ping
            method = "lr_trend_only"

        # Clamp to sane minimums
        predicted_dl   = max(0.1, predicted_dl)
        predicted_ul   = max(0.1, predicted_ul)
        if predicted_ping is not None:
            predicted_ping = max(1.0, predicted_ping)

        # ---- confidence calculation ----------------------------------------
        # Base: 40 pts; +5 per same-hour sample (up to +25); +10 for good R²
        # -variance penalty; ±5 day-type match bonus; ±trend direction bonus
        base_conf = 40
        sample_bonus   = min(25, len(same_hour_dl) * 5)
        r2_bonus       = round(dl_r2 * 10)          # 0 – 10
        day_bonus      = 5 if same_hour_dl else 0

        if len(recent_dl) >= 3:
            try:
                cv = statistics.stdev(recent_dl) / statistics.mean(recent_dl)
                variance_penalty = min(20, round(cv * 30))
            except statistics.StatisticsError:
                variance_penalty = 0
        else:
            variance_penalty = 0

        # Penalise if trend suggests a big drop
        drop_penalty = 10 if dl_slope < -5 else 0

        confidence = max(5, min(95,
            base_conf + sample_bonus + r2_bonus + day_bonus
            - variance_penalty - drop_penalty
        ))

        # ---- human-readable message ----------------------------------------
        direction_word = "stable"
        if dl_slope > 2:
            direction_word = "improving"
        elif dl_slope < -2:
            direction_word = "declining"

        hour_label = _hour_label(target_hour)
        speed_lbl  = _speed_label(predicted_dl)
        day_type   = "weekend" if is_next_wknd else "weekday"

        if confidence >= 70:
            confidence_phrase = f"{confidence}% confidence"
        elif confidence >= 45:
            confidence_phrase = f"moderate confidence ({confidence}%)"
        else:
            confidence_phrase = f"low confidence ({confidence}%) — limited historical data"

        message = (
            f"At {hour_label} the connection is expected to be {speed_lbl} "
            f"(~{predicted_dl:.1f} Mbps download). "
            f"Speed trend is {direction_word}. "
            f"{confidence_phrase}. "
            f"Prediction uses {day_type} patterns."
        )

        return {
            "predicted_download": round(predicted_dl,   2),
            "predicted_upload":   round(predicted_ul,   2),
            "predicted_ping":     round(predicted_ping, 1) if predicted_ping else None,
            "confidence":         confidence,
            "method":             method,
            "message":            message,
            "sklearn_available":  SKLEARN_AVAILABLE,
            "trend_slope_mbps_per_sample": round(dl_slope, 3),
            "r_squared":          round(dl_r2, 3),
            "prediction_time":    next_hour_dt.isoformat(),
        }

    # ------------------------------------------------------------------
    # 2. predict_outage_probability
    # ------------------------------------------------------------------

    @staticmethod
    def predict_outage_probability(measurements: List) -> Dict:
        """
        Calculates the probability of a network outage in the next hour.

        Factors considered:
        - Historical outage rate at this hour (same day-type weighted)
        - Recent degradation trend (LinearRegression slope)
        - Number of outages in the last 6 hours
        - Current speed vs. historical median
        - Day-of-week pattern (weekends can behave differently)

        Returns a dict including a human-readable message and risk label.
        """
        if len(measurements) < _MIN_OUTAGE:
            needed = _MIN_OUTAGE - len(measurements)
            return {
                "probability":   0.0,
                "risk_level":    "unknown",
                "factors":       [
                    f"Insufficient historical data — need {needed} more measurement(s) "
                    f"(have {len(measurements)}, need {_MIN_OUTAGE})."
                ],
                "message": "Not enough data to assess outage risk reliably.",
                "prediction_for": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
            }

        now          = datetime.utcnow()
        current_hour = now.hour
        is_wknd      = _is_weekend(now)

        # ---- base probability from same-hour history (day-type weighted) ----
        same_hour_total   = 0
        same_hour_outages = 0

        for m in measurements:
            if m.timestamp.hour == current_hour:
                m_is_wknd = _is_weekend(m.timestamp)
                w = 2 if (m_is_wknd == is_wknd) else 1
                same_hour_total   += w
                same_hour_outages += w if m.is_outage else 0

        base_probability = (
            (same_hour_outages / same_hour_total * 100)
            if same_hour_total > 0 else 0.0
        )

        # ---- recent-window analysis (last 6 readings) -----------------------
        recent6  = measurements[-6:]
        recent_outages     = sum(1 for m in recent6 if m.is_outage)
        recent_dl          = [m.download_speed for m in recent6]
        dl_slope, _        = _fit_linear_trend(recent_dl)
        recent_degradation = sum(
            1 for i in range(1, len(recent6))
            if recent6[i].download_speed < recent6[i - 1].download_speed * 0.80
        )

        # ---- current speed vs. historical median ----------------------------
        all_dl    = [m.download_speed for m in measurements]
        hist_med  = statistics.median(all_dl)
        current_speed = measurements[-1].download_speed if measurements else None
        speed_ratio   = (current_speed / hist_med) if (hist_med and current_speed) else 1.0

        # ---- combine factors into final probability -------------------------
        probability = base_probability

        if recent_outages >= 3:
            probability = min(95, probability + 35)
        elif recent_outages >= 1:
            probability = min(90, probability + 20)

        if recent_degradation >= 4:
            probability = min(90, probability + 20)
        elif recent_degradation >= 2:
            probability = min(85, probability + 10)

        if dl_slope < -5:
            probability = min(85, probability + 15)

        if speed_ratio < 0.4:
            probability = min(95, probability + 25)
        elif speed_ratio < 0.7:
            probability = min(90, probability + 10)

        # Weekend uplift: outages are slightly more common on weekends
        if is_wknd:
            probability = min(95, probability * 1.05)

        probability = round(probability, 1)

        # ---- risk level -----------------------------------------------------
        if probability >= 70:
            risk_level = "high"
        elif probability >= 40:
            risk_level = "medium"
        elif probability >= 15:
            risk_level = "low"
        else:
            risk_level = "minimal"

        # ---- factors list ---------------------------------------------------
        factors = []
        if same_hour_outages > 0:
            factors.append(
                f"{same_hour_outages} historical outage(s) recorded at {_hour_label(current_hour)}"
            )
        if recent_outages > 0:
            factors.append(f"{recent_outages} outage(s) detected in the last 6 readings")
        if recent_degradation > 0:
            factors.append(
                f"Speed dropped >20% in {recent_degradation} of the last 5 intervals"
            )
        if dl_slope < -5:
            factors.append(
                f"Downward speed trend detected ({dl_slope:.1f} Mbps/reading)"
            )
        if speed_ratio < 0.7 and current_speed is not None:
            factors.append(
                f"Current speed ({current_speed:.1f} Mbps) is "
                f"{round((1 - speed_ratio) * 100)}% below historical median"
            )
        if not factors:
            factors.append("No significant risk factors detected")

        # ---- human-readable message -----------------------------------------
        hour_label = _hour_label((now + timedelta(hours=1)).hour)
        if probability >= 70:
            message = (
                f"High outage risk! {probability:.0f}% chance of an outage by {hour_label}. "
                f"Consider deferring critical tasks."
            )
        elif probability >= 40:
            message = (
                f"Moderate outage risk — {probability:.0f}% probability of disruption "
                f"by {hour_label}."
            )
        elif probability >= 15:
            message = (
                f"Low but non-zero outage risk ({probability:.0f}%) approaching "
                f"{hour_label}."
            )
        else:
            message = (
                f"Network looks stable. Only {probability:.0f}% outage probability "
                f"for the next hour."
            )

        return {
            "probability":    probability,
            "risk_level":     risk_level,
            "factors":        factors,
            "message":        message,
            "prediction_for": (now + timedelta(hours=1)).isoformat(),
        }

    # ------------------------------------------------------------------
    # 3. find_best_download_time
    # ------------------------------------------------------------------

    @staticmethod
    def find_best_download_time(measurements: List, hours_ahead: int = 24) -> Dict:
        """
        Finds the best time to download large files over the next N hours.

        Uses day-of-week weighted hourly averages so that, e.g., a Sunday
        recommendation does not blindly use Monday's speed history.
        Returns top-3 candidates plus a natural-language reason.
        """
        if len(measurements) < _MIN_DOWNLOAD:
            needed = _MIN_DOWNLOAD - len(measurements)
            return {
                "best_time":     None,
                "expected_speed": None,
                "reason": (
                    f"Insufficient data — need {needed} more measurement(s) "
                    f"(have {len(measurements)}, need {_MIN_DOWNLOAD})."
                ),
                "top_3_times": [],
            }

        now = datetime.utcnow()

        # ---- build day-type-aware hourly speed averages --------------------
        # Separate weekend vs. weekday buckets per hour
        hourly_wkday: Dict[int, List[float]] = defaultdict(list)
        hourly_wknd:  Dict[int, List[float]] = defaultdict(list)

        for m in measurements:
            if _is_weekend(m.timestamp):
                hourly_wknd[m.timestamp.hour].append(m.download_speed)
            else:
                hourly_wkday[m.timestamp.hour].append(m.download_speed)

        def _best_avg_for_hour(hour: int, target_is_wknd: bool) -> Optional[float]:
            primary   = hourly_wknd[hour]  if target_is_wknd else hourly_wkday[hour]
            secondary = hourly_wkday[hour] if target_is_wknd else hourly_wknd[hour]
            if primary:
                return statistics.mean(primary)
            elif secondary:
                # Fallback with a slight confidence discount — caller never sees this detail
                return statistics.mean(secondary) * 0.95
            return None

        # ---- score each candidate hour -------------------------------------
        predictions = []
        for offset in range(hours_ahead):
            future_time = now + timedelta(hours=offset)
            hour        = future_time.hour
            is_wknd     = _is_weekend(future_time)
            avg         = _best_avg_for_hour(hour, is_wknd)

            if avg is None:
                continue

            # Slight bonus for night-time off-peak hours
            bonus = 1.05 if hour in _NIGHT_OFF_HOURS else 1.0
            # Slight penalty for prime-time
            penalty = 0.90 if hour in _EVENING_PEAK_HOURS else 1.0

            scored_speed = avg * bonus * penalty
            predictions.append({
                "time":           future_time.isoformat(),
                "hour":           hour,
                "expected_speed": avg,
                "scored_speed":   scored_speed,
                "is_weekend":     is_wknd,
            })

        if not predictions:
            return {
                "best_time":      None,
                "expected_speed": None,
                "reason":         "No historical data available for upcoming hours.",
                "top_3_times":    [],
            }

        predictions.sort(key=lambda x: x["scored_speed"], reverse=True)
        best = predictions[0]

        day_type  = "weekend" if best["is_weekend"] else "weekday"
        hour_lbl  = _hour_label(best["hour"])
        speed_lbl = _speed_label(best["expected_speed"])

        # Contextual reason
        if best["hour"] in _NIGHT_OFF_HOURS:
            context = "Off-peak night hours tend to have the least network congestion."
        elif best["hour"] in _EVENING_PEAK_HOURS:
            context = "This is prime time — speeds may vary more than usual."
        elif best["hour"] in _MORNING_PEAK_HOURS:
            context = "Morning commute hours — moderate congestion possible."
        else:
            context = "Historically a quiet period for this network."

        reason = (
            f"Best window is around {hour_lbl} ({day_type}) — "
            f"expected {best['expected_speed']:.1f} Mbps ({speed_lbl}). "
            f"{context}"
        )

        return {
            "best_time":      best["time"],
            "best_hour":      best["hour"],
            "expected_speed": round(best["expected_speed"], 2),
            "reason":         reason,
            "top_3_times": [
                {
                    "time":  p["time"],
                    "hour":  p["hour"],
                    "speed": round(p["expected_speed"], 2),
                    "label": _hour_label(p["hour"]),
                }
                for p in predictions[:3]
            ],
        }

    # ------------------------------------------------------------------
    # 4. predict_congestion_24h
    # ------------------------------------------------------------------

    @staticmethod
    def predict_congestion_24h(measurements: List) -> Dict:
        """
        Predicts congestion levels for each of the next 24 hours.

        Congestion score (0–100) represents how much slower than baseline
        the hour is expected to be, informed by day-of-week weighting.
        Each entry includes a natural-language description.

        Also appends a top-level `notable_periods` list calling out
        evening/morning peaks similar to:
        "Evening congestion expected (7-10 PM) - historically 35% slower"
        """
        if len(measurements) < _MIN_CONGESTION:
            needed = _MIN_CONGESTION - len(measurements)
            return {
                "predictions":     [],
                "notable_periods": [],
                "message": (
                    f"Need at least {_MIN_CONGESTION} measurements for congestion forecast "
                    f"(have {len(measurements)}, need {needed} more)."
                ),
            }

        now      = datetime.utcnow()
        all_dl   = [m.download_speed for m in measurements]
        baseline = statistics.mean(all_dl)

        # ---- build day-type-aware hourly averages --------------------------
        hourly_wkday: Dict[int, List[float]] = defaultdict(list)
        hourly_wknd:  Dict[int, List[float]] = defaultdict(list)

        for m in measurements:
            if _is_weekend(m.timestamp):
                hourly_wknd[m.timestamp.hour].append(m.download_speed)
            else:
                hourly_wkday[m.timestamp.hour].append(m.download_speed)

        def _avg_for(hour: int, is_wknd: bool) -> Optional[float]:
            pool = hourly_wknd[hour] if is_wknd else hourly_wkday[hour]
            fallback = hourly_wkday[hour] if is_wknd else hourly_wknd[hour]
            all_pool = pool or fallback
            return statistics.mean(all_pool) if all_pool else None

        # ---- per-hour predictions ------------------------------------------
        predictions = []
        for offset in range(24):
            future_time = now + timedelta(hours=offset)
            hour        = future_time.hour
            is_wknd     = _is_weekend(future_time)
            avg_speed   = _avg_for(hour, is_wknd)

            if avg_speed is None:
                predictions.append({
                    "time":             future_time.isoformat(),
                    "hour":             hour,
                    "hour_label":       _hour_label(hour),
                    "congestion_score": None,
                    "level":            "unknown",
                    "expected_speed":   None,
                    "description":      f"No data available for {_hour_label(hour)}",
                })
                continue

            congestion = max(0.0, min(100.0,
                ((baseline - avg_speed) / baseline) * 100
            ))

            if congestion >= 40:
                level = "high"
            elif congestion >= 20:
                level = "medium"
            elif congestion >= 8:
                level = "low"
            else:
                level = "clear"

            predictions.append({
                "time":             future_time.isoformat(),
                "hour":             hour,
                "hour_label":       _hour_label(hour),
                "congestion_score": round(congestion, 1),
                "level":            level,
                "expected_speed":   round(avg_speed, 2),
                "description":      _congestion_description(congestion, hour),
                "pct_slower_than_baseline": round(congestion, 1),
            })

        # ---- notable congestion periods ------------------------------------
        notable_periods = []

        def _check_block(label: str, hour_range, predictions_list: List[Dict]) -> None:
            block = [p for p in predictions_list
                     if p.get("congestion_score") is not None
                     and p["hour"] in hour_range]
            if not block:
                return
            avg_cong = statistics.mean(p["congestion_score"] for p in block)
            if avg_cong >= 15:
                start_lbl = _hour_label(min(p["hour"] for p in block))
                end_lbl   = _hour_label(max(p["hour"] for p in block) + 1)
                notable_periods.append({
                    "period":      label,
                    "hours":       f"{start_lbl} – {end_lbl}",
                    "avg_congestion": round(avg_cong, 1),
                    "description": (
                        f"{label} ({start_lbl}–{end_lbl}) — "
                        f"historically {avg_cong:.0f}% slower than your baseline speed"
                    ),
                })

        _check_block("Evening congestion",  _EVENING_PEAK_HOURS, predictions)
        _check_block("Morning rush",        _MORNING_PEAK_HOURS, predictions)
        _check_block("Late-night off-peak", _NIGHT_OFF_HOURS,    predictions)

        # ---- overall 24 h message ------------------------------------------
        known = [p for p in predictions if p.get("congestion_score") is not None]
        if known:
            worst = max(known, key=lambda p: p["congestion_score"])
            best  = min(known, key=lambda p: p["congestion_score"])
            summary_msg = (
                f"Worst congestion expected around {worst['hour_label']} "
                f"({worst['congestion_score']:.0f}% below baseline). "
                f"Clearest window is around {best['hour_label']} "
                f"({best['expected_speed']} Mbps expected)."
            )
        else:
            summary_msg = "No congestion data available for the next 24 hours."

        return {
            "predictions":      predictions,
            "notable_periods":  notable_periods,
            "baseline_speed":   round(baseline, 2),
            "message":          summary_msg,
            "generated_at":     now.isoformat(),
        }

    # ------------------------------------------------------------------
    # 5. get_prediction_summary  (new method)
    # ------------------------------------------------------------------

    @staticmethod
    def get_prediction_summary(measurements: List) -> Dict:
        """
        Returns a single human-friendly summary that aggregates all four
        prediction types into a concise, actionable overview.

        This method is safe to call regardless of data volume — it handles
        edge cases gracefully and adjusts its language accordingly.
        """
        now          = datetime.utcnow()
        data_count   = len(measurements)
        is_wknd      = _is_weekend(now)
        day_type_str = "weekend" if is_wknd else "weekday"

        # Run all four predictions
        next_hour   = NetworkPredictor.predict_next_hour_speed(measurements)
        outage      = NetworkPredictor.predict_outage_probability(measurements)
        best_dl     = NetworkPredictor.find_best_download_time(measurements)
        congestion  = NetworkPredictor.predict_congestion_24h(measurements)

        # ---- headline sentence --------------------------------------------
        if data_count < _MIN_NEXT_HOUR:
            headline = (
                f"Only {data_count} measurement(s) recorded so far. "
                f"Predictions will become available after {_MIN_NEXT_HOUR} readings."
            )
            data_quality = "insufficient"
        elif data_count < 48:
            headline = (
                f"Early predictions based on {data_count} measurements "
                f"(accuracy improves with more data)."
            )
            data_quality = "limited"
        else:
            headline = (
                f"Predictions based on {data_count} historical measurements — "
                f"confidence is high."
            )
            data_quality = "good"

        # ---- next-hour blurb -----------------------------------------------
        if next_hour.get("predicted_download"):
            spd   = next_hour["predicted_download"]
            conf  = next_hour["confidence"]
            ping_note = (
                f" Ping predicted ~{next_hour['predicted_ping']} ms."
                if next_hour.get("predicted_ping") else ""
            )
            next_hour_blurb = (
                f"Next hour: ~{spd} Mbps download expected "
                f"({conf}% confidence).{ping_note}"
            )
        else:
            next_hour_blurb = next_hour.get("message", "Next-hour prediction unavailable.")

        # ---- outage risk blurb --------------------------------------------
        risk_blurb = outage.get("message", "Outage risk unknown.")

        # ---- best download window blurb -----------------------------------
        if best_dl.get("best_time"):
            best_lbl    = _hour_label(best_dl["best_hour"])
            best_speed  = best_dl["expected_speed"]
            dl_blurb    = (
                f"Best download window in the next 24 h: {best_lbl} "
                f"(~{best_speed} Mbps expected)."
            )
        else:
            dl_blurb = best_dl.get("reason", "Best download time unavailable.")

        # ---- notable congestion blurbs ------------------------------------
        notable = congestion.get("notable_periods", [])
        if notable:
            congestion_blurbs = [p["description"] for p in notable]
        elif congestion.get("message"):
            congestion_blurbs = [congestion["message"]]
        else:
            congestion_blurbs = ["No congestion data available."]

        # ---- assemble ------------------------------------------------------
        sections = {
            "headline":            headline,
            "data_quality":        data_quality,
            "measurement_count":   data_count,
            "day_type":            day_type_str,
            "generated_at":        now.isoformat(),
            "next_hour_summary":   next_hour_blurb,
            "outage_risk_summary": risk_blurb,
            "best_download_summary": dl_blurb,
            "congestion_summary":  congestion_blurbs,
            "full_predictions": {
                "next_hour":  next_hour,
                "outage":     outage,
                "best_download_time": best_dl,
                "congestion_24h":     congestion,
            },
        }

        return sections
