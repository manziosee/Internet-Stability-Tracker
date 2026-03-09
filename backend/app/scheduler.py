from apscheduler.schedulers.background import BackgroundScheduler
from .core.database import SessionLocal
from .services.speed_test import SpeedTestService
from .core.config import settings

def scheduled_speed_test():
    db = SessionLocal()
    try:
        service = SpeedTestService()
        service.run_test(db)
    finally:
        db.close()

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(scheduled_speed_test, 'interval', seconds=settings.SPEED_TEST_INTERVAL)
    scheduler.start()
