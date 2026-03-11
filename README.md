<div align="center">

# Internet Stability Tracker

<img src="frontend/public/favicon.svg" alt="IST Logo" width="72" />

**Community-driven network monitoring — real-time speed tests, outage detection, ISP grading**

[![Version](https://img.shields.io/badge/version-1.0.0-f0c24b?style=flat-square)](https://github.com/manziosee/Internet-Stability-Tracker)
[![Python](https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/react-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?style=flat-square)](https://turso.tech)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com)
[![Fly.io](https://img.shields.io/badge/deploy-fly.io-7C3AED?style=flat-square)](https://fly.io)
[![License](https://img.shields.io/badge/license-MIT-22C55E?style=flat-square)](LICENSE)

[Features](#-features) · [Quick Start](#-quick-start) · [API Docs](#-api-reference) · [Deploy to Fly.io](#-deploy-to-flyio) · [Docker](#-docker) · [Contributing](#-contributing)

</div>

---

## Overview

Internet Stability Tracker is a full-stack network monitoring platform that:

- Runs **on-demand speed tests** (never auto-scheduled — you control when)
- Detects **outages** automatically when download speed drops below threshold
- Visualises **speed history** on an interactive area chart
- Shows **live network activity** — real-time bandwidth + which apps are online
- Grades every **ISP** with an A+/F letter grade based on uptime and speed
- Accepts **community reports** with GPS coordinates on an interactive map
- Ships as a single Docker container or deploys to **Fly.io** in minutes

---

## Features

| Category | Details |
|----------|---------|
| **Speed Testing** | On-demand via button click; measures download, upload, and ping |
| **Outage Detection** | Auto-flags measurements below `OUTAGE_THRESHOLD_MBPS` (default 1 Mbps) |
| **Live Dashboard** | Animated stat cards, sparklines, quality score gauge, trend badges |
| **Speed Chart** | Recharts area chart — selectable 6h / 12h / 24h / 48h windows |
| **ISP Reliability** | Letter grades, uptime %, averages — updated on every test |
| **Outage Map** | Leaflet interactive map with community reports and outage pins |
| **Live Network Activity** | Real-time bandwidth bars + per-app connection tiles (psutil, no root) |
| **Community Reports** | Validated submissions with ISP, GPS, issue type, description |
| **Data Export** | One-click CSV export of full speed history |
| **Clear History** | Confirmation-gated delete of all measurements |
| **Push Notifications** | Browser notifications when an outage is detected |
| **PWA** | Installable as a desktop/mobile app via `manifest.webmanifest` |
| **Dark Mode** | Full MUI dark theme with gold accent |
| **Security** | Rate limiting, CSP, HSTS, input validation, no SQL injection surface |

---

## Tech Stack

### Backend
| Library | Purpose |
|---------|---------|
| **FastAPI 0.104** | Async REST API framework |
| **SQLAlchemy 2** | ORM with Turso (libSQL) via custom HTTP adapter |
| **Turso / libSQL** | Serverless SQLite-compatible cloud database |
| **APScheduler 3** | Background scheduler (disabled by default — use `AUTO_SPEED_TEST=true` to enable) |
| **speedtest-cli** | Real speed measurement via Speedtest.net |
| **psutil** | System network I/O and per-process connection listing |
| **Pydantic v2** | Request validation with field-level constraints |
| **Uvicorn** | ASGI server |

### Frontend
| Library | Purpose |
|---------|---------|
| **React 18** | UI framework |
| **MUI v5** | Component library (dark gold theme) |
| **Framer Motion** | Animations and transitions |
| **Recharts** | Speed-over-time area chart |
| **React Leaflet** | Interactive outage map |
| **Axios** | HTTP client |

### Infrastructure
| Tool | Purpose |
|------|---------|
| **Docker** | Multi-stage builds; single-container and compose variants |
| **nginx 1.27** | Hardened reverse proxy with CSP, SQL-injection URI blocking |
| **Fly.io** | One-command cloud deployment (`fly deploy`) |
| **GitHub Actions** | CI — builds Docker images on push |

---

## Quick Start

### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/manziosee/Internet-Stability-Tracker.git
cd Internet-Stability-Tracker

# Copy and fill in your Turso credentials
cp .env.example .env
# Edit .env — set TURSO_DB_URL and TURSO_AUTH_TOKEN

docker compose up -d
```

Open **http://localhost** — the React UI proxies all `/api` calls through nginx to the backend.

### Option 2 — Local development

```bash
# ── Backend ──────────────────────────────────────────────────────────────────
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Create .env (see Configuration section below)
cp .env.example .env

python run.py          # http://localhost:8000
                       # API docs: http://localhost:8000/docs

# ── Frontend (separate terminal) ─────────────────────────────────────────────
cd frontend
npm install
npm start              # http://localhost:3000
```

---

## Configuration

Create `backend/.env` (or root `.env` for Docker Compose):

```env
# ── Required ─────────────────────────────────────────────────────────────────
TURSO_DB_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-jwt-token-here

# ── Optional (defaults shown) ─────────────────────────────────────────────────
SECRET_KEY=change-this-to-a-random-64-char-string
ENVIRONMENT=development          # set 'production' to disable /docs and enable HSTS
SPEED_TEST_INTERVAL=300          # seconds between auto-tests (only if AUTO_SPEED_TEST=true)
AUTO_SPEED_TEST=false            # true = background scheduler; false = button-click only
OUTAGE_THRESHOLD_MBPS=1.0        # below this download speed → outage flagged
CORS_ORIGINS=["http://localhost:3000"]
MAX_HISTORY_HOURS=168            # 7 days maximum for history queries
```

Get Turso credentials: [turso.tech](https://turso.tech) → create a database → copy URL + token.

---

## API Reference

Interactive docs at **http://localhost:8000/docs** (disabled in production).

### All endpoints

| Method | Endpoint | Description | Rate limit |
|--------|----------|-------------|-----------|
| `GET` | `/health` | Service health check | — |
| `POST` | `/api/test-now` | Run speed test now | 5 / 60 s |
| `GET` | `/api/measurements` | All measurements (paginated) | 120 / 60 s |
| `GET` | `/api/measurements/recent?hours=24` | Recent measurements | 120 / 60 s |
| `DELETE` | `/api/measurements` | Clear all measurements | 120 / 60 s |
| `GET` | `/api/stats?hours=24` | Aggregated stats | 120 / 60 s |
| `GET` | `/api/alerts` | Current outage status | 120 / 60 s |
| `GET` | `/api/outages` | Measurements flagged as outages | 120 / 60 s |
| `GET` | `/api/outage-events` | Structured outage event log | 120 / 60 s |
| `GET` | `/api/isp-comparison` | ISP averages | 120 / 60 s |
| `GET` | `/api/isp-reliability?hours=168` | ISP letter grades + uptime % | 120 / 60 s |
| `GET` | `/api/network-usage` | Live bandwidth + app connections | 120 / 60 s |
| `GET` | `/api/reports` | Community reports (paginated) | 120 / 60 s |
| `POST` | `/api/reports` | Submit a community report | 20 / 60 s |

Import **`postman_collection.json`** (repo root) into Postman for ready-to-run requests with example responses.

---

## Deploy to Fly.io

The repo ships with `fly.toml` for a single-container deploy (React + FastAPI in one image).

```bash
# 1. Install flyctl
curl -L https://fly.io/install.sh | sh

# 2. Authenticate
fly auth login

# 3. Create the app (first time only)
fly launch --no-deploy

# 4. Set secrets (never stored in fly.toml)
fly secrets set \
  TURSO_DB_URL="libsql://your-db.turso.io" \
  TURSO_AUTH_TOKEN="your-token" \
  SECRET_KEY="$(openssl rand -hex 32)"

# 5. Deploy
fly deploy

# View logs
fly logs
```

The app will be live at `https://internet-stability-tracker.fly.dev`.

### Update CORS for production

After deploy, set `CORS_ORIGINS` to your actual domain:

```bash
fly secrets set CORS_ORIGINS='["https://internet-stability-tracker.fly.dev"]'
```

---

## Docker

### Single container (Fly.io / any VPS)

```bash
# Build
docker build -t ist:latest .

# Run (requires Turso credentials)
docker run -p 8000:8000 \
  -e TURSO_DB_URL=libsql://... \
  -e TURSO_AUTH_TOKEN=... \
  -e ENVIRONMENT=production \
  ist:latest
```

### Two-container compose (nginx + FastAPI separate)

```bash
cp .env.example .env   # fill in Turso credentials
docker compose up -d

# Logs
docker compose logs -f

# Rebuild after code changes
docker compose up -d --build
```

---

## Project Structure

```
Internet-Stability-Tracker/
├── Dockerfile                    # Single-container (frontend + backend) — for Fly.io
├── fly.toml                      # Fly.io deployment config
├── docker-compose.yml            # Two-container local stack (nginx + FastAPI)
├── postman_collection.json       # Postman API collection (all endpoints)
├── .env.example                  # Environment variable template
│
├── backend/
│   ├── app/
│   │   ├── api/routes.py         # All REST endpoints (tagged for Swagger)
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic settings (reads .env)
│   │   │   ├── database.py       # Turso/libSQL SQLAlchemy engine
│   │   │   └── turso_dbapi.py    # Pure-Python HTTP adapter for Turso
│   │   ├── models/measurement.py # SQLAlchemy models
│   │   ├── services/speed_test.py# speedtest-cli wrapper
│   │   ├── main.py               # FastAPI app + security middleware stack
│   │   └── scheduler.py          # APScheduler (opt-in via AUTO_SPEED_TEST)
│   ├── Dockerfile                # Backend-only image
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── public/
    │   ├── favicon.svg           # Gold WiFi SVG favicon
    │   └── manifest.webmanifest  # PWA manifest
    ├── src/
    │   ├── components/
    │   │   ├── Dashboard.js      # Main dashboard (stats, chart, network activity)
    │   │   ├── OutageMap.js      # Leaflet map + community report form
    │   │   └── ISPReliabilityPage.js  # ISP grades + outage history
    │   ├── services/api.js       # Axios client (all endpoints)
    │   └── App.js                # Router + nav
    ├── nginx.conf                # Hardened nginx — CSP, SQL injection blocking
    └── Dockerfile                # Node 20 build → nginx 1.27 serve
```

---

## Security

| Layer | Measures |
|-------|---------|
| **HTTP headers** | X-Frame-Options, X-Content-Type-Options, CSP, HSTS (prod), Referrer-Policy, Permissions-Policy |
| **Rate limiting** | Per-IP sliding-window in FastAPI middleware (no Redis required) |
| **Input validation** | Pydantic v2 field validators — length limits, coordinate bounds, whitelist for `issue_type` |
| **Request size** | 64 KB body limit via `RequestSizeLimitMiddleware` |
| **nginx** | `server_tokens off`, URI pattern blocking for SQL injection keywords, `client_max_body_size 64k` |
| **Docker** | Non-root `appuser`, `apt-get upgrade` in build, stripped source maps, `--ignore-scripts` on `npm ci` |
| **CORS** | Explicit origins list, `allow_credentials=false`, `GET/POST/DELETE` only |
| **Docs** | `/docs`, `/redoc`, `/openapi.json` disabled in production |

---

## Testing

```bash
# Backend unit tests
cd backend
pytest -v

# Backend with coverage
pytest --cov=app --cov-report=term-missing
```

---

## Troubleshooting

**Speed test button shows error**
- Backend needs outbound internet access; check firewall rules
- Some corporate networks block Speedtest.net servers

**Timestamps show wrong time**
- Backend stores UTC; frontend adds `Z` suffix via `parseTS()` helper — should be correct
- Check your browser timezone settings

**`X-Frame-Options` console warning**
- This header must be sent by the server (nginx/FastAPI), not as a `<meta>` tag — already fixed

**`psutil` / network-usage returns 500**
- `psutil` is installed in Docker; for local dev make sure `pip install psutil>=5.9.0`

**`TURSO_DB_URL` not set error**
- Copy `.env.example` to `.env` and fill in your Turso credentials

---

## Contributing

1. Fork the repository
2. Create a feature branch — `git checkout -b feature/your-feature`
3. Commit your changes — `git commit -m 'feat: add your feature'`
4. Push and open a Pull Request to `develop`

Branch strategy: `main` (production) ← `develop` (integration) ← `feature/*`

---

## Acknowledgements

- [speedtest-cli](https://github.com/sivel/speedtest-cli) — speed measurement
- [Turso](https://turso.tech) — serverless libSQL cloud database
- [Leaflet](https://leafletjs.com) + [React Leaflet](https://react-leaflet.js.org) — maps
- [FastAPI](https://fastapi.tiangolo.com) — async Python API framework
- [MUI](https://mui.com) — React component library
- [Fly.io](https://fly.io) — deployment platform

---

<div align="center">

Made with ❤️ for better internet transparency · ⭐ Star if you find it useful

</div>
