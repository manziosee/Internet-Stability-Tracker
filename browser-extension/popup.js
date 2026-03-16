// IST Popup — v1.3.0
// Cross-browser: Chrome, Firefox 109+, Edge, Brave, Opera

// ── Cross-browser polyfill ─────────────────────────────────────────────────────
if (typeof globalThis.chrome === 'undefined' && typeof browser !== 'undefined') {
  globalThis.chrome = browser;
}
const ext = (typeof browser !== 'undefined') ? browser : chrome;

// ── sendMessage helper: works with both Promise (Firefox) and callback (Chrome) API
function sendMessage(msg) {
  return new Promise(resolve => {
    try {
      const result = ext.runtime.sendMessage(msg);
      if (result && typeof result.then === 'function') {
        result.then(r => resolve(r ?? null)).catch(() => resolve(null));
      } else {
        // Chrome callback style — ext.runtime.sendMessage accepts callback as last arg
        chrome.runtime.sendMessage(msg, r => resolve(r ?? null));
      }
    } catch (e) {
      resolve(null);
    }
  });
}

const API_BASE  = 'https://backend-cold-butterfly-9535.fly.dev/api';
const DASH_BASE = 'https://internet-stability-tracker.vercel.app';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getClientId() {
  const r = await sendMessage({ action: 'get_client_id' });
  return r?.id || '';
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function speedColor(dl) {
  if (dl == null) return 'neutral';
  if (dl < 5)  return 'bad';
  if (dl < 25) return 'warn';
  return 'good';
}

function pingColor(pg) {
  if (pg == null) return 'neutral';
  if (pg > 200) return 'bad';
  if (pg > 80)  return 'warn';
  return 'good';
}

// ── Status ────────────────────────────────────────────────────────────────────
async function fetchStatus(clientId) {
  try {
    const res  = await fetch(`${API_BASE}/status`, { headers: { 'X-Client-ID': clientId } });
    const data = await res.json();
    const s    = data.status || 'unknown';
    document.getElementById('statusDot').className   = `dot ${s}`;
    document.getElementById('statusText').textContent = s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    document.getElementById('statusText').textContent = 'Offline';
    document.getElementById('statusDot').className    = 'dot unknown';
  }
}

// ── Health Score ──────────────────────────────────────────────────────────────
async function fetchHealthScore(clientId) {
  try {
    const res  = await fetch(`${API_BASE}/health-score?window_days=7`, { headers: { 'X-Client-ID': clientId } });
    if (!res.ok) return;
    const data  = await res.json();
    const score = data.score ?? 0;
    const grade = data.grade ?? '—';

    const bar     = document.getElementById('healthBar');
    const gradeEl = document.getElementById('healthGrade');

    bar.style.width      = `${score}%`;
    bar.style.background = score >= 80 ? '#43A047' : score >= 60 ? '#FFA726' : '#EF5350';

    const gradeClass = grade.startsWith('A') ? 'grade-A' : grade.startsWith('B') ? 'grade-B' :
                       grade.startsWith('C') ? 'grade-C' : grade.startsWith('D') ? 'grade-D' : 'grade-F';
    gradeEl.textContent = grade;
    gradeEl.className   = `health-grade ${gradeClass}`;
  } catch { /* silent */ }
}

// ── Metrics display ───────────────────────────────────────────────────────────
function setMetrics(dl, ul, pg, history) {
  const dlEl = document.getElementById('dlVal');
  const ulEl = document.getElementById('ulVal');
  const pgEl = document.getElementById('pgVal');

  dlEl.textContent = dl != null ? Number(dl).toFixed(1) : '—';
  ulEl.textContent = ul != null ? Number(ul).toFixed(1) : '—';
  pgEl.textContent = pg != null ? Math.round(pg).toString() : '—';

  dlEl.className = `val ${speedColor(dl)}`;
  ulEl.className = `val ${speedColor(ul)}`;
  pgEl.className = `val ${pingColor(pg)}`;

  if (history && history.length >= 3) {
    const prev2 = history.slice(1, 3).map(h => h.download).filter(Boolean);
    const avg2  = prev2.length ? prev2.reduce((a, b) => a + b, 0) / prev2.length : null;
    if (avg2 && dl) {
      const diff = ((dl - avg2) / avg2) * 100;
      const tEl  = document.getElementById('dlTrend');
      if (diff > 5)       { tEl.textContent = `▲ ${Math.abs(diff).toFixed(0)}%`; tEl.className = 'trend up'; }
      else if (diff < -5) { tEl.textContent = `▼ ${Math.abs(diff).toFixed(0)}%`; tEl.className = 'trend down'; }
      else                { tEl.textContent = '→ stable'; tEl.className = 'trend flat'; }
    }
  }
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function drawSparkline(history) {
  const canvas = document.getElementById('sparkline');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const vals = history.slice(0, 20).reverse().map(h => h.download).filter(v => v != null);
  if (vals.length < 2) {
    ctx.fillStyle = '#546e7a';
    ctx.font = '11px sans-serif';
    ctx.fillText('Run a few speed tests to see the trend chart', 10, H / 2 + 4);
    return;
  }

  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = Math.max(max - min, 1);
  const pad   = 4;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(66,165,245,0.35)');
  grad.addColorStop(1, 'rgba(66,165,245,0)');

  const pts = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (W - pad * 2),
    y: pad + (1 - (v - min) / range) * (H - pad * 2),
  }));

  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#42A5F5';
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#42A5F5';
  ctx.fill();

  ctx.fillStyle = '#546e7a';
  ctx.font = '9px sans-serif';
  ctx.fillText(`${max.toFixed(0)}`, 2, pad + 8);
  ctx.fillText(`${min.toFixed(0)}`, 2, H - 2);
}

// ── History ───────────────────────────────────────────────────────────────────
function renderHistory(history) {
  const list = document.getElementById('historyList');
  if (!history || history.length === 0) {
    list.innerHTML = '<div class="hist-empty">No tests recorded yet.</div>';
    return;
  }
  const rows = history.slice(0, 8).map(h => `
    <div class="hist-row">
      <span class="hist-ts">${fmtTime(h.ts)}</span>
      <div class="hist-vals">
        <span class="hist-dl">↓${h.download != null ? Number(h.download).toFixed(1) : '?'}</span>
        <span class="hist-ul">↑${h.upload   != null ? Number(h.upload).toFixed(1)   : '?'}</span>
        <span class="hist-pg">${h.ping       != null ? Math.round(h.ping) + 'ms'     : '?'}</span>
      </div>
    </div>
  `).join('');
  list.innerHTML = rows;
}

// ── Footer ────────────────────────────────────────────────────────────────────
async function updateFooter() {
  const s = await ext.storage.local.get(['auto_test_enabled', 'interval_minutes']);
  const enabled  = s.auto_test_enabled ?? false;
  const interval = s.interval_minutes  ?? 30;
  document.getElementById('autoStatus').textContent =
    enabled ? `auto every ${interval}m` : '';
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const clientId = await getClientId();

  fetchStatus(clientId);
  fetchHealthScore(clientId);
  updateFooter();

  const stored = await ext.storage.local.get(['last_result', 'speed_history', 'current_status_ts']);
  const hist   = stored.speed_history || [];
  const last   = stored.last_result;

  if (last) {
    setMetrics(last.download, last.upload, last.ping, hist);
    document.getElementById('lastTestTs').textContent = `Last: ${fmtTime(last.ts)}`;
  }

  if (stored.current_status_ts) {
    document.getElementById('statusTs').textContent = fmtTime(stored.current_status_ts);
  }

  drawSparkline(hist);
  renderHistory(hist);
}

// ── Events ────────────────────────────────────────────────────────────────────
document.getElementById('testBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testBtn');
  btn.innerHTML = '<span class="spinner"></span>Testing…';
  btn.disabled  = true;

  const res = await sendMessage({ action: 'run_test' });
  btn.textContent = '▶ Run Test';
  btn.disabled    = false;

  if (res?.ok && res.data) {
    const d        = res.data;
    const clientId = await getClientId();
    const stored   = await ext.storage.local.get('speed_history');
    const hist     = stored.speed_history || [];
    setMetrics(d.download_speed ?? d.download, d.upload_speed ?? d.upload, d.ping, hist);
    document.getElementById('lastTestTs').textContent = 'Last: just now';
    drawSparkline(hist);
    renderHistory(hist);
    fetchHealthScore(clientId);
  } else {
    document.getElementById('lastTestTs').textContent = 'Test failed — try again.';
  }
});

document.getElementById('throttleBtn').addEventListener('click', async () => {
  const btn = document.getElementById('throttleBtn');
  btn.textContent = 'Checking…';
  btn.disabled = true;
  try {
    const res  = await fetch(`${API_BASE}/throttle/detect`);
    const data = await res.json();
    const msg  = data.is_throttled
      ? `Throttling detected! ${(data.avg_mbps || 0).toFixed(1)} Mbps avg (${(data.confidence * 100).toFixed(0)}% confidence)`
      : `No throttling — ${(data.avg_mbps || 0).toFixed(1)} Mbps avg`;
    document.getElementById('statusText').textContent = msg;
  } catch {
    document.getElementById('statusText').textContent = 'Throttle check failed';
  }
  btn.textContent = 'Throttle?';
  btn.disabled = false;
});

document.getElementById('openBtn').addEventListener('click', () => {
  ext.tabs.create({ url: DASH_BASE });
});

document.getElementById('toggleHistory').addEventListener('click', () => {
  const content = document.getElementById('historyContent');
  const btn     = document.getElementById('toggleHistory');
  const hidden  = content.style.display === 'none';
  content.style.display = hidden ? 'block' : 'none';
  btn.textContent = hidden ? 'hide ▴' : 'show ▾';
});

document.querySelectorAll('.ql-btn[data-path]').forEach(btn => {
  btn.addEventListener('click', () => {
    ext.tabs.create({ url: DASH_BASE + btn.dataset.path });
  });
});

init();
