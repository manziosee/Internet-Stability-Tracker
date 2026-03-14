// Internet Stability Tracker — Background Service Worker (Manifest V3)

const API_BASE = 'https://backend-cold-butterfly-9535.fly.dev/api';
const CLIENT_ID_KEY = 'ist_client_id';
const ALARM_NAME = 'auto_speedtest';

// ── Client ID ─────────────────────────────────────────────────────────────────
async function getClientId() {
  const result = await chrome.storage.local.get(CLIENT_ID_KEY);
  if (result[CLIENT_ID_KEY]) return result[CLIENT_ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [CLIENT_ID_KEY]: id });
  return id;
}

// ── Run Speed Test ────────────────────────────────────────────────────────────
async function runSpeedTest() {
  const clientId = await getClientId();
  try {
    const res = await fetch(`${API_BASE}/test-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': clientId,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    await chrome.storage.local.set({
      last_result: {
        download: data.download_speed ?? data.download ?? null,
        upload:   data.upload_speed   ?? data.upload   ?? null,
        ping:     data.ping                             ?? null,
        ts:       new Date().toISOString(),
      },
    });

    // Notify on slow speed
    const settings = await chrome.storage.local.get(['notify_slow', 'slow_threshold']);
    const threshold = settings.slow_threshold ?? 10;
    const dl = data.download_speed ?? data.download ?? 0;
    if (settings.notify_slow && dl < threshold && dl > 0) {
      chrome.notifications.create('slow_speed_' + Date.now(), {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '⚠️ Slow Internet Detected',
        message: `Download speed ${dl.toFixed(1)} Mbps — below your ${threshold} Mbps threshold.`,
      });
    }
    return data;
  } catch (err) {
    console.error('[IST] Speed test failed:', err.message);
    await chrome.storage.local.set({
      last_error:    err.message,
      last_error_ts: new Date().toISOString(),
    });
  }
}

// ── Check Status ──────────────────────────────────────────────────────────────
async function checkStatus() {
  const clientId = await getClientId();
  try {
    const res  = await fetch(`${API_BASE}/status`, { headers: { 'X-Client-ID': clientId } });
    const data = await res.json();
    const s    = data.status ?? 'unknown';
    await chrome.storage.local.set({ current_status: s });

    const prev = await chrome.storage.local.get('prev_status');
    const notifyOutage = (await chrome.storage.local.get('notify_outage')).notify_outage ?? true;
    if (notifyOutage && (s === 'outage' || s === 'degraded') && prev.prev_status === 'healthy') {
      chrome.notifications.create('outage_' + Date.now(), {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '🔴 Internet Outage Detected',
        message: `Status changed to ${s}. Check your connection.`,
      });
    }
    await chrome.storage.local.set({ prev_status: s });
  } catch { /* ignore network errors */ }
}

// ── Alarm Handler ─────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runSpeedTest();
    await checkStatus();
  }
});

// ── Setup Alarm ───────────────────────────────────────────────────────────────
async function setupAlarm() {
  const settings = await chrome.storage.local.get(['auto_test_enabled', 'interval_minutes']);
  const enabled  = settings.auto_test_enabled ?? false;
  const interval = settings.interval_minutes  ?? 30;

  await chrome.alarms.clear(ALARM_NAME);
  if (enabled) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, interval) });
    console.log(`[IST] Auto-test scheduled every ${interval} minutes.`);
  }
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);

// ── Message Handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'run_test') {
    runSpeedTest()
      .then(data => sendResponse({ ok: true, data }))
      .catch(e  => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.action === 'refresh_alarm') {
    setupAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'get_client_id') {
    getClientId().then(id => sendResponse({ id }));
    return true;
  }
});
