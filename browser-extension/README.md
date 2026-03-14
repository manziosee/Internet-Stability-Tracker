# Internet Stability Tracker — Browser Extension

A Manifest V3 Chrome/Firefox extension that auto-tests your internet speed and monitors stability in real time.

## Features

- 🚀 **Auto Speed Test** — runs on a configurable interval (5–120 min) using Chrome Alarms API
- 📊 **Popup Dashboard** — live download, upload, ping stats from your last test
- 🔴 **Outage Alerts** — notifies you when your connection status changes to degraded/outage
- ⚡ **Slow Speed Alerts** — notifies you when download speed falls below your threshold
- 🔒 **Private** — same anonymous UUID as the web app, so your data is unified across both
- ⚙️ **Options Page** — configure test interval, speed threshold, and notification preferences

## Installation (Chrome)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `browser-extension/` folder from this repository

## Installation (Firefox)

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `browser-extension/manifest.json`

## Adding Icons

Place PNG icons in `browser-extension/icons/`:
- `icon16.png`  — 16×16 px
- `icon32.png`  — 32×32 px
- `icon48.png`  — 48×48 px
- `icon128.png` — 128×128 px

You can generate these from any IST logo SVG using Inkscape, Figma, or an online converter.

## How It Works

| Component | Description |
|-----------|-------------|
| `background.js` | Service worker — handles alarms, runs speed tests, checks status, sends notifications |
| `popup.html/js`  | Extension popup — shows current status + last test results, manual test trigger |
| `options.html/js`| Settings page — interval, thresholds, notification toggles |
| `manifest.json`  | Manifest V3 — declares permissions (storage, alarms, notifications) |

## Data Flow

```
Chrome Alarm fires every N minutes
  → background.js calls POST /api/test-now with X-Client-ID
  → Result stored in chrome.storage.local
  → Popup reads from storage to display latest stats
  → Notifications sent if thresholds exceeded
```

The same `ist_client_id` UUID stored in `chrome.storage.local` is also used as `X-Client-ID` in the web app (via localStorage). This means speed tests from the extension and the web app are unified under the same device identity.
