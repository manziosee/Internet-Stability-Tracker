<div align="center">

# 🌐 Internet Stability Tracker

**Community-driven network monitoring — real-time speed, outage detection, AI insights, ML predictions, and security analysis**

[![Build Docker](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml/badge.svg)](https://github.com/manziosee/Internet-Stability-Tracker/actions/workflows/docker-image.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://reactjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Fly.io](https://img.shields.io/badge/Fly.io-deployed-8B5CF6?logo=fly.io&logoColor=white)](https://fly.io)
[![Vercel](https://img.shields.io/badge/Vercel-deployed-000000?logo=vercel&logoColor=white)](https://vercel.com)
![Version](https://img.shields.io/badge/API_version-3.4.0-brightgreen)

</div>

---

## Live Demo

| Service | URL |
|---------|-----|
| 🖥️ Frontend | https://internet-stability-tracker.vercel.app |
| ⚡ API | https://backend-cold-butterfly-9535.fly.dev/api |
| 📖 Swagger UI | http://localhost:8000/docs *(local dev only — disabled in production)* |
| 📚 ReDoc | http://localhost:8000/redoc *(local dev only — disabled in production)* |
| 🔌 WebSocket | `wss://backend-cold-butterfly-9535.fly.dev/api/ws/live` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
│                                                                          │
│  ┌─────────────────────┐        ┌──────────────────────────────────┐    │
│  │  React 18 SPA        │        │  Browser Extension (MV3)         │    │
│  │  (Vercel CDN)        │        │  Chrome / Firefox                │    │
│  │  Material UI v6      │        │  auto-test + notifications       │    │
│  │  Framer Motion       │        └─────────────┬────────────────────┘    │
│  │  Recharts / Leaflet  │                      │                         │
│  └──────────┬──────────┘                      │                         │
│             │  HTTPS REST + WebSocket          │  HTTPS REST             │
└─────────────┼────────────────────────────────-┼─────────────────────────┘
              │                                  │
              ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY LAYER                               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │               FastAPI 0.104  (Fly.io — lhr region)                 │  │
│  │                                                                    │  │
│  │  Request Pipeline:                                                 │  │
│  │  ① CORS middleware         → validates allowed origins            │  │
│  │  ② Security headers        → HSTS, X-Frame-Options, CSP           │  │
│  │  ③ Rate limiter            → sliding window per IP + X-Client-ID  │  │
│  │  ④ Request size guard      → 64 KB max body                       │  │
│  │  ⑤ X-Client-ID extractor  → device UUID from header              │  │
│  │  ⑥ Router dispatch         → API endpoint handler                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          SERVICE LAYER                                   │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ SpeedTest    │  │ AI Insights  │  │ ML Predictor │  │ Network    │  │
│  │ Service      │  │ Enhanced     │  │ (scikit-learn│  │ Security   │  │
│  │              │  │ 20+ NL paths │  │  LinearReg)  │  │ (port scan,│  │
│  │ speedtest-cli│  │              │  │              │  │  DNS leak) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Crisis Service                                                   │   │
│  │  • 7 Atlassian Statuspage providers (Cloudflare, GitHub,        │   │
│  │    Discord, Reddit, Atlassian, Stripe, Twilio)                  │   │
│  │  • IODA BGP routing health (Georgia Tech public API)            │   │
│  │  • Local speed vs 7-day baseline analysis                       │   │
│  │  • CrisisLog DB persistence with 30-min deduplication           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│         │                 │                  │                 │         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Advanced     │  │ SLA Tracker  │  │ Health Score │  │ Weekly     │  │
│  │ Diagnostics  │  │              │  │ (composite   │  │ Report     │  │
│  │ (bufferbloat,│  │ promised vs  │  │  0–100)      │  │ Generator  │  │
│  │  MTU, jitter)│  │ actual)      │  │              │  │            │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Throttle     │  │ Smart Alerts │  │ Cache        │  │ Webhook    │  │
│  │ Detector     │  │ (Telegram,   │  │ Service      │  │ Dispatcher │  │
│  │ (4-CDN probe)│  │  Discord,SMS)│  │ Redis/Memory │  │            │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                      │
│                                                                          │
│  ┌──────────────────────────────┐   ┌────────────────────────────────┐  │
│  │   Turso (libSQL cloud)        │   │   In-memory TTL cache          │  │
│  │   SQLAlchemy 2 ORM            │   │   (Redis fallback)             │  │
│  │                               │   └────────────────────────────────┘  │
│  │   Tables:                     │                                       │
│  │   • speed_measurements        │   ┌────────────────────────────────┐  │
│  │   • outage_events             │   │   External APIs                │  │
│  │   • community_reports         │   │   • ip-api.com (geo lookup)    │  │
│  │   • alert_configs             │   │   • ipapi.co  (fallback)       │  │
│  │   • alert_logs                │   │   • Telegram Bot API           │  │
│  │   • user_preferences          │   │   • Discord Webhooks           │  │
│  │   • security_scans            │   │   • Twilio SMS                 │  │
│  │   • webhooks                  │   │   • Atlassian Statuspage APIs  │  │
│  │   • api_keys                  │   │     (7 providers, no auth)     │  │
│  │   • speed_challenges          │   │   • IODA BGP API (Georgia Tech)│  │
│  │   • user_locations            │   └────────────────────────────────┘  │
│  │   • crisis_logs               │                                       │
│  └──────────────────────────────┘                                       │
└──────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       BACKGROUND JOBS (APScheduler)                      │
│                                                                          │
│  Every :55 min → Hourly aggregation + outage transition detection        │
│  Monday 08:00  → Weekly report + alert delivery                          │
│  On demand     → Smart alert evaluation after each speed test            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Speed Test Flow
```
User clicks "Run Speed Test"
  │
  ├─ Frontend POST /api/test-now  { X-Client-ID: <uuid> }
  │
  ├─ Backend: SpeedTestService.run()
  │     ├─ speedtest-cli measures download/upload/ping
  │     ├─ Geo lookup (ip-api.com) → ISP, city, country, lat/lng
  │     ├─ SpeedMeasurement saved to Turso DB  (scoped to client_id)
  │     └─ Outage detection: if download < 1 Mbps → OutageEvent created
  │
  ├─ Smart alert evaluation
  │     ├─ Load AlertConfig for device
  │     ├─ Compare vs thresholds (min_download, max_ping)
  │     └─ If breach → dispatch to Telegram / Discord / SMS / Webhooks
  │
  └─ Response: { download_speed, upload_speed, ping, isp, location, ... }
       └─ Frontend updates Dashboard, Health Score, weekly stats
```

### AI Chatbot Flow
```
User types question in AI Troubleshooting Assistant
  │
  ├─ GET /api/insights/query?q=<question>  { X-Client-ID }
  │
  ├─ Backend: answer_natural_query()
  │     ├─ Load last 7 days measurements for this device
  │     ├─ Compute: avg_dl, avg_ul, avg_ping, outage_count, best/worst hour
  │     ├─ Keyword routing (20+ patterns):
  │     │     "hi/hello"        → greeting + live stats snapshot
  │     │     "upload"          → focused upload analysis
  │     │     "download"        → download speed breakdown
  │     │     "compare"         → upload vs download ratio
  │     │     "gaming/fps"      → ping grade A–D, suitability verdict
  │     │     "video call"      → jitter + bandwidth check
  │     │     "streaming"       → buffer assessment
  │     │     "slow/why"        → root cause analysis
  │     │     "best time"       → best hour from historical data
  │     │     "outage/down"     → outage count + recovery info
  │     │     "ping/latency"    → ping quality label
  │     │     "isp"             → ISP comparison from community data
  │     │     "weekly/summary"  → week-over-week delta
  │     │     default           → general health overview
  │     └─ Returns { answer: "...", ...contextual_data }
  │
  └─ Frontend renders answer string (never a fallback placeholder)
```

### Device Isolation Flow
```
New browser / incognito tab opens the app
  │
  ├─ Frontend: getClientId()
  │     ├─ Check localStorage for 'ist_client_id'
  │     ├─ If missing → crypto.randomUUID() → store in localStorage
  │     └─ Attach as X-Client-ID header on every API request
  │
  ├─ Backend: get_client_id(request)
  │     └─ Reads X-Client-ID header → passed to _scope() helper
  │
  ├─ _scope(query, client_id)
  │     ├─ If client_id present  → .filter(SpeedMeasurement.client_id == client_id)
  │     └─ If client_id missing  → .filter(False)  ← never leak other users' data
  │
  └─ Result: new user always sees empty state until they run their first test
```

### ML Prediction Flow
```
GET /api/predictions/summary  { X-Client-ID }
  │
  ├─ Load last 14 days of measurements for device
  │
  ├─ NetworkPredictor.predict_next_hour_speed()
  │     ├─ LinearRegression on (timestamp → download_speed)
  │     ├─ Day-of-week weighting (weekday vs weekend patterns)
  │     ├─ Compute slope, R², confidence interval
  │     └─ Returns predicted_download, predicted_upload, predicted_ping, message
  │
  ├─ NetworkPredictor.predict_outage_probability()
  │     ├─ Count recent outages, compute trend
  │     └─ Returns probability %, risk_level (low/medium/high), message
  │
  ├─ NetworkPredictor.find_best_download_time()
  │     ├─ Aggregate by hour-of-day → rank by speed
  │     └─ Returns best_hour, worst_hour, top 3 windows
  │
  ├─ NetworkPredictor.predict_congestion_24h()
  │     ├─ Project next 24 hours using historical hour patterns
  │     └─ Returns hourly congestion scores + notable_periods text
  │
  └─ Aggregate into summary { headline, data_quality, full_predictions }
```

### Browser Extension Flow
```
Chrome Alarm fires every N minutes (configured in options)
  │
  ├─ background.js: runSpeedTest()
  │     ├─ POST /api/test-now  { X-Client-ID: <same uuid as web app> }
  │     ├─ Store result in chrome.storage.local
  │     └─ If download < threshold → chrome.notifications.create()
  │
  ├─ background.js: checkStatus()
  │     ├─ GET /api/status
  │     └─ If outage detected + previous was healthy → outage notification
  │
  └─ popup.js reads chrome.storage.local → renders metrics in popup
       (no API call needed — data already cached from last alarm)
```

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
| ![scikit-learn](https://img.shields.io/badge/-scikit--learn-F7931E?logo=scikit-learn&logoColor=white&style=flat) | scikit-learn | ML speed predictions |
| ![Docker](https://img.shields.io/badge/-Docker-2496ED?logo=docker&logoColor=white&style=flat) | Docker (multi-stage) | Containerisation |
| ![Fly.io](https://img.shields.io/badge/-Fly.io-8B5CF6?logo=fly.io&logoColor=white&style=flat) | Fly.io | Backend hosting (lhr) |
| ![Vercel](https://img.shields.io/badge/-Vercel-000000?logo=vercel&logoColor=white&style=flat) | Vercel | Frontend hosting |
| ![GitHub Actions](https://img.shields.io/badge/-GitHub_Actions-2088FF?logo=github-actions&logoColor=white&style=flat) | GitHub Actions | CI/CD pipelines |
| ![APScheduler](https://img.shields.io/badge/-APScheduler-FF9800?style=flat) | APScheduler 3 | Background jobs |
| ![Sentry](https://img.shields.io/badge/-Sentry-362D59?logo=sentry&logoColor=white&style=flat) | Sentry SDK | Error tracking (opt-in) |
| Chrome Extension | Manifest V3 | Browser auto-test agent |

---

## Pages

### Core
| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Real-time speed stats, quality score, ISP comparison, live bandwidth |
| Status | `/status` | Global platform health, 7-day daily summary |
| Outage Map | `/map` | Community-reported incidents on an interactive Leaflet map |
| Report Issue | `/report` | Submit a crowd-sourced network issue with GPS |
| ISP Reliability | `/isp` | Per-ISP letter grades and weighted leaderboard |
| Cool Features | `/cool` | Gaming mode, video calls, router health, activity recommendations |
| Diagnostics | `/diagnostics-advanced` | OS, public IP, location, + packet loss, jitter, bufferbloat, MTU, DNS leak, VPN speed |
| **Crisis Monitor** | `/crisis` | **Live local + global internet crisis detection — 7 providers, IODA BGP, history, community impact** |

### Analytics & AI
| Page | Path | Description |
|------|------|-------------|
| AI Insights Enhanced | `/ai-enhanced` | NL chatbot (20+ query paths), root cause, predictive maintenance |
| Historical Data | `/history` | Heatmap calendar, distribution histogram, percentiles, correlation |
| Advanced Insights | `/advanced` | Heatmap, anomaly detection (±2σ), comparison, multi-region, PDF |
| Security | `/security` | Port scan, privacy score, intrusion detection, VPN recommendations |
| Smart Alerts | `/alerts` | Telegram, Discord, SMS, custom webhooks, alert log, quiet hours |

### New in v3.2
| Page | Path | Description |
|------|------|-------------|
| Health Score | `/health-score` | Composite 0–100 score with grade A+→F and improvement tips |
| Leaderboard | `/leaderboard` | Community speed rankings — submit and compete |
| ISP SLA Tracker | `/isp-sla` | Promised vs actual speed compliance with grade and % |
| Throttle Detector | `/throttle` | Multi-CDN probe to detect selective ISP throttling |
| Cost Calculator | `/cost-calc` | Cost per Mbps vs US/global benchmarks |
| Weekly Report | `/weekly-report` | Natural-language 7-day summary with week-over-week trends |
| Before/After | `/before-after` | Compare two date ranges to measure upgrade impact |
| ISP Report Card | `/isp-report` | Community-aggregated ISP grades based on real tests |
| Export Data | `/export` | Download your history as CSV or JSON |
| API Keys | `/api-keys` | Generate developer API keys (max 5 per device) |

### New in v3.3
| Page | Path | Description |
|------|------|-------------|
| ISP Contract | `/isp-contract` | Save plan details, track SLA compliance (promised vs actual %) |
| Network Certificate | `/certificate` | Printable A+→F quality certificate with per-metric breakdown |
| Best Time | `/best-time` | 24-hour speed profile — best window + activity recommendations |
| Multi-Device | `/multi-device` | Link devices via WiFi network code (QR + 6-char code); cross-device comparison |
| DNS Monitor | `/dns-monitor` | Per-resolver latency test with pass/fail verdict |
| Complaint Letter | `/complaint-letter` | Auto-generates ISP complaint letter from your measured data |
| Scheduled Tests | `/scheduled-tests` | Configure recurring tests by hour/day with burst support |
| Packet Loss | `/packet-loss` | TCP-based packet loss & jitter monitor with history sparkline |
| WFH Score | `/wfh-score` | Work-from-home suitability across 8 apps (Zoom, Slack, Teams…) |

### New in v3.4
| Page | Path | Description |
|------|------|-------------|
| Crisis Monitor | `/crisis` | Live local + global crisis detection with 4-tab UI: real-time status, history timeline, community ISP impact, and educational content about internet infrastructure |

---

## API Endpoints (v3.3)

### Core
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/test-now` | Run on-demand speed test |
| `GET`  | `/api/my-connection` | Caller IP, ISP, location (scoped to device) |
| `GET`  | `/api/status` | Global health + 7-day daily summary |
| `GET`  | `/api/stats` | Aggregated uptime %, averages |
| `GET`  | `/api/quality-score` | Composite 0–100 quality score |
| `GET`  | `/api/measurements` | Paginated test history |
| `WS`   | `/api/ws/live` | Real-time measurement push + heartbeat |

### ML Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/predictions/next-hour` | Next hour speed forecast (LinearRegression) |
| `GET` | `/api/predictions/outage-probability` | Outage risk with natural-language message |
| `GET` | `/api/predictions/best-download-time` | Top 3 best hours to download |
| `GET` | `/api/predictions/congestion-24h` | Hourly congestion + notable_periods |
| `GET` | `/api/predictions/summary` | All four predictions + headline in one call |

### AI Insights
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/insights/query?q=` | NL chatbot — 20+ query patterns, always returns `answer` |
| `GET` | `/api/insights/root-cause` | Root cause analysis |
| `GET` | `/api/insights/predictive-maintenance` | Maintenance predictor |
| `GET` | `/api/ai-insights` | Statistical patterns, congestion, trends |
| `GET` | `/api/anomalies` | Z-score outlier detection (±2σ) |

### New in v3.2
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/health-score` | Composite 0–100 health score with grade + tips |
| `GET`  | `/api/sla/analyze` | ISP SLA compliance — promised vs actual |
| `GET`  | `/api/throttle/detect` | Multi-CDN throttle probe (4 providers) |
| `GET`  | `/api/cost-calculator` | Cost per Mbps vs benchmarks |
| `GET`  | `/api/reports/weekly` | Natural-language weekly report |
| `GET`  | `/api/comparison/before-after` | Before/after date range comparison |
| `GET`  | `/api/leaderboard` | Top community speeds |
| `POST` | `/api/leaderboard/submit` | Submit your best speed |
| `GET`  | `/api/export/csv` | Download measurements as CSV |
| `GET`  | `/api/export/json` | Download measurements as JSON |
| `GET/POST/DELETE` | `/api/api-keys` | Developer API key management |
| `GET`  | `/api/isp-report-card` | Community ISP grades |
| `POST` | `/api/integrations/test-webhook` | Test Slack / Teams webhook |
| `GET/POST/DELETE` | `/api/webhooks` | Custom webhook CRUD |
| `POST` | `/api/webhooks/test/{id}` | Fire test payload to webhook |
| `GET`  | `/api/alerts/log` | Alert delivery history |
| `GET`  | `/api/metrics` | Prometheus metrics (Grafana scraping) |

### New in v3.3
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/contract` | Save / retrieve ISP contract details |
| `GET` | `/api/contract/compliance` | Promised vs actual compliance report |
| `GET` | `/api/certificate` | Generate network quality certificate |
| `GET` | `/api/best-time` | 24-hour speed profile + best window |
| `GET` | `/api/devices/my-groups` | List device groups for this device |
| `GET` | `/api/devices/nearby` | Discover devices on same WiFi (public IP match) |
| `POST` | `/api/devices/link` | Link device to a group (auto-generates group ID) |
| `DELETE` | `/api/devices/link/{group_id}` | Unlink from a device group |
| `GET` | `/api/devices/compare` | Cross-device performance comparison |
| `GET` | `/api/dns-test` | Per-resolver DNS latency test |
| `GET` | `/api/complaint-letter` | Generate ISP complaint letter from measured data |
| `GET/POST/PUT/DELETE` | `/api/schedules` | Scheduled speed test CRUD |
| `POST` | `/api/packet-loss/run` | Run TCP packet loss + jitter test |
| `GET` | `/api/packet-loss/history` | Packet loss test history |
| `GET` | `/api/neighborhood-outages` | Community outages filtered by proximity |
| `GET` | `/api/wfh-score` | Work-from-home connection quality score |
| `GET` | `/api/uptime-calendar` | 90-day uptime heatmap |
| `GET` | `/api/isp-community-status` | Aggregated ISP health across all users |
| `GET` | `/api/speed-trend` | Multi-week speed trend (improving/stable/declining) |

### Internet Crisis Monitor (v3.4)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/internet-crisis` | Combined local + global severity, contextual alert message, logs event |
| `GET` | `/api/internet-crisis/global` | Live status from 7 providers + IODA BGP (cached 5 min) |
| `GET` | `/api/internet-crisis/local` | Local speed vs 7-day baseline — download, upload, ping, jitter, ISP |
| `GET` | `/api/internet-crisis/history?days=7` | Crisis event history from DB (up to 30 days) |
| `GET` | `/api/internet-crisis/community-impact?hours=24` | Aggregated ISP breakdown, issue types, unresolved outages |

### Advanced Diagnostics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/diagnostics/all` | Full diagnostic suite |
| `GET` | `/api/diagnostics/packet-loss` | Packet loss % |
| `GET` | `/api/diagnostics/jitter` | Jitter measurement |
| `GET` | `/api/diagnostics/bufferbloat` | Bufferbloat test (CDN fallback list) |
| `GET` | `/api/diagnostics/mtu` | MTU discovery |
| `GET` | `/api/diagnostics/dns-leak` | DNS leak detection |
| `GET` | `/api/diagnostics/vpn-speed` | VPN speed comparison |

### Security
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/security/audit` | Full security audit |
| `GET` | `/api/security/port-scan` | Port scan |
| `GET` | `/api/security/privacy-score` | Privacy score (secure DNS check) |
| `GET` | `/api/security/vpn-recommendation` | VPN recommendation |

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
device_groups           — multi-device group memberships for cross-device comparison
crisis_logs             — detected crisis events: local+global severity, affected providers, 30-min dedup
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| React 18 + CRA | Frontend SPA | 30+ pages, MUI v6, Recharts, Leaflet |
| FastAPI 0.104 | REST API + WebSocket | 80+ endpoints, Pydantic v2, SQLAlchemy 2 |
| Turso (libSQL) | Cloud database | Edge SQLite, per-device data isolation |
| scikit-learn | ML predictions | LinearRegression speed forecasting |
| APScheduler | Background jobs | Hourly aggregation, weekly report, alert eval |
| Redis / memory | Cache | TTL cache with in-memory fallback |
| Fly.io | Backend hosting | lhr region, 1 machine always warm, HTTPS |
| Vercel | Frontend hosting | CDN, auto-deploy from GitHub |
| Chrome MV3 | Browser extension | Auto-test, popup dashboard, notifications |
| Docker | Containerisation | Multi-stage build, non-root user |
| GitHub Actions | CI/CD | Deploy on push to `main` |
| Sentry | Error tracking | Opt-in, activates on `SENTRY_DSN` |

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
docker build -t internet-stability-tracker ./backend
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

**Services:**
- `backend`  — FastAPI on port 8000 (internal)
- `frontend` — nginx serving React build + reverse proxy on port 80
- `redis`    — optional cache (backend falls back to in-memory if not configured)

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

The extension uses the same `ist_client_id` UUID as the web app — your test history is unified.

---

## Deployment

### Backend — Fly.io

> **Important:** Always run `fly deploy` from the `backend/` directory. Running it from the project root will pick up `frontend/Dockerfile` (nginx) instead of `backend/Dockerfile` (Python/uvicorn).

```bash
cd backend
fly launch --no-deploy
fly secrets set \
  TURSO_DB_URL=libsql://your-db.turso.io \
  TURSO_AUTH_TOKEN=your-token \
  SECRET_KEY=$(openssl rand -hex 32) \
  ADMIN_API_KEY=$(openssl rand -hex 24)

# Optional integrations
fly secrets set TELEGRAM_BOT_TOKEN=...
fly secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=...
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
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot for smart alerts |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID for SMS alerts |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_FROM_NUMBER` | — | Twilio sender phone number |
| `REDIS_URL` | — | Redis URL (falls back to in-memory cache) |
| `ALERT_WEBHOOK_URL` | — | Fallback webhook for outage alerts |
| `SENTRY_DSN` | — | Sentry DSN for error tracking |
| `ENVIRONMENT` | — | `production` or `development` |

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
| Admin endpoints | `DELETE /api/measurements` requires `X-Admin-Key` header (HMAC timing-safe compare) |
| Device isolation | All personal queries scoped via `_scope()` helper using `X-Client-ID` |
| Input validation | Pydantic v2 schemas; SQLAlchemy ORM (no raw queries) |
| CORS | Locked to frontend origin in production |
| Security headers | HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` |
| API keys | SHA-256 hashed at rest; raw key shown once, never stored |
| Request size limit | 64 KB max body |
| Docker | Non-root `appuser`, multi-stage builds |
| Secrets | Environment variables / Fly.io secrets — never committed |

---

## Project Structure

```
Internet-Stability-Tracker/
├── backend/
│   ├── app/
│   │   ├── api/routes.py                   # 80+ endpoints + WebSocket
│   │   ├── core/config.py                  # Pydantic-settings config
│   │   ├── core/database.py                # Turso/libSQL connection
│   │   ├── models/measurement.py           # SQLAlchemy models (16 tables incl. crisis_logs)
│   │   ├── services/
│   │   │   ├── speed_test.py               # speedtest-cli wrapper
│   │   │   ├── ai_insights_enhanced.py     # NL chatbot (20+ paths)
│   │   │   ├── ml_predictions.py           # scikit-learn forecasts
│   │   │   ├── advanced_diagnostics.py     # packet loss, jitter, bufferbloat
│   │   │   ├── network_security.py         # port scan, privacy score
│   │   │   ├── smart_alerts.py             # Telegram, Discord, SMS
│   │   │   ├── sla_tracker.py              # ISP SLA compliance
│   │   │   ├── health_score.py             # composite 0–100 score
│   │   │   ├── weekly_report.py            # NL weekly summary
│   │   │   ├── throttle_detector.py        # 4-CDN throttle probe
│   │   │   ├── cache_service.py            # Redis + in-memory fallback
│   │   │   └── crisis_service.py           # crisis detection: 7 providers, IODA, history, community impact
│   │   ├── scheduler.py                    # APScheduler background jobs
│   │   └── main.py                         # FastAPI app, middleware, lifespan
│   ├── Dockerfile
│   ├── fly.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.js
│   │   │   ├── AdvancedDiagnosticsPage.js  # My Connection + all diagnostics
│   │   │   ├── AIInsightsEnhancedPage.js   # NL chatbot + ML predictions
│   │   │   ├── SmartAlertsPage.js          # Telegram/Discord/SMS/webhooks
│   │   │   ├── NetworkHealthPage.js        # 0–100 health score
│   │   │   ├── LeaderboardPage.js          # Community speed rankings
│   │   │   ├── ISPSLAPage.js               # SLA compliance tracker
│   │   │   ├── ThrottleDetectorPage.js     # CDN throttle probe
│   │   │   ├── CostCalculatorPage.js       # Cost per Mbps
│   │   │   ├── WeeklyReportPage.js         # Weekly summary
│   │   │   ├── BeforeAfterPage.js          # Before/after comparison
│   │   │   ├── ISPReportCardPage.js        # Community ISP grades
│   │   │   ├── ExportPage.js               # CSV / JSON export
│   │   │   ├── APIKeysPage.js              # Developer API key management
│   │   │   ├── ISPContractPage.js          # ISP contract + SLA compliance (v3.3)
│   │   │   ├── CertificatePage.js          # Network quality certificate (v3.3)
│   │   │   ├── BestTimePage.js             # 24h best-time recommender (v3.3)
│   │   │   ├── MultiDevicePage.js          # WiFi device linking + comparison (v3.3)
│   │   │   ├── DNSMonitorPage.js           # DNS resolver latency test (v3.3)
│   │   │   ├── ComplaintLetterPage.js      # ISP complaint letter generator (v3.3)
│   │   │   ├── ScheduledTestsPage.js       # Scheduled speed tests CRUD (v3.3)
│   │   │   ├── PacketLossPage.js           # TCP packet loss + jitter (v3.3)
│   │   │   ├── WFHScorePage.js             # Work-from-home score (v3.3)
│   │   │   ├── UptimeCalendarPage.js       # 90-day uptime heatmap (v3.3)
│   │   │   ├── ISPCommunityPage.js         # ISP community health (v3.3)
│   │   │   ├── SpeedTrendPage.js           # Multi-week speed trend (v3.3)
│   │   │   └── InternetCrisisPage.js       # Crisis Monitor — live status, history, community, education (v3.4)
│   │   ├── services/api.js                 # Axios client + cold-start retry (110+ endpoints)
│   │   └── App.js                          # Router + navigation (30+ pages)
│   └── package.json
├── browser-extension/
│   ├── manifest.json                       # Manifest V3
│   ├── background.js                       # Service worker + alarms
│   ├── popup.html / popup.js               # Extension popup
│   ├── options.html / options.js           # Settings page
│   └── README.md
├── docker-compose.yml                      # Full stack: backend + frontend + redis
├── postman_collection.json                 # Pre-configured (v3.3, 100+ requests)
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-fly.yml
│   └── docker-image.yml
└── vercel.json
```

---

## Postman Collection

Import `postman_collection.json` — 110+ pre-configured requests across 23 folders.

The `base_url` variable defaults to the live production API. Change it to `http://localhost:8000/api` for local development. Set `client_id` to your browser's `ist_client_id` from localStorage to test device-scoped endpoints.

**Folders:** Health · Speed Test · Measurements · Statistics · Outages · ISP · Community Reports · Diagnostics · Security · Historical · AI Insights · ML Predictions · Smart Alerts · Webhooks · Monitoring · v3.2 Features (SLA, Throttle, Health Score, Cost, Leaderboard, Export, API Keys) · v3.3 Features (ISP Contract, Certificate, Best Time, Multi-Device, DNS Monitor, Complaint Letter, Schedules, Packet Loss, WFH Score) · **v3.4 — Internet Crisis Monitor** (combined status, global, local, history, community impact)

---

## 📚 Documentation
- **[Browser Extension](browser-extension/README.md)** — Extension installation guide

---

<div align="center">
Built with ❤️ using FastAPI, React, scikit-learn, Turso, Fly.io, and Vercel
</div>
