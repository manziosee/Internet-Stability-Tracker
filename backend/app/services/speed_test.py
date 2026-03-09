import speedtest
from datetime import datetime
from sqlalchemy.orm import Session
from ..models.measurement import SpeedMeasurement

class SpeedTestService:
    def __init__(self):
        self.st = speedtest.Speedtest()
    
    def run_test(self, db: Session, location: str = None, lat: float = None, lon: float = None):
        self.st.get_best_server()
        download = self.st.download() / 1_000_000
        upload = self.st.upload() / 1_000_000
        ping = self.st.results.ping
        
        measurement = SpeedMeasurement(
            download_speed=download,
            upload_speed=upload,
            ping=ping,
            isp=self.st.results.client.get('isp', 'Unknown'),
            location=location,
            latitude=lat,
            longitude=lon,
            is_outage=download < 1.0
        )
        
        db.add(measurement)
        db.commit()
        db.refresh(measurement)
        return measurement
