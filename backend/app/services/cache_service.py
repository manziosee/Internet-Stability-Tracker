"""Cache Service — Redis when available, in-memory TTL fallback otherwise"""
import json
import time
import threading
from typing import Optional, Any, Dict
from app.core.config import settings

try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


# ── In-memory fallback cache ────────────────────────────────────────────────
# Thread-safe dict: key → {"value": ..., "expires_at": float}
_mem: Dict[str, dict] = {}
_mem_lock = threading.Lock()


def _mem_get(key: str) -> Optional[Any]:
    with _mem_lock:
        entry = _mem.get(key)
        if not entry:
            return None
        if entry["expires_at"] < time.monotonic():
            del _mem[key]
            return None
        return entry["value"]


def _mem_set(key: str, value: Any, ttl: int) -> None:
    with _mem_lock:
        _mem[key] = {"value": value, "expires_at": time.monotonic() + ttl}


def _mem_delete(key: str) -> None:
    with _mem_lock:
        _mem.pop(key, None)


def _mem_clear_pattern(pattern: str) -> int:
    prefix = pattern.rstrip("*")
    with _mem_lock:
        keys = [k for k in list(_mem.keys()) if k.startswith(prefix)]
        for k in keys:
            del _mem[k]
    return len(keys)


class CacheService:
    """Two-tier cache: Redis (if configured) → in-memory TTL fallback.
    All methods are async so call sites don't need to change."""

    def __init__(self):
        self.redis_client = None
        if REDIS_AVAILABLE and settings.REDIS_URL:
            try:
                self.redis_client = redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                )
            except Exception:
                self.redis_client = None

    async def get(self, key: str) -> Optional[Any]:
        if self.redis_client:
            try:
                raw = await self.redis_client.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        # Fallback to in-memory
        return _mem_get(key)

    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> bool:
        if self.redis_client:
            try:
                await self.redis_client.setex(key, ttl_seconds, json.dumps(value))
                return True
            except Exception:
                pass
        # Fallback to in-memory
        _mem_set(key, value, ttl_seconds)
        return True

    async def delete(self, key: str) -> bool:
        if self.redis_client:
            try:
                await self.redis_client.delete(key)
                return True
            except Exception:
                pass
        _mem_delete(key)
        return True

    async def clear_pattern(self, pattern: str) -> int:
        if self.redis_client:
            try:
                keys = [k async for k in self.redis_client.scan_iter(match=pattern)]
                if keys:
                    return await self.redis_client.delete(*keys)
                return 0
            except Exception:
                pass
        return _mem_clear_pattern(pattern)

    def cache_key(self, prefix: str, *args) -> str:
        return ":".join([prefix] + [str(a) for a in args])

    @property
    def backend(self) -> str:
        return "redis" if self.redis_client else "memory"


# Global singleton
cache_service = CacheService()
