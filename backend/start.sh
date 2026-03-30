#!/bin/sh
# ── Internet Stability Tracker — Process Supervisor ────────────────────────────
# Starts three services inside the container in dependency order:
#   1. go-agent   (port 8002) — LRU cache + SSE event hub
#   2. ist-probe  (port 8001) — Rust network probe
#   3. uvicorn    (port 8000) — Python FastAPI (main ingress)
#
# All environment variables are forwarded automatically.
# The script exits (causing Fly.io to restart the machine) if uvicorn exits.
# ────────────────────────────────────────────────────────────────────────────────
set -e

log() { echo "[start.sh] $*" ; }

# ── 1. Go agent ────────────────────────────────────────────────────────────────
log "Starting go-agent on port ${AGENT_PORT:-8002}..."
go-agent &
GO_PID=$!

# ── 2. Rust probe ──────────────────────────────────────────────────────────────
log "Starting ist-probe on port ${PROBE_PORT:-8001}..."
ist-probe &
PROBE_PID=$!

# ── Give sidecars time to bind their ports before Python starts ────────────────
sleep 2

# ── 3. Python FastAPI ──────────────────────────────────────────────────────────
log "Starting uvicorn on port 8000..."
exec uvicorn app.main:app \
     --host 0.0.0.0 \
     --port 8000 \
     --workers 2 \
     --log-level info \
     --access-log
