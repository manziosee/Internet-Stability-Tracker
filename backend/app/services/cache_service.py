"""Cache Service — three-tier: Go LRU agent → Redis → in-memory TTL dict

Tier 1  Go agent  (http://127.0.0.1:8002) — proper LRU eviction, shared
                  across all uvicorn workers, zero external deps.
Tier 2  Redis     (optional) — distributed, survives process restarts.
Tier 3  In-memory — always-available fallback, per-process dict.

All public methods are async so call sites require no changes.
"""
import json
import logging
import time
import threading
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as _redis
    _REDIS_OK = True
except ImportError:
    _REDIS_OK = False


# ── Tier 3: in-memory TTL dict ────────────────────────────────────────────────

_mem: Dict[str, dict] = {}
_mem_lock = threading.Lock()


def _mem_get(key: str) -> Optional[Any]:
    with _mem_lock:
        e = _mem.get(key)
        if not e:
            return None
        if e["x"] < time.monotonic():
            del _mem[key]
            return None
        return e["v"]


def _mem_set(key: str, value: Any, ttl: int) -> None:
    with _mem_lock:
        _mem[key] = {"v": value, "x": time.monotonic() + ttl}


def _mem_del(key: str) -> None:
    with _mem_lock:
        _mem.pop(key, None)


def _mem_clear_prefix(prefix: str) -> int:
    pfx = prefix.rstrip("*")
    with _mem_lock:
        keys = [k for k in list(_mem) if k.startswith(pfx)]
        for k in keys:
            del _mem[k]
    return len(keys)


# ── Tier 1: Go agent helpers (sync HTTP — httpx sync client) ──────────────────

def _go_headers() -> dict:
    h = {}
    if settings.AGENT_SERVICE_TOKEN:
        h["X-Service-Token"] = settings.AGENT_SERVICE_TOKEN
    return h


def _go_get(key: str) -> Optional[Any]:
    if not settings.AGENT_URL:
        return None
    try:
        r = httpx.get(
            f"{settings.AGENT_URL}/cache/{key}",
            headers=_go_headers(),
            timeout=0.5,
        )
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


def _go_set(key: str, value: Any, ttl: int) -> bool:
    if not settings.AGENT_URL:
        return False
    try:
        r = httpx.post(
            f"{settings.AGENT_URL}/cache",
            json={"key": key, "value": value, "ttl_seconds": ttl},
            headers=_go_headers(),
            timeout=0.5,
        )
        return r.status_code == 200
    except Exception:
        return False


def _go_del(key: str) -> None:
    if not settings.AGENT_URL:
        return
    try:
        httpx.delete(
            f"{settings.AGENT_URL}/cache/{key}",
            headers=_go_headers(),
            timeout=0.5,
        )
    except Exception:
        pass


# ── Main CacheService ─────────────────────────────────────────────────────────

class CacheService:
    """Three-tier cache: Go agent LRU → Redis → in-memory fallback."""

    def __init__(self) -> None:
        self._redis = None
        if _REDIS_OK and settings.REDIS_URL:
            try:
                self._redis = _redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                )
            except Exception:
                self._redis = None

    async def get(self, key: str) -> Optional[Any]:
        # 1. Go agent LRU
        val = _go_get(key)
        if val is not None:
            return val
        # 2. Redis
        if self._redis:
            try:
                raw = await self._redis.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        # 3. In-memory
        return _mem_get(key)

    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> bool:
        # Write through all tiers so warm-up is instant after a restart
        _go_set(key, value, ttl_seconds)
        if self._redis:
            try:
                await self._redis.setex(key, ttl_seconds, json.dumps(value))
            except Exception:
                pass
        _mem_set(key, value, ttl_seconds)
        return True

    async def delete(self, key: str) -> bool:
        _go_del(key)
        if self._redis:
            try:
                await self._redis.delete(key)
            except Exception:
                pass
        _mem_del(key)
        return True

    async def clear_pattern(self, pattern: str) -> int:
        if self._redis:
            try:
                keys = [k async for k in self._redis.scan_iter(match=pattern)]
                if keys:
                    await self._redis.delete(*keys)
            except Exception:
                pass
        return _mem_clear_prefix(pattern)

    def cache_key(self, prefix: str, *args) -> str:
        return ":".join([prefix] + [str(a) for a in args])

    @property
    def backend(self) -> str:
        if settings.AGENT_URL:
            return "go-lru"
        if self._redis:
            return "redis"
        return "memory"


# Global singleton
cache_service = CacheService()
