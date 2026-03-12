# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

LABEL stage="frontend-builder"

WORKDIR /app/frontend

# Cache deps separately from source
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --ignore-scripts

COPY frontend/ ./

ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV DISABLE_ESLINT_PLUGIN=true
ENV CI=false

RUN npm run build \
 && find /app/frontend/build -name "*.map" -delete   # strip source maps

# ── Stage 2: Backend + bundled static files (single-container) ───────────────
FROM python:3.12-slim

LABEL org.opencontainers.image.title="Internet Stability Tracker" \
      org.opencontainers.image.description="Network monitoring — FastAPI + React in one container" \
      org.opencontainers.image.version="2.0.0" \
      org.opencontainers.image.source="https://github.com/manziosee/Internet-Stability-Tracker" \
      org.opencontainers.image.licenses="MIT"

# Patch base-image CVEs and add curl for healthcheck + traceroute for network diagnostics
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends curl traceroute iputils-ping \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps (cached unless requirements.txt changes)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Place the React build where FastAPI's StaticFiles middleware will serve it
COPY --from=frontend-build /app/frontend/build ./static

# Non-root user — drop privileges before running
RUN adduser --disabled-password --no-create-home --gecos "" appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
  CMD curl -fs http://localhost:8000/health || exit 1

# 1 worker on Fly.io free tier (512 MB); scale via fly.toml [[vm]] for more
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--log-level", "info", \
     "--access-log"]
