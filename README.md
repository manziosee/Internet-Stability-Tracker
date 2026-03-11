# Internet Stability Tracker

Community-driven network monitoring platform that measures internet speed, detects outages, and visualises performance across ISPs — deployed on **Fly.io** (backend) and **Vercel** (frontend).

[![Build & Push Docker Images](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml/badge.svg)](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml)
[![Deploy to Fly.io](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/deploy-fly.yml/badge.svg)](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/deploy-fly.yml)
[![Vercel](https://img.shields.io/badge/frontend-Vercel-black?logo=vercel)](https://internet-stability-tracker.vercel.app)

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://internet-stability-tracker.vercel.app |
| API | https://backend-cold-butterfly-9535.fly.dev/api |
| Swagger UI | https://backend-cold-butterfly-9535.fly.dev/docs |
| ReDoc | https://backend-cold-butterfly-9535.fly.dev/redoc |

---

## Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Real-time speed stats, quality score, ISP comparison |
| Status | `/status` | Global platform health, 7-day daily summary |
| Outage Map | `/map` | Community-reported incidents on an interactive map |
| Report Issue | `/report` | Submit a crowd-sourced network issue with GPS |
| ISP Reliability | `/isp` | Per-ISP letter grades and weighted leaderboard |
| Timeline | `/timeline` | Chronological outage / recovery event log |
| Diagnostics | `/diagnostics` | Your public IP, ISP, location + live DNS/HTTP latency tests |
| AI Insights | `/insights` | Statistical pattern analysis: congestion windows, trends |

---

## Features

### Frontend
- Dark / light mode toggle (persisted in localStorage)
- Mobile-responsive navigation (hamburger menu on small screens)
- Animated page transitions with Framer Motion
- Interactive Leaflet map for outage locations
- Real-time "My Connection" panel — detects your public IP, ISP, country and city via ip-api.com (called directly from the browser, no backend round-trip needed)
- Live DNS resolution + HTTP latency tests against 4 targets (Google, Cloudflare, OpenDNS, Quad9)

### Backend Capabilities
| Capability | Endpoint |
|------------|----------|
| Speed measurements | `GET /api/measurements` |
| Recent measurements | `GET /api/recent-measurements` |
| Aggregated stats | `GET /api/stats` |
| Current alerts | `GET /api/alerts` |
| Outage list | `GET /api/outages` |
| ISP comparison | `GET /api/isp-comparison` |
| Community reports | `GET/POST /api/reports` |
| On-demand speed test | `POST /api/test-now` |
| Outage events | `GET /api/outage-events` |
| ISP reliability | `GET /api/isp-reliability` |
| Live network usage | `GET /api/network-usage` |
| Network Quality Score | `GET /api/quality-score` |
| Global status | `GET /api/status` |
| Timeline | `GET /api/timeline` |
| ISP rankings | `GET /api/isp-rankings` |
| Outage confidence | `GET /api/outage-confidence` |
| Report confirm/reject | `POST /api/reports/{id}/confirm\|reject` |
| Network diagnostics | `GET /api/diagnostics` |
| AI insights | `GET /api/ai-insights` |
| My connection info | `GET /api/my-connection` |
| Clear measurements | `DELETE /api/measurements` *(admin key required)* |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Material UI v6, Framer Motion, Leaflet |
| Backend | FastAPI (Python 3.12), SQLAlchemy, Pydantic v2 |
| Database | Turso (libSQL cloud — edge-hosted SQLite) |
| Speed tests | speedtest-cli (auto-detects ISP, server, location) |
| IP geolocation | ip-api.com (browser-side, no API key required) |
| Containerisation | Docker (multi-stage builds), Docker Compose |
| Backend hosting | Fly.io (Johannesburg region) |
| Frontend hosting | Vercel |
| CI/CD | GitHub Actions |

---

## Security

| Control | Implementation |
|---------|---------------|
| Rate limiting | Sliding-window per-IP: 5 req/min for tests & reports, 60 req/min default |
| Admin-protected endpoints | `DELETE /api/measurements` requires `X-Admin-Key` header |
| Input validation | Pydantic v2 schemas on all POST bodies; SQL via SQLAlchemy ORM (no raw queries) |
| CORS | Locked to frontend origin in production |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS (prod), `Permissions-Policy` |
| Content-Security-Policy | `script-src 'self'` (no unsafe-inline), explicit `connect-src` allowlist |
| Request size limit | 64 KB max body |
| Error responses | Generic messages only — stack traces logged server-side, never returned to clients |
| Docker | Non-root user, multi-stage builds, source maps stripped |
| Secrets | All secrets via environment variables / Fly.io secrets — never committed |

**Required secrets (never commit these):**
```
TURSO_DB_URL       — your Turso database URL
TURSO_AUTH_TOKEN   — your Turso auth token
SECRET_KEY         — strong random key (openssl rand -hex 32)
ADMIN_API_KEY      — key for the DELETE endpoint (openssl rand -hex 24)
```

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

Open http://localhost:3000

---

## Docker Compose (Full Stack)

```bash
cp .env.example .env          # fill in required secrets
docker compose up -d
```

Open http://localhost — nginx serves the React app and proxies `/api` to the FastAPI backend.

---

## Deployment

### Backend — Fly.io

```bash
# First time
fly launch --no-deploy

# Set secrets (never stored in fly.toml)
fly secrets set \
  TURSO_DB_URL=libsql://your-db.turso.io \
  TURSO_AUTH_TOKEN=your-token \
  SECRET_KEY=$(openssl rand -hex 32) \
  ADMIN_API_KEY=$(openssl rand -hex 24)

# Deploy
fly deploy
```

CI auto-deploys on every push to `main` via the `Deploy to Fly.io` workflow.  
**Required GitHub secret:** `FLY_API_TOKEN` — get it with `fly tokens create deploy -x 999999h`.

### Frontend — Vercel

Connect the repo to Vercel. Build settings:
- **Framework:** Create React App
- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Output directory:** `build`
- **Environment variable:** `REACT_APP_API_URL` = `https://backend-cold-butterfly-9535.fly.dev/api`

---

## Postman Collection

Import `postman_collection.json` from the repo root.  
The default `base_url` variable points to the live production API — no setup needed.

---

## Project Structure

```
Internet-Stability-Tracker/
├── backend/
│   ├── app/
│   │   ├── api/routes.py          # all 21 API endpoints
│   │   ├── core/config.py         # pydantic-settings config
│   │   ├── core/database.py       # Turso/libSQL connection
│   │   ├── models/measurement.py  # SQLAlchemy ORM models
│   │   ├── services/speed_test.py # speedtest-cli wrapper
│   │   ├── scheduler.py           # background speed-test scheduler
│   │   └── main.py                # FastAPI app, middleware, lifespan
│   ├── .env.example
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.js
│   │   │   ├── StatusPage.js
│   │   │   ├── OutageMap.js
│   │   │   ├── ReportForm.js
│   │   │   ├── ISPReliability.js
│   │   │   ├── TimelinePage.js
│   │   │   ├── DiagnosticsPage.js
│   │   │   └── AIInsightsPage.js
│   │   ├── services/api.js        # axios API client
│   │   └── App.js                 # router + navigation
│   ├── .env.example
│   ├── .env.production            # Vercel build-time API URL
│   ├── nginx.conf                 # Docker Compose nginx config
│   └── Dockerfile
├── .github/workflows/
│   ├── docker-image.yml           # build, test, push to GHCR
│   └── deploy-fly.yml             # auto-deploy to Fly.io on main
├── docker-compose.yml
├── Dockerfile                     # single-container (backend + React SPA)
├── fly.toml
└── postman_collection.json
```

---

## License

MIT
