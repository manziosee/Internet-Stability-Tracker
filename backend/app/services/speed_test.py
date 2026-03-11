import logging
from datetime import datetime
import speedtest
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..models.measurement import SpeedMeasurement, OutageEvent
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
        db.flush()  # assign ID before referencing

        # ── Outage event lifecycle ───────────────────────────────────────────
        SpeedTestService._update_outage_event(db, measurement)

        db.commit()
        db.refresh(measurement)
        return measurement

    @staticmethod
    def _update_outage_event(db: Session, m: SpeedMeasurement) -> None:
        """
        Open a new OutageEvent when an outage starts.
        Close the most recent open event when speeds recover.
        """
        open_event = (
            db.query(OutageEvent)
            .filter(OutageEvent.is_resolved == False)
            .order_by(desc(OutageEvent.started_at))
            .first()
        )

        if m.is_outage:
            if open_event is None:
                # Start a new outage event
                event = OutageEvent(
                    started_at=m.timestamp or datetime.utcnow(),
                    isp=m.isp,
                    location=m.location,
                    latitude=m.latitude,
                    longitude=m.longitude,
                    is_resolved=False,
                    measurement_count=1,
                    avg_download=m.download_speed,
                )
                db.add(event)
                logger.warning(
                    "Outage event OPENED — ISP: %s  DL: %.2f Mbps", m.isp, m.download_speed
                )
            else:
                # Update running average for ongoing outage
                count = open_event.measurement_count + 1
                avg   = (
                    (open_event.avg_download or 0) * open_event.measurement_count + m.download_speed
                ) / count
                open_event.measurement_count = count
                open_event.avg_download      = avg
        else:
            if open_event is not None:
                # Speeds recovered — close the event
                open_event.ended_at    = m.timestamp or datetime.utcnow()
                open_event.is_resolved = True
                duration = open_event.duration_minutes
                logger.info(
                    "Outage event CLOSED — duration: %.1f min  ISP: %s",
                    duration if duration is not None else 0,
                    open_event.isp,
                )
