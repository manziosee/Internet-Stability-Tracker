const API_BASE = 'https://backend-cold-butterfly-9535.fly.dev/api';

async function getClientId() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'get_client_id' }, res => resolve(res?.id || ''));
  });
}

async function fetchStatus(clientId) {
  try {
    const res  = await fetch(`${API_BASE}/status`, { headers: { 'X-Client-ID': clientId } });
    const data = await res.json();
    const s    = data.status || 'unknown';
    const dot  = document.getElementById('statusDot');
    dot.className = `dot ${s}`;
    document.getElementById('statusText').textContent =
      s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    document.getElementById('statusText').textContent = 'Offline';
    document.getElementById('statusDot').className = 'dot unknown';
  }
}

function setMetrics(dl, ul, pg) {
  document.getElementById('dlVal').textContent = dl != null ? Number(dl).toFixed(1) : '—';
  document.getElementById('ulVal').textContent = ul != null ? Number(ul).toFixed(1) : '—';
  document.getElementById('pgVal').textContent = pg != null ? Math.round(pg)        : '—';
}

function setLastTest(ts) {
  if (!ts) return;
  const d = new Date(ts);
  document.getElementById('lastTest').textContent =
    `Last test: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

async function init() {
  const clientId = await getClientId();
  fetchStatus(clientId);

  const stored = await chrome.storage.local.get('last_result');
  if (stored.last_result) {
    const r = stored.last_result;
    setMetrics(r.download, r.upload, r.ping);
    setLastTest(r.ts);
  }
}

document.getElementById('testBtn').addEventListener('click', () => {
  const btn = document.getElementById('testBtn');
  btn.innerHTML = '<span class="spinner"></span>Testing…';
  btn.disabled  = true;

  chrome.runtime.sendMessage({ action: 'run_test' }, (res) => {
    btn.textContent = 'Run Speed Test';
    btn.disabled    = false;
    if (res?.ok && res.data) {
      const d = res.data;
      setMetrics(d.download_speed ?? d.download, d.upload_speed ?? d.upload, d.ping);
      setLastTest(new Date().toISOString());
    } else {
      document.getElementById('lastTest').textContent = 'Test failed — try again.';
    }
  });
});

document.getElementById('openBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://internet-stability-tracker.vercel.app' });
});

init();
