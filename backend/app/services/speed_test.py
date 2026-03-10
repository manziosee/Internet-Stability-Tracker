import logging
import speedtest
from sqlalchemy.orm import Session
from ..models.measurement import SpeedMeasurement
from ..core.config import settings

logger = logging.getLogger(__name__)


class SpeedTestService:
    """
    Separates the network measurement from the DB write so the
    measurement can safely run in a thread pool without passing a
    SQLAlchemy session across threads.
    """

    def measure_speeds(self) -> dict:
        """
        Pure network measurement — no DB interaction.
        Safe to call from a thread pool executor.
        On any failure records a 0-speed outage instead of raising.
        """
        try:
            st = speedtest.Speedtest(secure=True)
            st.get_best_server()
            download = st.download() / 1_000_000   # bps → Mbps
            upload   = st.upload()   / 1_000_000
            ping     = st.results.ping
            isp      = st.results.client.get("isp", "Unknown")
            is_outage = download < settings.OUTAGE_THRESHOLD_MBPS
            logger.info(
                "Speed test OK — DL: %.1f Mbps  UL: %.1f Mbps  Ping: %.0f ms  ISP: %s",
                download, upload, ping, isp,
            )
        except Exception as exc:
            logger.error("Speed test failed: %s — recording as outage", exc)
            download  = 0.0
            upload    = 0.0
            ping      = 9999.0
            isp       = "Unknown"
            is_outage = True

        return {
            "download":  download,
            "upload":    upload,
            "ping":      ping,
            "isp":       isp,
            "is_outage": is_outage,
        }

    def run_test(
        self,
        db: Session,
        location: str = None,
        lat: float = None,
        lon: float = None,
    ) -> SpeedMeasurement:
        """Synchronous full test + DB write. Used by the background scheduler."""
        result = self.measure_speeds()
        return self._save(db, result, location, lat, lon)

    @staticmethod
    def _save(
        db: Session,
        result: dict,
        location: str = None,
        lat: float = None,
        lon: float = None,
    ) -> SpeedMeasurement:
        measurement = SpeedMeasurement(
            download_speed=result["download"],
            upload_speed=result["upload"],
            ping=result["ping"],
            isp=result["isp"],
            location=location,
            latitude=lat,
            longitude=lon,
            is_outage=result["is_outage"],
        )
        db.add(measurement)
        db.commit()
        db.refresh(measurement)
        return measurement
