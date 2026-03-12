"""Smart Alerts & Notifications Service"""
import httpx
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime, time
from sqlalchemy.orm import Session
from app.models.measurement import AlertConfig, AlertLog
from app.core.config import settings


class SmartAlertService:
    """Handles multi-channel alert delivery with custom thresholds and quiet hours"""
    
    def __init__(self, db: Session):
        self.db = db
    
    async def send_alert(
        self,
        client_id: str,
        alert_type: str,
        message: str,
        severity: str = "medium",
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Send alert through configured channels respecting quiet hours"""
        config = self._get_alert_config(client_id)
        
        if not config or not config.enabled:
            return False
        
        if self._is_quiet_hours(config):
            if severity != "critical":
                return False
        
        if not self._should_alert(config, alert_type, metadata):
            return False
        
        results = []
        if config.telegram_enabled and config.telegram_chat_id:
            results.append(await self._send_telegram(config.telegram_chat_id, message))
        
        if config.discord_enabled and config.discord_webhook_url:
            results.append(await self._send_discord(config.discord_webhook_url, message, severity))
        
        if config.sms_enabled and config.phone_number and severity == "critical":
            results.append(await self._send_sms(config.phone_number, message))
        
        self._log_alert(client_id, alert_type, message, severity, any(results))
        return any(results)
    
    def _get_alert_config(self, client_id: str) -> Optional[AlertConfig]:
        """Get alert configuration for client"""
        return self.db.query(AlertConfig).filter(
            AlertConfig.client_id == client_id
        ).first()
    
    def _is_quiet_hours(self, config: AlertConfig) -> bool:
        """Check if current time is within quiet hours"""
        if not config.quiet_hours_enabled:
            return False
        
        now = datetime.now().time()
        start = config.quiet_hours_start
        end = config.quiet_hours_end
        
        if start < end:
            return start <= now <= end
        else:
            return now >= start or now <= end
    
    def _should_alert(self, config: AlertConfig, alert_type: str, metadata: Optional[Dict]) -> bool:
        """Check if alert meets custom thresholds"""
        if not metadata:
            return True
        
        if alert_type == "speed_drop" and config.min_download_speed:
            speed = metadata.get("download_speed", 0)
            if speed >= config.min_download_speed:
                return False
        
        if alert_type == "ping_spike" and config.max_ping:
            ping = metadata.get("ping", 0)
            if ping <= config.max_ping:
                return False
        
        return True
    
    async def _send_telegram(self, chat_id: str, message: str) -> bool:
        """Send Telegram notification"""
        if not settings.TELEGRAM_BOT_TOKEN:
            return False
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
                response = await client.post(url, json={
                    "chat_id": chat_id,
                    "text": f"🌐 *Internet Stability Alert*\n\n{message}",
                    "parse_mode": "Markdown"
                })
                return response.status_code == 200
        except Exception:
            return False
    
    async def _send_discord(self, webhook_url: str, message: str, severity: str) -> bool:
        """Send Discord webhook notification"""
        try:
            color_map = {"low": 3447003, "medium": 16776960, "high": 16711680, "critical": 10038562}
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(webhook_url, json={
                    "embeds": [{
                        "title": "🌐 Internet Stability Alert",
                        "description": message,
                        "color": color_map.get(severity, 3447003),
                        "timestamp": datetime.utcnow().isoformat()
                    }]
                })
                return response.status_code == 204
        except Exception:
            return False
    
    async def _send_sms(self, phone_number: str, message: str) -> bool:
        """Send SMS via Twilio"""
        if not all([settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.TWILIO_FROM_NUMBER]):
            return False
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
                response = await client.post(
                    url,
                    auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                    data={
                        "To": phone_number,
                        "From": settings.TWILIO_FROM_NUMBER,
                        "Body": f"Internet Alert: {message}"
                    }
                )
                return response.status_code == 201
        except Exception:
            return False
    
    def _log_alert(self, client_id: str, alert_type: str, message: str, severity: str, success: bool):
        """Log alert to database"""
        log = AlertLog(
            client_id=client_id,
            alert_type=alert_type,
            message=message,
            severity=severity,
            success=success,
            timestamp=datetime.utcnow()
        )
        self.db.add(log)
        self.db.commit()
