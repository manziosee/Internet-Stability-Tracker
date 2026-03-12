import logging
import smtplib
import json
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

from .core.database import SessionLocal
from .services.speed_test import SpeedTestService
from .core.config import settings

logger = logging.getLogger(__name__)


# ─── Outage alert helpers ─────────────────────────────────────────────────────

_last_alert_state: dict = {"outage": False}  # simple in-memory dedup


def _send_webhook(payload: dict):
    """POST a JSON payload to the configured ALERT_WEBHOOK_URL (Discord/Slack/generic)."""
    if not settings.ALERT_WEBHOOK_URL:
        return
    try:
        import httpx
        httpx.post(settings.ALERT_WEBHOOK_URL, json=payload, timeout=10)
        logger.info("Webhook alert sent to %s", settings.ALERT_WEBHOOK_URL)
    except Exception as exc:
        logger.error("Webhook alert failed: %s", exc)


def _send_email(subject: str, body: str):
    """Send an alert email via SMTP if SMTP settings are configured."""
    if not all([settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASSWORD, settings.ALERT_EMAIL]):
        return
    try:
        msg = MIMEText(body, "plain")
        msg["Subject"] = subject
        msg["From"]    = settings.SMTP_FROM or settings.SMTP_USER
        msg["To"]      = settings.ALERT_EMAIL
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
        logger.info("Email alert sent to %s", settings.ALERT_EMAIL)
    except Exception as exc:
        logger.error("Email alert failed: %s", exc)


def _check_and_alert(result):
    """Fire outage-start and outage-recovered alerts when state transitions."""
    global _last_alert_state
    is_outage = result.is_outage

    if is_outage and not _last_alert_state["outage"]:
        # Outage started
        subject = "⚠️ Internet Outage Detected"
        body = (
            f"An outage has been detected at {datetime.utcnow().isoformat()}Z.\n"
            f"Download: {result.download_speed:.1f} Mbps  "
            f"Upload: {result.upload_speed:.1f} Mbps  "
            f"Ping: {result.ping:.0f} ms\n"
            f"ISP: {result.isp or 'unknown'}  Location: {result.location or 'unknown'}"
        )
        _send_email(subject, body)
        _send_webhook({
            "content": f"**⚠️ Outage Detected** — download {result.download_speed:.1f} Mbps "
                       f"(threshold: {settings.OUTAGE_THRESHOLD_MBPS} Mbps)\n"
                       f"ISP: {result.isp or 'unknown'} | {datetime.utcnow().isoformat()}Z",
            "username": "Internet Stability Tracker",
        })
        _last_alert_state["outage"] = True

    elif not is_outage and _last_alert_state["outage"]:
        # Connection recovered
        subject = "✅ Internet Connection Restored"
        body = (
            f"Your connection has recovered at {datetime.utcnow().isoformat()}Z.\n"
            f"Download: {result.download_speed:.1f} Mbps  "
            f"Upload: {result.upload_speed:.1f} Mbps"
        )
        _send_email(subject, body)
        _send_webhook({
            "content": f"**✅ Connection Restored** — download {result.download_speed:.1f} Mbps "
                       f"| {datetime.utcnow().isoformat()}Z",
            "username": "Internet Stability Tracker",
        })
        _last_alert_state["outage"] = False


# ─── Scheduled jobs ───────────────────────────────────────────────────────────

def scheduled_speed_test():
    """Runs one speed test and saves to DB. Errors are caught so a single
    failure never kills the scheduler."""
    db = SessionLocal()
    try:
        service = SpeedTestService()
        result = service.run_test(db)
        logger.info(
            "Scheduled test saved — id=%s  dl=%.1f  ul=%.1f  outage=%s",
            result.id, result.download_speed, result.upload_speed, result.is_outage,
        )
        _check_and_alert(result)
    except Exception as exc:
        logger.error("Scheduled speed test failed: %s", exc, exc_info=True)
    finally:
        db.close()


def hourly_aggregation():
    """
    Rolls up raw SpeedMeasurement rows older than 7 days into hourly averages
    stored in HourlyAggregate. Keeps the raw table lean for long-running installs.
    Currently logs a summary; extend with actual aggregation table as needed.
    """
    db = SessionLocal()
    try:
        from .models.measurement import SpeedMeasurement
        cutoff = datetime.utcnow() - timedelta(days=7)
        old_count = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp < cutoff).count()
        if old_count > 0:
            logger.info("Hourly aggregation: %d rows older than 7 days available for rollup", old_count)
            # Future: INSERT INTO hourly_aggregates (SELECT ...) then DELETE raw rows
    except Exception as exc:
        logger.error("Hourly aggregation failed: %s", exc, exc_info=True)
    finally:
        db.close()


def weekly_report():
    """Sends a weekly summary via email and/or webhook every Monday at 08:00 UTC."""
    db = SessionLocal()
    try:
        from .models.measurement import SpeedMeasurement
        since = datetime.utcnow() - timedelta(days=7)
        rows  = db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= since).all()
        if not rows:
            return

        dls     = [r.download_speed for r in rows if r.download_speed is not None]
        uls     = [r.upload_speed   for r in rows if r.upload_speed   is not None]
        outages = sum(1 for r in rows if r.is_outage)
        uptime  = round((1 - outages / len(rows)) * 100, 1)
        avg_dl  = round(sum(dls) / len(dls), 1) if dls else 0
        avg_ul  = round(sum(uls) / len(uls), 1) if uls else 0

        subject = f"📊 Weekly Internet Report — {uptime}% uptime"
        body = (
            f"Weekly Internet Stability Report\n"
            f"Period: {since.strftime('%Y-%m-%d')} → {datetime.utcnow().strftime('%Y-%m-%d')}\n\n"
            f"• Uptime:          {uptime}%\n"
            f"• Outages:         {outages} / {len(rows)} tests\n"
            f"• Avg Download:    {avg_dl} Mbps\n"
            f"• Avg Upload:      {avg_ul} Mbps\n\n"
            f"View full report: https://internet-stability-tracker.vercel.app"
        )
        _send_email(subject, body)
        _send_webhook({
            "content": (
                f"**📊 Weekly Report** — {uptime}% uptime | "
                f"↓ {avg_dl} Mbps | ↑ {avg_ul} Mbps | "
                f"{outages} outages in {len(rows)} tests"
            ),
            "username": "Internet Stability Tracker",
        })
        logger.info("Weekly report sent — uptime=%.1f%%  outages=%d", uptime, outages)
    except Exception as exc:
        logger.error("Weekly report failed: %s", exc, exc_info=True)
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")

    if settings.AUTO_SPEED_TEST:
        scheduler.add_job(
            scheduled_speed_test,
            "interval",
            seconds=settings.SPEED_TEST_INTERVAL,
            id="speed_test",
            replace_existing=True,
            max_instances=1,
        )
        logger.info("Scheduler: auto speed test every %ds", settings.SPEED_TEST_INTERVAL)
    else:
        logger.info("Scheduler: AUTO_SPEED_TEST=False — tests only via POST /api/test-now")

    # Hourly aggregation at :55 past every hour
    scheduler.add_job(
        hourly_aggregation,
        "cron",
        minute=55,
        id="hourly_agg",
        replace_existing=True,
        max_instances=1,
    )

    # Weekly report every Monday at 08:00 UTC
    scheduler.add_job(
        weekly_report,
        "cron",
        day_of_week="mon",
        hour=8,
        minute=0,
        id="weekly_report",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.start()
    return scheduler
