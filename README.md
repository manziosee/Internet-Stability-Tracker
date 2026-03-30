<div align="center">

# 🌐 Internet Stability Tracker

**Community-driven network monitoring — real-time speed, outage detection, AI insights, ML predictions, and deep network diagnostics**

[![Build Docker](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml/badge.svg)](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.83-orange?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Go](https://img.shields.io/badge/Go-1.22-00ADD8?logo=go&logoColor=white)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://reactjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Fly.io](https://img.shields.io/badge/Fly.io-deployed-8B5CF6?logo=fly.io&logoColor=white)](https://fly.io)
[![Vercel](https://img.shields.io/badge/Vercel-deployed-000000?logo=vercel&logoColor=white)](https://vercel.com)
![Version](https://img.shields.io/badge/API_version-4.0.0-brightgreen)

</div>

---

## Live Demo

| Service | URL |
|---------|-----|
| 🖥️ Frontend | https://internet-stability-tracker.vercel.app |
| 🚀 Backend | https://backend-cold-butterfly-9535.fly.dev/api |
| 📖 Swagger UI | http://localhost:8000/docs *(local dev only — disabled in production)* |
| 📚 ReDoc | http://localhost:8000/redoc *(local dev only — disabled in production)* |
| 🔌 WebSocket | `wss://backend-cold-butterfly-9535.fly.dev/api/ws/live` |

---

## Architecture (v4.0 — Multi-Language)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER                                      │
│                                                                              │
│  ┌────────────────────────┐        ┌─────────────────────────────────────┐  │
│  │  React 18 SPA           │        │  Browser Extension (MV3)            │  │
│  │  (Vercel CDN)           │        │  Chrome / Firefox                   │  │
│  │  Material UI v6         │        │  auto-test + notifications          │  │
│  │  Framer Motion          │        └──────────────┬──────────────────────┘  │
│  │  Recharts / Leaflet     │                       │                         │
│  └───────────┬─────────────┘                       │                         │
│              │  HTTPS REST + WebSocket              │  HTTPS REST             │
└──────────────┼─────────────────────────────────────┼─────────────────────────┘
               │                                     │
               ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     API GATEWAY  (port 8000, Fly.io lhr)                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Python 3.12  ·  FastAPI 0.104  ·  uvicorn (2 workers)              │   │
│  │                                                                      │   │
│  │  Request Pipeline:                                                   │   │
│  │  ① CORS middleware          → validates allowed origins             │   │
│  │  ② Security headers         → HSTS · X-Frame-Options · CSP         │   │
│  │  ③ Rate limiter             → sliding window per-IP + X-Client-ID  │   │
│  │  ④ Request size guard       → 64 KB max body                        │   │
│  │  ⑤ X-Client-ID extractor   → device UUID from header               │   │
│  │  ⑥ Router dispatch          → 80+ API endpoint handlers             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
               │
               │  internal HTTP (127.0.0.1 only)
        ┌──────┴──────────────┐
        │                     │
        ▼                     ▼
┌───────────────────┐  ┌──────────────────────────────────────────────────────┐
│  Rust Probe       │  │  Go Agent  (port 8002)                               │
│  (port 8001)      │  │                                                      │
│                   │  │  • LRU cache (2000 entries, TTL sweep every 10 s)   │
│  Links C library  │  │  • SSE event hub — broadcasts across all uvicorn     │
│  via FFI:         │  │    workers so every WS client gets every event       │
│  • ICMP echo      │  │  • Prometheus /metrics (stdlib, zero deps)           │
│  • CLOCK_MONO_RAW │  │  • Service-to-service auth (X-Service-Token)        │
│  • TCP connect µs │  │                                                      │
│                   │  └──────────────────────────────────────────────────────┘
│  Routes:          │
│  /ping            │
│  /packet-loss     │  (concurrent probes, p95 latency)
│  /jitter          │  (RFC 3550 jitter, stdev, quality grade)
│  /bandwidth       │  (async HTTP stream, real Mbps)
│  /traceroute      │  (subprocess + structured JSON + ASN labels)
│  /mtu             │  (TCP path MTU estimation)
│  /tls-probe       │  (TCP vs HTTPS time → TLS overhead, HTTP/2, HSTS)
│  /dns-timing      │  (parallel DoH to Cloudflare, Google, Quad9, NextDNS)
│  /multi-ping      │  (≤20 hosts in parallel, ICMP → C-TCP → Rust-TCP)
└───────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SERVICE LAYER (Python)                             │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ SpeedTest    │  │ LLM Service  │  │ ML Predictor │  │ Network        │  │
│  │ Service      │  │ OpenAI GPT-  │  │ scikit-learn │  │ Security       │  │
│  │ speedtest-   │  │ 4o-mini →    │  │ LinearReg +  │  │ port scan,     │  │
│  │ cli          │  │ Groq llama → │  │ Isolation    │  │ DNS leak,      │  │
│  │              │  │ keyword      │  │ Forest       │  │ privacy score  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Crisis Service                                                       │   │
│  │  • 7 Atlassian Statuspage providers (Cloudflare, GitHub, Discord…)  │   │
│  │  • IODA BGP routing health (Georgia Tech public API)                │   │
│  │  • Local speed vs 7-day baseline (download, upload, ping, jitter)   │   │
│  │  • CrisisLog DB persistence with 30-min deduplication               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Advanced     │  │ SLA Tracker  │  │ Health Score │  │ Cache Service  │  │
│  │ Diagnostics  │  │ promised vs  │  │ composite    │  │ Go LRU →       │  │
│  │ (calls Rust  │  │ actual       │  │ 0–100        │  │ Redis →        │  │
│  │  probe)      │  │              │  │              │  │ in-memory      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                      │
│                                                                              │
│  ┌────────────────────────────────┐   ┌──────────────────────────────────┐  │
│  │  Turso (libSQL cloud)           │   │  Cache tiers                     │  │
│  │  SQLAlchemy 2 ORM               │   │  1. Go LRU  (shared, 2000 max)   │  │
│  │  16 tables                      │   │  2. Redis   (optional)           │  │
│  └────────────────────────────────┘   │  3. In-memory TTL dict           │  │
│                                       └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BACKGROUND JOBS (APScheduler)                         │
│  Every :55 min → Hourly aggregation + outage transition detection            │
│  Monday 08:00  → Weekly report + alert delivery                              │
│  On demand     → Smart alert evaluation after each speed test                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Language Responsibilities

| Language | Binary | Port | Owns |
|----------|--------|------|------|
| **Python 3.12** | uvicorn | 8000 | API gateway, business logic, ML, DB, scheduler |
| **Rust 1.83** | `ist-probe` | 8001 | All network measurements (ping, jitter, loss, bandwidth, TLS, DNS, traceroute) |
| **C (gcc)** | `libisttime.a` | — (static lib) | Real ICMP echo · CLOCK_MONOTONIC_RAW · non-blocking TCP RTT via `select()` |
| **Go 1.22** | `go-agent` | 8002 | LRU cache · SSE broadcast hub · Prometheus metrics |

### Why each language

**C** — Raw ICMP echo requires a raw socket (`CAP_NET_RAW`). C gives direct access with zero overhead, precise `CLOCK_MONOTONIC_RAW` timing (immune to NTP slew), and a non-blocking TCP RTT probe using `select()` that is more accurate than the OS-level async primitives Python and Rust use.

**Rust** — All network measurement hot paths. Concurrent async probes via Tokio (50 TCP connections at once for packet loss), memory-safe FFI to the C library, zero-cost abstractions, and the binary is stripped/LTO-optimised to ~4 MB. The entire Rust crate compiles with no unsafe code outside the single `ffi.rs` module.

**Go** — The LRU cache and SSE hub need to be shared across both uvicorn worker processes. Go goroutines are cheap enough to handle a long-lived SSE stream per worker. The standard library `container/list`-based LRU, zero external dependencies, and a Prometheus text-format `/metrics` endpoint that needs no third-party packages.

**Python** — Business logic, ORM queries, ML (scikit-learn), LLM calls, and the FastAPI REST API stay in Python for developer velocity. Python delegates every hot network path to Rust and every cache/event operation to Go.

---

## Data Flow

### Speed Test + WebSocket Broadcast (v4.0)

```
User clicks "Run Speed Test"
  │
  ├─ Frontend  POST /api/test-now  { X-Client-ID: <uuid> }
  │
  ├─ Python: SpeedTestService.run()
  │     ├─ speedtest-cli → download / upload / ping / ISP
  │     ├─ Geo lookup (ip-api.com) → city, country, lat/lng
  │     ├─ SpeedMeasurement saved to Turso DB
  │     └─ OutageEvent created if download < 1 Mbps
  │
  ├─ Python: broadcast_measurement()
  │     ├─ POST http://127.0.0.1:8002/events/push  →  Go agent hub
  │     │     └─ Go broadcasts to all SSE subscribers
  │     │           └─ Each Python WS handler gets the event
  │     │                 └─ Forwarded to the browser client
  │     └─ Also direct-push to WS clients in this worker process
  │
  ├─ Smart alert evaluation → Telegram / Discord / SMS / Webhooks
  │
  └─ Response: { download_speed, upload_speed, ping, isp, location, ... }
```

### Network Diagnostics Flow (Rust + C)

```
GET /api/diagnostics/packet-loss?host=1.1.1.1&count=20
  │
  ├─ Python: AdvancedDiagnostics.measure_packet_loss()
  │     └─ POST http://127.0.0.1:8001/packet-loss  { host, count }
  │
  └─ Rust probe (ist-probe):
        ├─ C: ist_icmp_ping()  →  real ICMP (if CAP_NET_RAW available)
        │     └─ Falls back to ist_tcp_rtt_us()  (non-blocking select loop)
        ├─ 20 probes sent concurrently (Tokio join_all)
        ├─ Computes: loss %, avg / min / max / p95 latency
        └─ Returns JSON  { method: "tcp_connect_concurrent", ... }
```

### Cache Flow (Go LRU)

```
Python: await cache_service.get("isp:reliability:7d")
  │
  ├─ Tier 1: GET http://127.0.0.1:8002/cache/isp:reliability:7d
  │     ├─ Hit  → return cached JSON (0.5 ms)
  │     └─ Miss → fall through
  ├─ Tier 2: Redis (if configured)
  └─ Tier 3: in-memory TTL dict (always available)

Python: await cache_service.set("isp:reliability:7d", result, ttl=300)
  └─ Write-through to all three tiers simultaneously
```

### AI Chatbot Flow

```
GET /api/insights/query?q=why+is+my+ping+high
  │
  ├─ Build context: last 7 days measurements for this device
  │     (avg_download, avg_ping, outage_count, best_hour, ...)
  │
  ├─ Try OpenAI GPT-4o-mini  →  real LLM answer
  ├─ Try Groq llama-3.1-8b   →  fallback LLM
  └─ Keyword patterns         →  always-available offline fallback
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| ![C](https://img.shields.io/badge/-C-A8B9CC?logo=c&logoColor=white&style=flat) | C (gcc) | ICMP echo · CLOCK_MONOTONIC_RAW · TCP RTT (static lib, linked into Rust) |
| ![Rust](https://img.shields.io/badge/-Rust_1.83-orange?logo=rust&logoColor=white&style=flat) | Rust 1.83 + Axum | Network probe service (port 8001) |
| ![Go](https://img.shields.io/badge/-Go_1.22-00ADD8?logo=go&logoColor=white&style=flat) | Go 1.22 (stdlib only) | LRU cache + SSE event hub (port 8002) |
| ![Python](https://img.shields.io/badge/-Python_3.12-3776AB?logo=python&logoColor=white&style=flat) | Python 3.12 | API gateway, business logic, ML |
| ![FastAPI](https://img.shields.io/badge/-FastAPI-009688?logo=fastapi&logoColor=white&style=flat) | FastAPI 0.104 | REST API + WebSocket |
| ![React](https://img.shields.io/badge/-React_18-61DAFB?logo=react&logoColor=white&style=flat) | React 18 + CRA | Frontend SPA |
| ![MUI](https://img.shields.io/badge/-Material_UI_v6-007FFF?logo=mui&logoColor=white&style=flat) | Material UI v6 | Component library |
| ![Framer](https://img.shields.io/badge/-Framer_Motion-EF0078?logo=framer&logoColor=white&style=flat) | Framer Motion | Page animations |
| ![Recharts](https://img.shields.io/badge/-Recharts-22B5BF?style=flat) | Recharts | Speed history charts |
| ![Leaflet](https://img.shields.io/badge/-Leaflet-199900?logo=leaflet&logoColor=white&style=flat) | Leaflet.js | Interactive outage map |
| ![SQLAlchemy](https://img.shields.io/badge/-SQLAlchemy_2-D71F00?logo=sqlalchemy&logoColor=white&style=flat) | SQLAlchemy 2 | ORM |
| ![Pydantic](https://img.shields.io/badge/-Pydantic_v2-E92063?logo=pydantic&logoColor=white&style=flat) | Pydantic v2 | Data validation |
| ![Turso](https://img.shields.io/badge/-Turso_libSQL-4FF8D2?style=flat) | Turso (libSQL) | Edge SQLite cloud DB |
| ![scikit-learn](https://img.shields.io/badge/-scikit--learn-F7931E?logo=scikit-learn&logoColor=white&style=flat) | scikit-learn | ML speed predictions + Isolation Forest |
| ![Docker](https://img.shields.io/badge/-Docker-2496ED?logo=docker&logoColor=white&style=flat) | Docker (4-stage multi-language build) | Containerisation |
| ![Fly.io](https://img.shields.io/badge/-Fly.io-8B5CF6?logo=fly.io&logoColor=white&style=flat) | Fly.io (lhr, 2 vCPU / 2 GB) | Backend hosting |
| ![Vercel](https://img.shields.io/badge/-Vercel-000000?logo=vercel&logoColor=white&style=flat) | Vercel | Frontend hosting |
| ![GitHub Actions](https://img.shields.io/badge/-GitHub_Actions-2088FF?logo=github-actions&logoColor=white&style=flat) | GitHub Actions | CI/CD pipelines |
| ![APScheduler](https://img.shields.io/badge/-APScheduler-FF9800?style=flat) | APScheduler 3 | Background jobs |
| ![Sentry](https://img.shields.io/badge/-Sentry-362D59?logo=sentry&logoColor=white&style=flat) | Sentry SDK | Error tracking (opt-in) |
| Chrome Extension | Manifest V3 | Browser auto-test agent |

---

## API Endpoints (v4.0)

### Core
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/test-now` | Run on-demand speed test |
| `GET`  | `/api/my-connection` | Caller IP, ISP, location (scoped to device) |
| `GET`  | `/api/status` | Global health + 7-day daily summary |
| `GET`  | `/api/stats` | Aggregated uptime %, averages |
| `GET`  | `/api/quality-score` | Composite 0–100 quality score |
| `GET`  | `/api/measurements` | Paginated test history |
| `WS`   | `/api/ws/live` | Real-time push — subscribes to Go SSE hub |
| `GET`  | `/health` | `{"status":"healthy","version":"4.0.0",...}` |
| `GET`  | `/api/openapi.json` | Always-available OpenAPI spec |

### Rust Probe Endpoints (internal · proxied through Python diagnostics)
| Method | Rust Route | Description |
|--------|-----------|-------------|
| `POST` | `/ping` | Single TCP RTT via C `ist_tcp_rtt_us()` |
| `POST` | `/packet-loss` | N concurrent probes → loss %, p95 latency |
| `POST` | `/jitter` | Sequential probes → RFC 3550 jitter + stdev |
| `POST` | `/bandwidth` | Async HTTP stream download → real Mbps |
| `POST` | `/traceroute` | subprocess + structured JSON + ASN labels |
| `POST` | `/mtu` | TCP path MTU estimation |
| `POST` | `/tls-probe` | TCP time vs HTTPS time → TLS overhead, HTTP/2, HSTS |
| `POST` | `/dns-timing` | Parallel DoH to Cloudflare / Google / Quad9 / NextDNS |
| `POST` | `/multi-ping` | ≤20 hosts parallel — ICMP → C-TCP → Rust-TCP priority |

### Go Agent Endpoints (internal · used by Python cache + WS)
| Method | Go Route | Description |
|--------|---------|-------------|
| `GET`  | `/health` | Agent health + cache stats + SSE client count |
| `GET`  | `/metrics` | Prometheus text format (requests, cache hits/misses, SSE clients) |
| `GET`  | `/cache/{key}` | LRU cache lookup |
| `POST` | `/cache` | Insert/update cache entry `{key, value, ttl_seconds}` |
| `DELETE` | `/cache/{key}` | Invalidate cache key |
| `POST` | `/events/push` | Broadcast JSON event to all SSE subscribers |
| `GET`  | `/events/subscribe` | Long-lived SSE stream (one per uvicorn worker) |

### Advanced Diagnostics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/diagnostics/advanced` | Full suite (packet loss + jitter + bufferbloat + MTU + DNS leak) |
| `GET` | `/api/diagnostics/packet-loss` | Packet loss % (Rust probe) |
| `GET` | `/api/diagnostics/jitter` | Jitter ms (Rust probe) |
| `GET` | `/api/diagnostics/bufferbloat` | Bufferbloat grade A–F |
| `GET` | `/api/diagnostics/mtu` | MTU discovery |
| `GET` | `/api/diagnostics/dns-leak` | DNS leak + privacy score |
| `GET` | `/api/diagnostics/vpn-speed` | VPN speed comparison |
| `GET` | `/api/tls-probe` | TLS handshake time, HTTP/2 detection, HSTS (Rust) |
| `GET` | `/api/dns-timing` | DoH latency to 4 resolvers in parallel (Rust) |

### ML Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/predictions/next-hour` | Next hour speed forecast (LinearRegression) |
| `GET` | `/api/predictions/outage-probability` | Outage risk with natural-language message |
| `GET` | `/api/predictions/best-download-time` | Top 3 best hours to download |
| `GET` | `/api/predictions/congestion-24h` | Hourly congestion + notable_periods |
| `GET` | `/api/predictions/summary` | All four predictions + headline in one call |
| `GET` | `/api/anomalies` | Isolation Forest multi-dimensional anomaly detection |

### AI Insights
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/insights/query?q=` | Real LLM chatbot — OpenAI → Groq → keyword fallback |
| `GET` | `/api/insights/root-cause` | Root cause analysis |
| `GET` | `/api/insights/predictive-maintenance` | Maintenance predictor |
| `GET` | `/api/ai-insights` | Statistical patterns, congestion, trends |

### Internet Crisis Monitor
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/internet-crisis` | Combined local + global severity + crisis log |
| `GET` | `/api/internet-crisis/global` | 7 providers + IODA BGP (cached 5 min) |
| `GET` | `/api/internet-crisis/local` | Local speed vs 7-day baseline |
| `GET` | `/api/internet-crisis/history` | Crisis event history (up to 30 days) |
| `GET` | `/api/internet-crisis/community-impact` | Aggregated ISP breakdown + issue types |

### New in v4.0
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tls-probe?host=` | TLS handshake overhead, HTTP/2, HSTS detection |
| `GET` | `/api/dns-timing?domain=` | Parallel DoH resolver race — find the fastest |
| `GET` | `/api/multi-ping` | Ping up to 20 hosts simultaneously |

*(All v3.x endpoints remain fully compatible.)*

---

## Database Schema

```
speed_measurements      — per-device speed test results (X-Client-ID scoped)
outage_events           — structured outage log with severity + duration
community_reports       — crowd-sourced incident reports with GPS + voting
alert_configs           — per-device notification config (Telegram/Discord/SMS)
alert_logs              — alert delivery history (channel, status, timestamp)
user_preferences        — per-device UI preferences
security_scans          — port scan + privacy score results
webhooks                — custom webhook registrations (max 5/device)
api_keys                — developer API keys (hashed, max 5/device)
speed_challenges        — leaderboard entries (best download/upload per device)
user_locations          — saved monitoring locations + WiFi presence registry
isp_contracts           — per-device ISP plan details for SLA compliance tracking
test_schedules          — recurring speed test schedules (hours × days × burst)
packet_loss_readings    — TCP packet loss + jitter history per device
device_groups           — multi-device group memberships
crisis_logs             — detected crisis events: local+global severity, 30-min dedup
```

---

## Quick Start — Local Dev

```bash
# 1. Clone
git clone https://github.com/manziosee/Internet-Stability-Tracker.git
cd Internet-Stability-Tracker

# 2. Backend (Python only — Rust/Go sidecars are optional locally)
cd backend
cp .env.example .env          # fill in TURSO_DB_URL, TURSO_AUTH_TOKEN, SECRET_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. (Optional) Run Rust probe locally
cd backend/rust-probe
cargo run --release            # starts on port 8001

# 4. (Optional) Run Go agent locally
cd backend/go-agent
go run .                       # starts on port 8002

# 5. Frontend (separate terminal)
cd frontend
cp .env.example .env.local    # set REACT_APP_API_URL=http://localhost:8000/api
npm install && npm start
```

Python falls back gracefully when the sidecars are not running — all endpoints work, the Rust probe just uses Python TCP fallbacks and the cache uses the in-memory tier.

Open http://localhost:3000 — Swagger UI at http://localhost:8000/docs

---

## Docker (Single Container — all languages)

```bash
# Build the 4-stage image (C → Rust → Go → Python runtime)
docker build -t internet-stability-tracker ./backend

# Run with required secrets
docker run -p 8000:8000 \
  -e TURSO_DB_URL=libsql://your-db.turso.io \
  -e TURSO_AUTH_TOKEN=your-token \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e ADMIN_API_KEY=$(openssl rand -hex 24) \
  -e OPENAI_API_KEY=sk-proj-... \
  -e GROQ_API_KEY=gsk_... \
  internet-stability-tracker
```

The `start.sh` entrypoint starts all three binaries in order:
1. `go-agent` (port 8002) — waits for bind
2. `ist-probe` (port 8001) — waits for bind
3. `uvicorn` (port 8000) — takes over the process (`exec`)

Only port 8000 is published. The Rust and Go services are bound to `127.0.0.1` — not reachable from outside the container.

---

## Docker Compose (Full Stack with nginx)

```bash
cp .env.example .env          # fill in required secrets
docker compose up -d
```

Opens http://localhost — nginx serves the React app and proxies `/api` to FastAPI.

**Services:**
- `backend`  — all four languages in one container, port 8000 (internal)
- `frontend` — nginx serving React build + reverse proxy on port 80
- `redis`    — optional cache (backend falls back to Go LRU → in-memory if not configured)

---

## Deployment

### Backend — Fly.io

> Always run `fly deploy` from the `backend/` directory.

```bash
cd backend

fly launch --no-deploy
fly secrets set \
  TURSO_DB_URL=libsql://your-db.turso.io \
  TURSO_AUTH_TOKEN=your-token \
  SECRET_KEY=$(openssl rand -hex 32) \
  ADMIN_API_KEY=$(openssl rand -hex 24)

# LLM AI chatbot
fly secrets set OPENAI_API_KEY=sk-proj-...
fly secrets set GROQ_API_KEY=gsk_...

# Go agent service-to-service auth (optional but recommended)
fly secrets set AGENT_SERVICE_TOKEN=$(openssl rand -hex 32)

# Optional integrations
fly secrets set TELEGRAM_BOT_TOKEN=...
fly secrets set SENTRY_DSN=https://...@sentry.io/...

fly deploy --app backend-cold-butterfly-9535
```

### Frontend — Vercel

| Setting | Value |
|---------|-------|
| Framework | Create React App |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output directory | `build` |
| `REACT_APP_API_URL` | `https://backend-cold-butterfly-9535.fly.dev/api` |

### CI/CD — GitHub Actions

Auto-deploys on push to `main`. Add `FLY_API_TOKEN` to GitHub repo secrets:
```bash
fly tokens create deploy -x 999999h
```

---

## Environment Variables

### Backend (`.env` / Fly.io secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DB_URL` | ✅ | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | ✅ | Turso authentication token |
| `SECRET_KEY` | ✅ | Session secret (`openssl rand -hex 32`) |
| `ADMIN_API_KEY` | ✅ | Key for DELETE endpoint |
| `OPENAI_API_KEY` | — | OpenAI key for GPT-4o-mini chatbot |
| `GROQ_API_KEY` | — | Groq key for llama-3.1-8b fallback |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot for smart alerts |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID for SMS |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_FROM_NUMBER` | — | Twilio sender phone number |
| `REDIS_URL` | — | Redis URL (falls back to Go LRU → in-memory) |
| `SENTRY_DSN` | — | Sentry DSN for error tracking |
| `ENVIRONMENT` | — | `production` or `development` |
| `AGENT_URL` | — | Go agent URL (default: `http://127.0.0.1:8002`) |
| `AGENT_SERVICE_TOKEN` | — | Shared secret for Python → Go auth |
| `PROBE_URL` | — | Rust probe URL (default: `http://127.0.0.1:8001`) |

### Go agent tuning (read by `go-agent` binary)

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_PORT` | `8002` | Port the Go agent listens on |
| `AGENT_CACHE_MAX_SIZE` | `2000` | Maximum LRU entries |
| `AGENT_CACHE_TTL_SEC` | `30` | Default entry TTL in seconds |
| `AGENT_SERVICE_TOKEN` | — | Must match Python's `AGENT_SERVICE_TOKEN` |
| `AGENT_MAX_BODY_BYTES` | `524288` | Max POST body (512 KiB) |

### Rust probe tuning (read by `ist-probe` binary)

| Variable | Default | Description |
|----------|---------|-------------|
| `PROBE_PORT` | `8001` | Port ist-probe listens on |
| `PROBE_DEFAULT_HOST` | `8.8.8.8` | Default probe target |
| `PROBE_DEFAULT_TCP_PORT` | `443` | TCP port for RTT probes |
| `PROBE_TIMEOUT_MS` | `2000` | Per-probe timeout |
| `PROBE_MAX_CONCURRENT` | `50` | Max concurrent packet-loss probes |
| `PROBE_BANDWIDTH_URLS` | (CDN list) | Comma-separated download URLs |

### Frontend (Vercel / `.env.local`)

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Backend API URL |
| `REACT_APP_SENTRY_DSN` | Sentry DSN (optional) |

---

## Security

| Control | Implementation |
|---------|---------------|
| Rate limiting | Sliding-window per-IP **and** per-X-Client-ID |
| Admin endpoints | `DELETE /api/measurements` requires `X-Admin-Key` (timing-safe compare) |
| Device isolation | All personal queries scoped via `_scope()` using `X-Client-ID` |
| Input validation | Pydantic v2 schemas; SQLAlchemy ORM (no raw queries) |
| CORS | Locked to frontend origin in production |
| Security headers | HSTS · `X-Content-Type-Options` · `X-Frame-Options: DENY` · `Referrer-Policy` |
| API keys | SHA-256 hashed at rest; raw key shown once, never stored |
| Request size limit | 64 KB max body (Python) · 512 KB max (Go) |
| Docker | Non-root `appuser` · 4-stage build · no compilers in runtime |
| Sidecar isolation | Rust + Go services bind to `127.0.0.1` only — not externally reachable |
| Service auth | `X-Service-Token` header on Python → Go calls (optional shared secret) |
| Secrets | Environment variables / Fly.io secrets — never committed |
| C library safety | Uses `getaddrinfo` (IPv6-safe) · bounds-checked buffer · graceful `-1` on `EPERM` |

---

## Project Structure

```
Internet-Stability-Tracker/
├── backend/
│   ├── c-timing/                           ← C library (ICMP + precision timing)
│   │   ├── icmp.c                          #   ist_icmp_ping · ist_tcp_rtt_us · ist_monotonic_ns
│   │   └── icmp.h
│   ├── rust-probe/                         ← Rust probe service (port 8001)
│   │   ├── build.rs                        #   links libisttime.a via cc crate
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs                     #   Axum HTTP server
│   │       ├── config.rs                   #   env-var config (zero hardcoded values)
│   │       ├── ffi.rs                      #   safe Rust wrappers for C functions
│   │       ├── models.rs                   #   request/response types
│   │       └── routes/
│   │           ├── ping.rs                 #   single TCP RTT
│   │           ├── packet_loss.rs          #   concurrent probes, p95 latency
│   │           ├── jitter.rs               #   RFC 3550 jitter + stdev
│   │           ├── bandwidth.rs            #   async HTTP stream → Mbps
│   │           ├── traceroute.rs           #   subprocess + ASN labels
│   │           ├── mtu.rs                  #   path MTU estimation
│   │           ├── tls_probe.rs            #   TLS overhead · HTTP/2 · HSTS
│   │           ├── dns_timing.rs           #   parallel DoH to 4 resolvers
│   │           └── multi_ping.rs           #   ≤20 hosts parallel
│   ├── go-agent/                           ← Go agent (port 8002)
│   │   ├── go.mod                          #   stdlib only — zero external deps
│   │   ├── main.go                         #   HTTP server + all handlers
│   │   ├── config.go                       #   env-var config
│   │   ├── cache.go                        #   LRU + TTL eviction
│   │   └── hub.go                          #   SSE broadcast hub
│   ├── app/
│   │   ├── api/routes.py                   #   80+ endpoints + WebSocket
│   │   ├── core/config.py                  #   Pydantic-settings (PROBE_URL, AGENT_URL, ...)
│   │   ├── core/database.py                #   Turso/libSQL connection
│   │   ├── models/measurement.py           #   SQLAlchemy models (16 tables)
│   │   └── services/
│   │       ├── speed_test.py               #   speedtest-cli wrapper
│   │       ├── advanced_diagnostics.py     #   calls Rust probe + Python fallback
│   │       ├── cache_service.py            #   Go LRU → Redis → in-memory
│   │       ├── llm_service.py              #   OpenAI → Groq → keyword fallback
│   │       ├── ml_predictions.py           #   scikit-learn + Isolation Forest
│   │       ├── ai_insights_enhanced.py     #   NL chatbot (20+ paths)
│   │       ├── network_security.py         #   port scan, privacy score
│   │       ├── smart_alerts.py             #   Telegram, Discord, SMS
│   │       ├── sla_tracker.py              #   ISP SLA compliance
│   │       ├── health_score.py             #   composite 0–100 score
│   │       ├── weekly_report.py            #   NL weekly summary
│   │       ├── throttle_detector.py        #   4-CDN throttle probe
│   │       └── crisis_service.py           #   7 providers + IODA + community
│   ├── Dockerfile                          ←  4-stage: C → Rust → Go → Python
│   ├── start.sh                            ←  process supervisor (all 3 binaries)
│   ├── fly.toml                            ←  2 vCPU · 2 GB RAM · lhr region
│   ├── .env.example                        ←  all env vars documented
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/                     #   30+ page components
│   │   ├── services/api.js                 #   Axios client (110+ endpoints)
│   │   └── App.js                          #   Router + navigation
│   └── package.json
├── browser-extension/                      ←  Manifest V3, Chrome + Firefox
├── docker-compose.yml                      ←  backend + frontend + redis
├── postman_collection.json                 ←  110+ pre-configured requests
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-fly.yml
│   └── docker-image.yml
└── vercel.json
```

---

## Browser Extension

```bash
# Load in Chrome
1. Open chrome://extensions/
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the browser-extension/ folder

# Load in Firefox
1. Go to about:debugging#/runtime/this-firefox
2. "Load Temporary Add-on"
3. Select browser-extension/manifest.json
```

The extension shares the same `ist_client_id` UUID as the web app — test history is unified.

---

## Postman Collection

Import `postman_collection.json` — 110+ pre-configured requests across 23 folders.

Set `base_url` to `http://localhost:8000/api` for local dev or leave it pointing at the live API. Set `client_id` to your browser's `ist_client_id` from localStorage to test device-scoped endpoints.

---

## Pages

### Core
| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Real-time speed stats, quality score, ISP comparison |
| Status | `/status` | Global platform health, 7-day daily summary |
| Outage Map | `/map` | Community-reported incidents on Leaflet map |
| Report Issue | `/report` | Submit crowd-sourced network issue with GPS |
| ISP Reliability | `/isp` | Per-ISP letter grades and weighted leaderboard |
| Cool Features | `/cool` | Gaming mode, video calls, router health |
| Diagnostics | `/diagnostics-advanced` | Packet loss, jitter, bufferbloat, MTU, DNS leak, VPN, TLS, DNS timing |
| Crisis Monitor | `/crisis` | Live local + global crisis detection — 7 providers, IODA BGP |

### Analytics & AI
| Page | Path | Description |
|------|------|-------------|
| AI Insights | `/ai-enhanced` | LLM chatbot (OpenAI → Groq → keyword), root cause, predictive maintenance |
| Historical | `/history` | Heatmap calendar, distribution, percentiles, correlation |
| Advanced Insights | `/advanced` | Anomaly detection (Isolation Forest), comparison, multi-region |
| Security | `/security` | Port scan, privacy score, VPN recommendations |
| Smart Alerts | `/alerts` | Telegram, Discord, SMS, custom webhooks, alert log |

### ISP & Performance
| Page | Path | Description |
|------|------|-------------|
| Health Score | `/health-score` | Composite 0–100 score A+→F |
| ISP SLA | `/isp-sla` | Promised vs actual compliance |
| Throttle Detector | `/throttle` | Multi-CDN throttle probe |
| Cost Calculator | `/cost-calc` | Cost per Mbps vs benchmarks |
| Weekly Report | `/weekly-report` | 7-day summary with week-over-week trends |
| ISP Contract | `/isp-contract` | Save plan, track SLA compliance |
| Network Certificate | `/certificate` | Printable A+→F quality certificate |
| Best Time | `/best-time` | 24-hour speed profile + activity recommendations |
| Multi-Device | `/multi-device` | Link devices via WiFi code, cross-device comparison |
| WFH Score | `/wfh-score` | Work-from-home suitability across 8 apps |

---

## 📚 Documentation
- **[Browser Extension](browser-extension/README.md)** — Extension installation guide

---

<div align="center">
Built with Python · Rust · Go · C · React · scikit-learn · Turso · Fly.io · Vercel
</div>
