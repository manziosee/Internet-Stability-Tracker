// Internet Stability Tracker — Background Service Worker (Manifest V3) v1.3.0
// Cross-browser: Chrome, Firefox 109+, Edge, Brave, Opera

// ── Cross-browser polyfill ─────────────────────────────────────────────────────
// Firefox 109+ exposes chrome.* as an alias for browser.*; this covers edge cases.
if (typeof globalThis.chrome === 'undefined' && typeof browser !== 'undefined') {
  globalThis.chrome = browser;
}
// Unified API handle — prefers native browser.* (Promise-based) when available
const ext = (typeof browser !== 'undefined') ? browser : chrome;

// ── UUID helper (fallback for environments where crypto.randomUUID is absent) ──
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const API_BASE      = 'https://backend-cold-butterfly-9535.fly.dev/api';
const CLIENT_ID_KEY = 'ist_client_id';
const ALARM_TEST    = 'auto_speedtest';
const ALARM_DIGEST  = 'weekly_digest';
const HISTORY_MAX   = 30;

// ── Client ID ─────────────────────────────────────────────────────────────────
async function getClientId() {
  const r = await ext.storage.local.get(CLIENT_ID_KEY);
  if (r[CLIENT_ID_KEY]) return r[CLIENT_ID_KEY];
  const id = generateUUID();
  await ext.storage.local.set({ [CLIENT_ID_KEY]: id });
  return id;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
function setBadge(text, color) {
  ext.action.setBadgeText({ text: String(text).slice(0, 4) });
  ext.action.setBadgeBackgroundColor({ color: color || '#1565C0' });
}

function clearBadge() {
  ext.action.setBadgeText({ text: '' });
}

// ── History ───────────────────────────────────────────────────────────────────
async function appendHistory(entry) {
  const s = await ext.storage.local.get('speed_history');
  const hist = s.speed_history || [];
  hist.unshift(entry);
  if (hist.length > HISTORY_MAX) hist.length = HISTORY_MAX;
  await ext.storage.local.set({ speed_history: hist });
}

// ── Run Speed Test ────────────────────────────────────────────────────────────
async function runSpeedTest(silent = false) {
  const clientId = await getClientId();
  setBadge('...', '#546e7a');
  try {
    const res = await fetch(`${API_BASE}/test-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-ID': clientId },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const dl = data.download_speed ?? data.download ?? 0;
    const ul = data.upload_speed   ?? data.upload   ?? 0;
    const pg = data.ping           ?? 0;

    const entry = { download: dl, upload: ul, ping: pg, ts: new Date().toISOString() };
    await ext.storage.local.set({ last_result: entry });
    await appendHistory(entry);

    const badgeText = dl >= 1 ? Math.round(dl).toString() : dl.toFixed(1);
    setBadge(badgeText, dl < 5 ? '#EF5350' : dl < 20 ? '#FFA726' : '#43A047');

    if (!silent) {
      const cfg = await ext.storage.local.get(['notify_slow', 'slow_threshold', 'notify_upload', 'upload_threshold', 'notify_ping', 'ping_threshold']);
      const slowThr   = cfg.slow_threshold   ?? 10;
      const uploadThr = cfg.upload_threshold ?? 5;
      const pingThr   = cfg.ping_threshold   ?? 200;

      if (cfg.notify_slow && dl > 0 && dl < slowThr) {
        ext.notifications.create('slow_dl_' + Date.now(), {
          type: 'basic', iconUrl: 'icons/icon48.png',
          title: 'Slow Download Speed',
          message: `${dl.toFixed(1)} Mbps — below your ${slowThr} Mbps threshold.`,
        });
      }
      if (cfg.notify_upload && ul > 0 && ul < uploadThr) {
        ext.notifications.create('slow_ul_' + Date.now(), {
          type: 'basic', iconUrl: 'icons/icon48.png',
          title: 'Slow Upload Speed',
          message: `Upload ${ul.toFixed(1)} Mbps — below your ${uploadThr} Mbps threshold.`,
        });
      }
      if (cfg.notify_ping && pg > 0 && pg > pingThr) {
        ext.notifications.create('high_ping_' + Date.now(), {
          type: 'basic', iconUrl: 'icons/icon48.png',
          title: 'High Latency Detected',
          message: `Ping ${Math.round(pg)} ms — above your ${pingThr} ms threshold.`,
        });
      }
    }
    return data;
  } catch (err) {
    clearBadge();
    console.error('[IST] Speed test failed:', err.message);
    await ext.storage.local.set({ last_error: err.message, last_error_ts: new Date().toISOString() });
  }
}

// ── Check Status ──────────────────────────────────────────────────────────────
async function checkStatus() {
  const clientId = await getClientId();
  try {
    const res  = await fetch(`${API_BASE}/status`, { headers: { 'X-Client-ID': clientId } });
    const data = await res.json();
    const s    = data.status ?? 'unknown';
    const prev = (await ext.storage.local.get('prev_status')).prev_status;

    await ext.storage.local.set({ current_status: s, current_status_ts: new Date().toISOString() });

    const cfg = await ext.storage.local.get(['notify_outage', 'notify_recovery']);
    const notifyOutage   = cfg.notify_outage   ?? true;
    const notifyRecovery = cfg.notify_recovery ?? true;

    if (notifyOutage && (s === 'outage' || s === 'degraded') && prev === 'healthy') {
      ext.notifications.create('outage_' + Date.now(), {
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: 'Internet Outage Detected',
        message: `Network status changed to ${s}. Check your connection.`,
      });
    }

    if (notifyRecovery && s === 'healthy' && (prev === 'outage' || prev === 'degraded')) {
      ext.notifications.create('recovery_' + Date.now(), {
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: 'Connection Restored',
        message: 'Your internet is back to healthy status.',
      });
    }

    await ext.storage.local.set({ prev_status: s });
  } catch { /* ignore network errors */ }
}

// ── Auto-report outage (if enabled) ──────────────────────────────────────────
async function autoReportOutage(isp) {
  const cfg = await ext.storage.local.get('auto_report_outage');
  if (!cfg.auto_report_outage) return;
  const clientId = await getClientId();
  try {
    await fetch(`${API_BASE}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-ID': clientId },
      body: JSON.stringify({
        isp:         isp || 'Unknown ISP',
        location:    'Auto-reported',
        latitude:    0, longitude: 0,
        issue_type:  'outage',
        description: 'Auto-reported outage by IST browser extension.',
      }),
    });
  } catch { /* silent */ }
}

// ── Weekly Digest Notification ────────────────────────────────────────────────
async function sendWeeklyDigest() {
  const clientId = await getClientId();
  try {
    const res  = await fetch(`${API_BASE}/reports/weekly`, { headers: { 'X-Client-ID': clientId } });
    if (!res.ok) return;
    const data = await res.json();
    const w1   = data.week1 || {};
    const hl   = data.headline || 'Your weekly internet performance report is ready.';
    ext.notifications.create('digest_' + Date.now(), {
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'Weekly Internet Report',
      message: `${hl} Avg download: ${(w1.avg_download || 0).toFixed(1)} Mbps, uptime: ${(w1.uptime_pct || 0).toFixed(1)}%.`,
    });
  } catch { /* ignore */ }
}

// ── Alarm Handler ─────────────────────────────────────────────────────────────
ext.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_TEST) {
    await runSpeedTest();
    await checkStatus();
  }
  if (alarm.name === ALARM_DIGEST) {
    await sendWeeklyDigest();
  }
});

// ── Setup Alarms ──────────────────────────────────────────────────────────────
async function setupAlarms() {
  const s = await ext.storage.local.get(['auto_test_enabled', 'interval_minutes', 'weekly_digest_enabled']);
  const enabled  = s.auto_test_enabled     ?? false;
  const interval = s.interval_minutes      ?? 30;
  const digest   = s.weekly_digest_enabled ?? true;

  await ext.alarms.clear(ALARM_TEST);
  if (enabled) {
    ext.alarms.create(ALARM_TEST, { periodInMinutes: Math.max(1, interval) });
  }

  await ext.alarms.clear(ALARM_DIGEST);
  if (digest) {
    // Fire after 5 min initial delay, then every 7 days (10080 min)
    // Firefox clamps very large delayInMinutes — use a short initial delay
    ext.alarms.create(ALARM_DIGEST, { delayInMinutes: 5, periodInMinutes: 10080 });
  }
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function createContextMenus() {
  ext.contextMenus.removeAll(() => {
    // 'action' context is Chrome/Edge-only in MV3; Firefox uses 'browser_action'
    // Using 'all' covers both without errors
    const ctx = ['all'];
    try {
      ext.contextMenus.create({ id: 'run_test',       title: 'Run Speed Test Now',    contexts: ctx });
      ext.contextMenus.create({ id: 'open_dashboard', title: 'Open Dashboard',        contexts: ctx });
      ext.contextMenus.create({ id: 'open_health',    title: 'Network Health Score',  contexts: ctx });
      ext.contextMenus.create({ id: 'open_history',   title: 'View Speed History',    contexts: ctx });
    } catch (e) {
      console.warn('[IST] Context menu creation failed:', e.message);
    }
  });
}

ext.contextMenus.onClicked.addListener((info) => {
  const base = 'https://internet-stability-tracker.vercel.app';
  if (info.menuItemId === 'run_test')       runSpeedTest();
  if (info.menuItemId === 'open_dashboard') ext.tabs.create({ url: base });
  if (info.menuItemId === 'open_health')    ext.tabs.create({ url: `${base}/health-score` });
  if (info.menuItemId === 'open_history')   ext.tabs.create({ url: `${base}/history` });
});

// ── Startup ───────────────────────────────────────────────────────────────────
ext.runtime.onInstalled.addListener(async () => {
  await setupAlarms();
  createContextMenus();
  ext.notifications.create('welcome', {
    type: 'basic', iconUrl: 'icons/icon48.png',
    title: 'IST Extension Installed',
    message: 'Click the icon to run your first speed test or open Settings to enable auto-tests.',
  });
});

ext.runtime.onStartup.addListener(() => {
  setupAlarms();
  createContextMenus();
  ext.storage.local.get('last_result').then(s => {
    if (s.last_result?.download) {
      const dl = s.last_result.download;
      setBadge(Math.round(dl).toString(), dl < 5 ? '#EF5350' : dl < 20 ? '#FFA726' : '#43A047');
    }
  });
});

// ── Message Handler ───────────────────────────────────────────────────────────
// Uses a Promise wrapper so it works with both Chrome (callback) and Firefox (Promise)
ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async () => {
    if (msg.action === 'run_test')        return { ok: true,  data: await runSpeedTest(false) };
    if (msg.action === 'run_test_silent') return { ok: true,  data: await runSpeedTest(true) };
    if (msg.action === 'refresh_alarm')   { await setupAlarms(); return { ok: true }; }
    if (msg.action === 'get_client_id')   return { id: await getClientId() };
    if (msg.action === 'check_status')    { await checkStatus(); return { ok: true }; }
    if (msg.action === 'send_digest')     { await sendWeeklyDigest(); return { ok: true }; }
    return null;
  };

  handle()
    .then(result => { if (result !== null) sendResponse(result); })
    .catch(e => sendResponse({ ok: false, error: e.message }));

  return true; // keep channel open for async response
});
