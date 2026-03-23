"""
LLM Service — real AI chatbot for network analysis.
Primary:  OpenAI GPT-4o-mini
Fallback: Groq  llama-3.1-8b-instant
Falls back gracefully to keyword analysis if both keys are missing.
"""
import logging
import os
import statistics
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.measurement import SpeedMeasurement

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY",   "")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_context(db: Session, client_id: str) -> Dict[str, Any]:
    """Build a data snapshot for the last 7 days to inject into the prompt."""
    cutoff = datetime.utcnow() - timedelta(days=7)
    rows = (
        db.query(SpeedMeasurement)
        .filter(and_(
            SpeedMeasurement.client_id == client_id,
            SpeedMeasurement.timestamp >= cutoff,
        ))
        .order_by(SpeedMeasurement.timestamp.desc())
        .limit(200)
        .all()
    )
    if not rows:
        return {}

    dls  = [r.download_speed for r in rows if r.download_speed]
    uls  = [r.upload_speed   for r in rows if r.upload_speed]
    pings = [r.ping          for r in rows if r.ping]
    outages = [r for r in rows if r.is_outage]

    # Hour-of-day averages
    hour_buckets: Dict[int, list] = {h: [] for h in range(24)}
    for r in rows:
        if r.download_speed:
            hour_buckets[r.timestamp.hour].append(r.download_speed)
    best_hour  = max(hour_buckets, key=lambda h: statistics.mean(hour_buckets[h]) if hour_buckets[h] else 0)
    worst_hour = min(hour_buckets, key=lambda h: statistics.mean(hour_buckets[h]) if hour_buckets[h] else 999)

    isp = rows[0].isp if rows else "Unknown"
    location = rows[0].location if rows else "Unknown"

    return {
        "total_tests":      len(rows),
        "avg_download_mbps": round(statistics.mean(dls),  2) if dls  else 0,
        "avg_upload_mbps":   round(statistics.mean(uls),  2) if uls  else 0,
        "avg_ping_ms":       round(statistics.mean(pings), 2) if pings else 0,
        "min_ping_ms":       round(min(pings), 2)            if pings else 0,
        "max_ping_ms":       round(max(pings), 2)            if pings else 0,
        "min_download_mbps": round(min(dls), 2)              if dls   else 0,
        "max_download_mbps": round(max(dls), 2)              if dls   else 0,
        "outage_count":      len(outages),
        "uptime_pct":        round(100 * (len(rows) - len(outages)) / len(rows), 1),
        "best_hour":         best_hour,
        "worst_hour":        worst_hour,
        "isp":               isp,
        "location":          location,
        "days_window":       7,
    }


def _system_prompt() -> str:
    return (
        "You are an expert network diagnostics assistant embedded inside the "
        "Internet Stability Tracker app. You have access to the user's real "
        "measured network data (provided below as JSON context). "
        "Answer questions about their internet connection clearly and helpfully. "
        "Be concise — 2–4 sentences unless the user asks for detail. "
        "When the data shows a problem, explain it in plain English and suggest "
        "one concrete action. Never make up numbers not present in the context. "
        "If you cannot answer from the context, say so honestly."
    )


def _user_prompt(question: str, ctx: Dict[str, Any]) -> str:
    if not ctx:
        return (
            f"User question: {question}\n\n"
            "Note: No measurement data is available yet. "
            "Advise the user to run a speed test first."
        )
    ctx_str = "\n".join(f"  {k}: {v}" for k, v in ctx.items())
    return f"User question: {question}\n\nMeasurement data (last {ctx.get('days_window', 7)} days):\n{ctx_str}"


# ── OpenAI call ───────────────────────────────────────────────────────────────

def _ask_openai(question: str, ctx: Dict[str, Any]) -> Optional[str]:
    if not OPENAI_API_KEY:
        return None
    try:
        import httpx
        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":      "gpt-4o-mini",
                "messages": [
                    {"role": "system",  "content": _system_prompt()},
                    {"role": "user",    "content": _user_prompt(question, ctx)},
                ],
                "max_tokens":  300,
                "temperature": 0.4,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"].strip()
        logger.warning("OpenAI returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("OpenAI call failed: %s", exc)
    return None


# ── Groq call ─────────────────────────────────────────────────────────────────

def _ask_groq(question: str, ctx: Dict[str, Any]) -> Optional[str]:
    if not GROQ_API_KEY:
        return None
    try:
        import httpx
        resp = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":      "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system",  "content": _system_prompt()},
                    {"role": "user",    "content": _user_prompt(question, ctx)},
                ],
                "max_tokens":  300,
                "temperature": 0.4,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"].strip()
        logger.warning("Groq returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Groq call failed: %s", exc)
    return None


# ── Public entry point ────────────────────────────────────────────────────────

def ask_llm(db: Session, client_id: str, question: str) -> Dict[str, Any]:
    """
    Ask a natural language question about the user's network data.
    Tries OpenAI → Groq → keyword fallback in order.
    Returns {"answer": str, "source": str, "context": dict}.
    """
    ctx = _build_context(db, client_id)

    # 1. OpenAI
    answer = _ask_openai(question, ctx)
    if answer:
        return {"answer": answer, "source": "openai", "context": ctx}

    # 2. Groq
    answer = _ask_groq(question, ctx)
    if answer:
        return {"answer": answer, "source": "groq", "context": ctx}

    # 3. Keyword fallback — still useful when no API keys are set
    answer = _keyword_fallback(question, ctx)
    return {"answer": answer, "source": "fallback", "context": ctx}


# ── Keyword fallback (kept from original, uses real ctx data) ─────────────────

def _keyword_fallback(question: str, ctx: Dict[str, Any]) -> str:
    q = question.lower()
    if not ctx:
        return "No data yet — run a speed test first and then ask me again."

    dl   = ctx.get("avg_download_mbps", 0)
    ul   = ctx.get("avg_upload_mbps",   0)
    ping = ctx.get("avg_ping_ms",       0)
    isp  = ctx.get("isp", "your ISP")
    up   = ctx.get("uptime_pct",        100)
    bh   = ctx.get("best_hour",         0)
    wh   = ctx.get("worst_hour",        0)
    oc   = ctx.get("outage_count",      0)

    if any(w in q for w in ["hi", "hello", "hey", "help"]):
        return (
            f"Hi! Your connection with {isp} is averaging {dl} Mbps down / "
            f"{ul} Mbps up, ping {ping} ms, {up}% uptime over the last 7 days. "
            "Ask me anything about your network."
        )
    if "upload" in q:
        verdict = "good" if ul >= 10 else "limited" if ul >= 3 else "poor"
        return f"Your average upload is {ul} Mbps — {verdict} for most tasks."
    if "download" in q or "speed" in q:
        return f"Average download is {dl} Mbps (best: {ctx.get('max_download_mbps')} Mbps, worst: {ctx.get('min_download_mbps')} Mbps)."
    if any(w in q for w in ["ping", "latency", "lag"]):
        grade = "excellent" if ping < 20 else "good" if ping < 50 else "fair" if ping < 100 else "poor"
        return f"Your average ping is {ping} ms — {grade}."
    if any(w in q for w in ["outage", "down", "cut"]):
        return f"You had {oc} outage(s) in the last 7 days ({up}% uptime)."
    if any(w in q for w in ["best time", "when", "fastest"]):
        return f"Your fastest hour is {bh:02d}:00 and slowest is {wh:02d}:00 based on historical data."
    if any(w in q for w in ["gaming", "game"]):
        grade = "great" if ping < 30 else "ok" if ping < 60 else "poor"
        return f"Your ping of {ping} ms is {grade} for gaming."
    if any(w in q for w in ["video call", "zoom", "teams", "meet"]):
        ok = dl >= 5 and ul >= 2 and ping < 150
        return f"Your connection ({'meets' if ok else 'does not meet'} video call requirements: {dl} Mbps down, {ul} Mbps up, {ping} ms ping)."
    if any(w in q for w in ["isp", "provider"]):
        return f"You're on {isp} with {up}% uptime and {dl} Mbps average download."
    if any(w in q for w in ["summary", "overview", "report"]):
        return (
            f"7-day summary: {dl} Mbps down / {ul} Mbps up, {ping} ms ping, "
            f"{up}% uptime, {oc} outage(s). Best hour: {bh:02d}:00."
        )
    return (
        f"Your connection: {dl} Mbps down / {ul} Mbps up, {ping} ms ping, "
        f"{up}% uptime over 7 days. Ask me anything more specific!"
    )
