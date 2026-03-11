# ── Backend Dockerfile ────────────────────────────────────────────────────────
# Use slim variant — no compilers, smaller attack surface
FROM python:3.12-slim

LABEL org.opencontainers.image.title="IST Backend" \
      org.opencontainers.image.description="Internet Stability Tracker API" \
      org.opencontainers.image.version="1.0.0"

# Upgrade system packages (patch CVEs in base image)
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps in a separate layer (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy application code (after deps so code changes don't bust the dep cache)
COPY . .

# Drop root: create a minimal non-root user
RUN adduser --disabled-password --no-create-home --gecos "" appuser \
 && chown -R appuser:appuser /app
USER appuser

# Only expose the app port — nothing else
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
  CMD curl -fs http://localhost:8000/health || exit 1

# 2 workers; adjust based on available CPU cores
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info", \
     "--access-log"]
