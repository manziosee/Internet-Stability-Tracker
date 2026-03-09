from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean
from datetime import datetime
from ..core.database import Base

class SpeedMeasurement(Base):
    __tablename__ = "speed_measurements"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    download_speed = Column(Float)
    upload_speed = Column(Float)
    ping = Column(Float)
    isp = Column(String)
    location = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    is_outage = Column(Boolean, default=False)

class CommunityReport(Base):
    __tablename__ = "community_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    isp = Column(String)
    location = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    issue_type = Column(String)
    description = Column(String)
