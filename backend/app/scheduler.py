import logging
from apscheduler.schedulers.background import BackgroundScheduler
from .core.database import SessionLocal
from .services.speed_test import SpeedTestService
from .core.config import settings

logger = logging.getLogger(__name__)


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
    except Exception as exc:
        logger.error("Scheduled speed test failed: %s", exc, exc_info=True)
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        scheduled_speed_test,
        "interval",
        seconds=settings.SPEED_TEST_INTERVAL,
        id="speed_test",
        replace_existing=True,
        max_instances=1,          # never run two tests at the same time
    )
    scheduler.start()
    logger.info(
        "Scheduler started — running speed test every %ds",
        settings.SPEED_TEST_INTERVAL,
    )
    return scheduler
