// IST Options — v1.3.0
// Cross-browser: Chrome, Firefox 109+, Edge, Brave, Opera

// ── Cross-browser polyfill ─────────────────────────────────────────────────────
if (typeof globalThis.chrome === 'undefined' && typeof browser !== 'undefined') {
  globalThis.chrome = browser;
}
const ext = (typeof browser !== 'undefined') ? browser : chrome;

// ── sendMessage helper: works with both Promise (Firefox) and callback (Chrome) ──
function sendMessage(msg) {
  return new Promise(resolve => {
    try {
      const result = ext.runtime.sendMessage(msg);
      if (result && typeof result.then === 'function') {
        result.then(r => resolve(r ?? null)).catch(() => resolve(null));
      } else {
        chrome.runtime.sendMessage(msg, r => resolve(r ?? null));
      }
    } catch (e) {
      resolve(null);
    }
  });
}

// ── Clipboard helper: supports navigator.clipboard (modern) and execCommand (fallback) ──
async function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through */ }
  }
  // Fallback for Firefox / restricted contexts
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(el);
  return ok;
}

const STORAGE_KEYS = [
  'auto_test_enabled', 'interval_minutes',
  'notify_outage', 'notify_recovery',
  'notify_slow', 'slow_threshold',
  'notify_upload', 'upload_threshold',
  'notify_ping', 'ping_threshold',
  'weekly_digest_enabled', 'auto_report_outage',
  'ist_client_id', 'speed_history',
];

async function load() {
  const s = await ext.storage.local.get(STORAGE_KEYS);

  document.getElementById('autoEnabled').checked     = s.auto_test_enabled     ?? false;
  document.getElementById('intervalRange').value     = s.interval_minutes      ?? 30;
  document.getElementById('intervalVal').textContent = s.interval_minutes      ?? 30;

  document.getElementById('notifyOutage').checked    = s.notify_outage         ?? true;
  document.getElementById('notifyRecovery').checked  = s.notify_recovery       ?? true;
  document.getElementById('notifySlow').checked      = s.notify_slow           ?? false;
  document.getElementById('slowThreshold').value     = s.slow_threshold        ?? 10;
  document.getElementById('notifyUpload').checked    = s.notify_upload         ?? false;
  document.getElementById('uploadThreshold').value   = s.upload_threshold      ?? 5;
  document.getElementById('notifyPing').checked      = s.notify_ping           ?? false;
  document.getElementById('pingThreshold').value     = s.ping_threshold        ?? 200;
  document.getElementById('weeklyDigest').checked    = s.weekly_digest_enabled ?? true;
  document.getElementById('autoReport').checked      = s.auto_report_outage    ?? false;

  document.getElementById('clientId').textContent =
    s.ist_client_id ?? 'Not assigned yet — open popup first.';

  const hist = s.speed_history || [];
  document.getElementById('totalTests').textContent = hist.length;
  if (hist.length > 0) {
    const dls = hist.map(h => h.download).filter(Boolean);
    const pgs = hist.map(h => h.ping).filter(Boolean);
    document.getElementById('avgDl').textContent =
      dls.length ? (dls.reduce((a, b) => a + b, 0) / dls.length).toFixed(1) : '—';
    document.getElementById('avgPing').textContent =
      pgs.length ? Math.round(pgs.reduce((a, b) => a + b, 0) / pgs.length) : '—';
  }
}

// Live interval label
document.getElementById('intervalRange').addEventListener('input', e => {
  document.getElementById('intervalVal').textContent = e.target.value;
});

// Save
document.getElementById('saveBtn').addEventListener('click', async () => {
  await ext.storage.local.set({
    auto_test_enabled:     document.getElementById('autoEnabled').checked,
    interval_minutes:      parseInt(document.getElementById('intervalRange').value, 10),
    notify_outage:         document.getElementById('notifyOutage').checked,
    notify_recovery:       document.getElementById('notifyRecovery').checked,
    notify_slow:           document.getElementById('notifySlow').checked,
    slow_threshold:        parseFloat(document.getElementById('slowThreshold').value),
    notify_upload:         document.getElementById('notifyUpload').checked,
    upload_threshold:      parseFloat(document.getElementById('uploadThreshold').value),
    notify_ping:           document.getElementById('notifyPing').checked,
    ping_threshold:        parseFloat(document.getElementById('pingThreshold').value),
    weekly_digest_enabled: document.getElementById('weeklyDigest').checked,
    auto_report_outage:    document.getElementById('autoReport').checked,
  });

  await sendMessage({ action: 'refresh_alarm' });

  const msg = document.getElementById('savedMsg');
  msg.style.display = 'inline';
  setTimeout(() => { msg.style.display = 'none'; }, 2500);
});

// Test now
document.getElementById('testNowBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testNowBtn');
  btn.textContent = 'Running…';
  btn.disabled = true;
  await sendMessage({ action: 'run_test_silent' });
  btn.textContent = '▶ Test Now';
  btn.disabled = false;
  load();
});

// Clear history
document.getElementById('resetHistBtn').addEventListener('click', async () => {
  if (!confirm('Clear all local speed test history? This cannot be undone.')) return;
  await ext.storage.local.remove(['speed_history', 'last_result', 'last_error', 'last_error_ts']);
  load();
});

// Copy client ID — uses cross-browser clipboard helper
document.getElementById('copyId').addEventListener('click', async () => {
  const s  = await ext.storage.local.get('ist_client_id');
  const id = s.ist_client_id;
  if (!id) return;
  const ok  = await copyToClipboard(id);
  const btn = document.getElementById('copyId');
  btn.textContent = ok ? 'Copied' : 'Failed';
  setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
});

load();
