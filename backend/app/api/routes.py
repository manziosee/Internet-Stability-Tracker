from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List
from datetime import datetime, timedelta
from ..core.database import get_db
from ..models.measurement import SpeedMeasurement, CommunityReport
from ..services.speed_test import SpeedTestService
from pydantic import BaseModel

router = APIRouter()

class MeasurementResponse(BaseModel):
    id: int
    timestamp: datetime
    download_speed: float
    upload_speed: float
    ping: float
    isp: str
    location: str | None
    is_outage: bool
    
    class Config:
        from_attributes = True

class ReportCreate(BaseModel):
    isp: str
    location: str
    latitude: float
    longitude: float
    issue_type: str
    description: str

@router.get("/measurements", response_model=List[MeasurementResponse])
def get_measurements(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(SpeedMeasurement).order_by(desc(SpeedMeasurement.timestamp)).offset(skip).limit(limit).all()

@router.get("/measurements/recent")
def get_recent_measurements(hours: int = 24, db: Session = Depends(get_db)):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    return db.query(SpeedMeasurement).filter(SpeedMeasurement.timestamp >= cutoff).all()

@router.get("/outages")
def get_outages(db: Session = Depends(get_db)):
    return db.query(SpeedMeasurement).filter(SpeedMeasurement.is_outage == True).order_by(desc(SpeedMeasurement.timestamp)).limit(50).all()

@router.get("/isp-comparison")
def compare_isps(db: Session = Depends(get_db)):
    results = db.query(
        SpeedMeasurement.isp,
        func.avg(SpeedMeasurement.download_speed).label('avg_download'),
        func.avg(SpeedMeasurement.upload_speed).label('avg_upload'),
        func.avg(SpeedMeasurement.ping).label('avg_ping'),
        func.count(SpeedMeasurement.id).label('total_tests')
    ).group_by(SpeedMeasurement.isp).all()
    
    return [{"isp": r[0], "avg_download": r[1], "avg_upload": r[2], "avg_ping": r[3], "total_tests": r[4]} for r in results]

@router.post("/reports")
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    db_report = CommunityReport(**report.dict())
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

@router.post("/test-now")
def run_test_now(location: str = None, lat: float = None, lon: float = None, db: Session = Depends(get_db)):
    service = SpeedTestService()
    result = service.run_test(db, location, lat, lon)
    return result
