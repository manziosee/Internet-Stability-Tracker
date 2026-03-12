<div align="center">

# 🌐 Internet Stability Tracker

**Community-driven network monitoring — real-time speed, outage detection, AI insights**


[![Deploy to Fly.io](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/deploy-fly.yml/badge.svg)](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/deploy-fly.yml)
[![Build Docker](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml/badge.svg)](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://reactjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Fly.io](https://img.shields.io/badge/Fly.io-deployed-8B5CF6?logo=fly.io&logoColor=white)](https://fly.io)
[![Vercel](https://img.shields.io/badge/Vercel-deployed-000000?logo=vercel&logoColor=white)](https://vercel.com)

</div>

---

## Live Demo

| Service | URL |
|---------|-----|
| 🖥️ Frontend | https://internet-stability-tracker.vercel.app |
| ⚡ API | https://backend-cold-butterfly-9535.fly.dev/api |
| 📖 Swagger UI | https://backend-cold-butterfly-9535.fly.dev/docs |
| 📚 ReDoc | https://backend-cold-butterfly-9535.fly.dev/redoc |
| 🔌 WebSocket | `wss://backend-cold-butterfly-9535.fly.dev/api/ws/live` |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| ![React](https://img.shields.io/badge/-React_18-61DAFB?logo=react&logoColor=white&style=flat) | React 18 + CRA | Frontend SPA |
| ![MUI](https://img.shields.io/badge/-Material_UI_v6-007FFF?logo=mui&logoColor=white&style=flat) | Material UI v6 | Component library |
| ![Framer](https://img.shields.io/badge/-Framer_Motion-EF0078?logo=framer&logoColor=white&style=flat) | Framer Motion | Page animations |
| ![Recharts](https://img.shields.io/badge/-Recharts-22B5BF?style=flat) | Recharts | Speed history charts |
| ![Leaflet](https://img.shields.io/badge/-Leaflet-199900?logo=leaflet&logoColor=white&style=flat) | Leaflet.js | Interactive outage map |
| ![FastAPI](https://img.shields.io/badge/-FastAPI-009688?logo=fastapi&logoColor=white&style=flat) | FastAPI 0.104 | REST API + WebSocket |
| ![Python](https://img.shields.io/badge/-Python_3.12-3776AB?logo=python&logoColor=white&style=flat) | Python 3.12 | Backend runtime |
| ![SQLAlchemy](https://img.shields.io/badge/-SQLAlchemy_2-D71F00?logo=sqlalchemy&logoColor=white&style=flat) | SQLAlchemy 2 | ORM |
| ![Pydantic](https://img.shields.io/badge/-Pydantic_v2-E92063?logo=pydantic&logoColor=white&style=flat) | Pydantic v2 | Data validation |
| ![Turso](https://img.shields.io/badge/-Turso_libSQL-4FF8D2?style=flat) | Turso (libSQL) | Edge SQLite cloud DB |
| ![Docker](https://img.shields.io/badge/-Docker-2496ED?logo=docker&logoColor=white&style=flat) | Docker (multi-stage) | Containerisation |
| ![Fly.io](https://img.shields.io/badge/-Fly.io-8B5CF6?logo=fly.io&logoColor=white&style=flat) | Fly.io | Backend hosting (JNB) |
| ![Vercel](https://img.shields.io/badge/-Vercel-000000?logo=vercel&logoColor=white&style=flat) | Vercel | Frontend hosting |
| ![GitHub Actions](https://img.shields.io/badge/-GitHub_Actions-2088FF?logo=github-actions&logoColor=white&style=flat) | GitHub Actions | CI/CD pipelines |
| ![APScheduler](https://img.shields.io/badge/-APScheduler-FF9800?style=flat) | APScheduler 3 | Background jobs |
| ![Sentry](https://img.shields.io/badge/-Sentry-362D59?logo=sentry&logoColor=white&style=flat) | Sentry SDK | Error tracking (opt-in) |

---

## Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Real-time speed stats, quality score, ISP comparison, live bandwidth |
| Status | `/status` | Global platform health, 7-day daily summary |
| Outage Map | `/map` | Community-reported incidents on an interactive Leaflet map |
| Report Issue | `/report` | Submit a crowd-sourced network issue with GPS |
| ISP Reliability | `/isp` | Per-ISP letter grades and weighted leaderboard |
| Timeline | `/timeline` | Chronological outage/recovery event log |
| Diagnostics | `/diagnostics` | Public IP, ISP, location + live DNS/HTTP latency |
| AI Insights | `/insights` | Statistical patterns: congestion windows, trends, optimal times |
| Advanced | `/advanced` | Heatmap, anomaly detection, comparison, multi-region, traceroute, PDF |

---

## Features

### Frontend
- ☀️ Dark/light mode — persisted in `localStorage`
- 📱 Mobile-responsive navigation (hamburger drawer on small screens)
- ✨ Animated page transitions with Framer Motion
- 🗺️ Interactive Leaflet map for outage locations
- 📡 **WebSocket live feed** — real-time data push, LIVE/POLL indicator
- 🚀 **Browser-side bandwidth measurement** — actual download/upload to your browser
- 📊 **Chart zoom/pan** — Recharts `Brush` on speed history (>20 data points)
- 🔔 **Push notifications** — outage start, recovery, degraded speed (via Notifications API)
- 📱 **PWA** — installable, stale-while-revalidate service worker caching
- 📄 **PDF export** — exports Advanced Insights page via `html2canvas` + `jsPDF`
- 🔗 **Shareable reports** — one-click snapshot URL copied to clipboard

### Backend API Endpoints

| Category | Endpoint | Description |
|----------|----------|-------------|
| **Speed Test** | `POST /api/test-now` | On-demand speed test (10–30s) |
| **Measurements** | `GET /api/measurements` | Paginated test history |
| | `GET /api/measurements/recent` | Last N hours |
| | `DELETE /api/measurements` | Clear all (admin key required) |
| **Statistics** | `GET /api/stats` | Aggregated uptime %, averages |
| | `GET /api/quality-score` | Composite 0–100 score + letter grade |
| | `GET /api/status` | Platform health + 7-day summary |
| **Alerts** | `GET /api/alerts` | Current outage + 48h summary |
| | `GET /api/outage-confidence` | 0–100% confidence score |
| **Outages** | `GET /api/outages` | Measurements flagged as outages |
| | `GET /api/outage-events` | Structured event log with duration |
| | `GET /api/timeline` | Chronological events grouped by date |
| **ISP** | `GET /api/isp-comparison` | Averages by provider |
| | `GET /api/isp-reliability` | Uptime % + letter grades |
| | `GET /api/isp-rankings` | Weighted leaderboard scores |
| **Reports** | `GET/POST /api/reports` | Community issue submissions |
| | `POST /api/reports/{id}/confirm\|reject` | Crowd voting |
| **Network** | `GET /api/network-usage` | Real-time bandwidth sample |
| | `GET /api/diagnostics` | Live DNS + HTTP latency checks |
| | `GET /api/bandwidth-probe` | 4–512KB binary payload for browser speed test |
| | `POST /api/bandwidth-probe` | Upload timing endpoint |
| | `GET /api/multi-region` | HTTP latency to 6 geographic regions |
| | `GET /api/traceroute` | Server-side traceroute (when available) |
| **Insights** | `GET /api/ai-insights` | Statistical pattern analysis |
| | `GET /api/congestion-heatmap` | 7×24 weekday × hour performance grid |
| | `GET /api/comparison` | This week vs last week delta % |
| | `GET /api/anomalies` | Z-score outlier detection (±2σ) |
| **WebSocket** | `WS /api/ws/live` | Real-time measurement push + heartbeat |
| **Snapshots** | `POST /api/snapshots` | Create shareable report |
| | `GET /api/snapshots/{id}` | Retrieve snapshot |
| **Misc** | `GET /api/my-connection` | Caller IP, ISP, location |

### Background Jobs (APScheduler)
- **Hourly aggregation** — runs at :55 past every hour
- **Weekly report** — runs Monday 08:00 UTC (webhook/email if configured)
- **Outage alerts** — transition detection: outage start & recovery notifications

---

## Security

| Control | Implementation |
|---------|---------------|
| Rate limiting | Sliding-window per-IP **and** per-X-Client-ID |
| Admin endpoints | `DELETE /api/measurements` requires `X-Admin-Key` header |
| Input validation | Pydantic v2 schemas; SQLAlchemy ORM (no raw queries) |
| CORS | Locked to frontend origin in production |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy` |
| Request size limit | 64 KB max body |
| Docker | Non-root user, multi-stage builds, source maps stripped |
| Secrets | Environment variables / Fly.io secrets — never committed |

---

## Quick Start — Local Dev

```bash
# 1. Clone
git clone https://github.com/manziosee/Internet-Stability-Tracker.git
cd Internet-Stability-Tracker

# 2. Backend
cd backend
cp .env.example .env          # fill in TURSO_DB_URL, TURSO_AUTH_TOKEN, SECRET_KEY, ADMIN_API_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env.local    # set REACT_APP_API_URL=http://localhost:8000/api
npm install
npm start
```

Open http://localhost:3000 — Swagger UI at http://localhost:8000/docs

---

## Docker (Single Container)

```bash
# Build
docker build -t internet-stability-tracker .

# Run (set your secrets)
docker run -p 8000:8000 \
  -e TURSO_DB_URL=libsql://your-db.turso.io \
  -e TURSO_AUTH_TOKEN=your-token \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e ADMIN_API_KEY=$(openssl rand -hex 24) \
  internet-stability-tracker
```

---

## Docker Compose (Full Stack with nginx)

```bash
cp .env.example .env          # fill in required secrets
docker compose up -d
```

Opens http://localhost — nginx serves the React app and proxies `/api` to FastAPI.

---

## 📚 Documentation

- **[CI/CD Guide](CI-CD-GUIDE.md)** — Complete deployment documentation
- **[Quick Reference](QUICK-REFERENCE.md)** — One-line commands cheat sheet
- **[CI/CD Fixes](CI-CD-FIXES.md)** — Recent fixes and changes
- **[Cool Features](COOL-FEATURES.md)** — 🔥 NEW: Gaming Mode, Video Calls, Router Health, and more!

---

## Deployment

### Backend — Fly.io

```bash
# First time setup
fly launch --no-deploy

# Set secrets
fly secrets set \
  TURSO_DB_URL=libsql://your-db.turso.io \
  TURSO_AUTH_TOKEN=your-token \
  SECRET_KEY=$(openssl rand -hex 32) \
  ADMIN_API_KEY=$(openssl rand -hex 24)

# Optional: outage alerts
fly secrets set ALERT_WEBHOOK_URL=https://hooks.slack.com/...

# Optional: Sentry
fly secrets set SENTRY_DSN=https://...@sentry.io/...

# Deploy
fly deploy
```

### CI/CD — GitHub Actions

Auto-deploys on every push to `main`. **Required setup:**

1. Generate a token: `fly tokens create deploy -x 999999h`
2. Add it at: **GitHub repo → Settings → Secrets → Actions → New repository secret**
   - Name: `FLY_API_TOKEN`
   - Value: the token from step 1

### Frontend — Vercel

Connect the repo to Vercel with these settings:
- **Framework:** Create React App
- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Output directory:** `build`
- **Environment variable:** `REACT_APP_API_URL` = `https://backend-cold-butterfly-9535.fly.dev/api`

---

## Environment Variables

### Backend (`.env` / Fly.io secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DB_URL` | ✅ | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | ✅ | Turso authentication token |
| `SECRET_KEY` | ✅ | JWT / session secret (`openssl rand -hex 32`) |
| `ADMIN_API_KEY` | ✅ | Key for DELETE endpoint (`openssl rand -hex 24`) |
| `ENVIRONMENT` | — | `production` or `development` (default: `development`) |
| `ALERT_WEBHOOK_URL` | — | Webhook URL for outage alerts (Slack, Discord, etc.) |
| `ALERT_EMAIL` | — | Email address to send outage alerts to |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | — | SMTP port (default: 587) |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM` | — | Sender address for alert emails |
| `SENTRY_DSN` | — | Sentry DSN for error tracking |

### Frontend (Vercel env vars / `.env.local`)

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Backend API URL (e.g. `https://backend-cold-butterfly-9535.fly.dev/api`) |
| `REACT_APP_SENTRY_DSN` | Sentry DSN for frontend error tracking (optional) |

---

## Postman Collection

Import `postman_collection.json` from the repo root.

The `base_url` variable defaults to the live production API — no setup needed. Change it to `http://localhost:8000/api` for local development.

---

## Project Structure

```
Internet-Stability-Tracker/
├── backend/
│   ├── app/
│   │   ├── api/routes.py          # All API endpoints + WebSocket
│   │   ├── core/config.py         # Pydantic-settings configuration
│   │   ├── core/database.py       # Turso/libSQL connection
│   │   ├── models/measurement.py  # SQLAlchemy ORM models
│   │   ├── services/speed_test.py # speedtest-cli wrapper
│   │   ├── scheduler.py           # APScheduler jobs (hourly, weekly, alerts)
│   │   └── main.py                # FastAPI app, middleware, lifespan
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── sw.js                  # PWA service worker
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.js       # Main dashboard + WebSocket + bandwidth
│   │   │   ├── StatusPage.js
│   │   │   ├── OutageMap.js
│   │   │   ├── ReportForm.js
│   │   │   ├── ISPReliabilityPage.js
│   │   │   ├── TimelinePage.js
│   │   │   ├── DiagnosticsPage.js
│   │   │   ├── AIInsightsPage.js
│   │   │   └── AdvancedInsightsPage.js  # Heatmap, anomalies, PDF, share
│   │   ├── services/api.js        # Axios API client (all endpoints)
│   │   ├── ColorModeContext.js    # Dark/light mode context
│   │   └── App.js                 # Router + navigation
│   ├── .env.example
│   └── package.json
├── .github/workflows/
│   ├── ci.yml                     # Backend smoke test + frontend build check
│   ├── deploy-fly.yml             # Auto-deploy to Fly.io on push to main
│   └── docker-image.yml           # Build + push Docker image to GHCR
├── Dockerfile                     # Multi-stage: React build → FastAPI + static
├── docker-compose.yml             # Full stack with nginx proxy
├── fly.toml                       # Fly.io app configuration
├── vercel.json                    # Vercel security headers + SPA rewrite
├── .dockerignore                  # Excludes node_modules (~300MB) from build context
└── postman_collection.json        # Pre-configured Postman collection (v2)
```

---


<div align="center">
Built with ❤️ using FastAPI, React, Turso, Fly.io, and Vercel
</div>
