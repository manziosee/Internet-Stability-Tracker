# NetPulse — Browser Extension

A Manifest V3 Chrome/Firefox extension that auto-tests your internet speed, monitors stability in real time, and alerts you when an internet crisis is detected.

> **Store name:** NetPulse — Internet Speed & Stability Tracker
> Search for "NetPulse" in the Chrome Web Store or Firefox Add-ons to find it.

## Features

- 🚀 **Auto Speed Test** — runs on a configurable interval (5–120 min) using Chrome Alarms API
- 📊 **Popup Dashboard** — live download, upload, ping stats from your last test
- 🔴 **Outage Alerts** — notifies you when your connection status changes to degraded/outage
- ⚡ **Slow Speed Alerts** — notifies you when download speed falls below your threshold
- 🌐 **Crisis Monitor** — polls `/api/internet-crisis` and notifies you when global infrastructure providers (Cloudflare, GitHub, Discord, etc.) are reporting incidents
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

You can generate these from any NetPulse/IST logo SVG using Inkscape, Figma, or an online converter.

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
  → background.js calls GET /api/internet-crisis
      → If combined_severity is "major" or above → show crisis notification
  → Popup reads from storage to display latest stats
  → Notifications sent if thresholds exceeded
```

The same `ist_client_id` UUID stored in `chrome.storage.local` is also used as `X-Client-ID` in the web app (via localStorage). This means speed tests from the extension and the web app are unified under the same device identity.

## Crisis Monitor Integration

The extension integrates with the Internet Crisis Monitor feature of the web app:

| Endpoint | Used for |
|----------|----------|
| `GET /api/internet-crisis` | Combined local + global severity check |
| `GET /api/internet-crisis/global` | Infrastructure provider status (Cloudflare, GitHub, Discord, Reddit, Atlassian, Stripe, Twilio) |

When the combined severity is `major`, `critical`, or `outage`, the extension displays a browser notification with the `alert_message` from the API response — the same contextual message shown in the Crisis Monitor page.

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Persist client UUID, test results, and settings |
| `alarms` | Schedule periodic speed tests |
| `notifications` | Show outage / slow-speed / crisis alerts |
| `host_permissions` | Access the IST backend API |
