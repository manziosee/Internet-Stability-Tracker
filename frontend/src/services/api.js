import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// ── Persistent device identity ─────────────────────────────────────────────
// A UUID is generated once and stored in localStorage so the same browser/device
// always gets back its own data. Different browsers or incognito tabs get separate
// identities — exactly like different physical users on different machines.
// (True MAC-address access is blocked by all browsers for user privacy.)
function getClientId() {
  try {
    let id = localStorage.getItem('ist_client_id');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem('ist_client_id', id);
    }
    return id;
  } catch {
    // localStorage blocked (e.g. private mode with strict settings) — generate ephemeral ID
    return crypto.randomUUID();
  }
}

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach X-Client-ID to every outgoing request automatically
api.interceptors.request.use((config) => {
  config.headers['X-Client-ID'] = getClientId();
  return config;
});

// ── Measurements ───────────────────────────────────────────────────────────
export const getMeasurements = (skip = 0, limit = 100) =>
  api.get(`/measurements?skip=${skip}&limit=${limit}`);

export const getRecentMeasurements = (hours = 24) =>
  api.get(`/measurements/recent?hours=${hours}`);

// ── Stats / Alerts ────────────────────────────────────────────────────────
export const getStats = (hours = 24) =>
  api.get(`/stats?hours=${hours}`);

export const getAlerts = () =>
  api.get('/alerts');

// ── Outages (personal) ────────────────────────────────────────────────────
export const getOutages = (limit = 50) =>
  api.get(`/outages?limit=${limit}`);

// ── Community (shared — not scoped to device) ─────────────────────────────
export const getISPComparison = () =>
  api.get('/isp-comparison');

export const getReports = (skip = 0, limit = 100) =>
  api.get(`/reports?skip=${skip}&limit=${limit}`);

export const createReport = (data) =>
  api.post('/reports', data);

// ── Speed test ────────────────────────────────────────────────────────────
export const runTestNow = (location, lat, lon) =>
  api.post('/test-now', null, { params: { location, lat, lon } });

// ── Outage events ─────────────────────────────────────────────────────────
export const getOutageEvents = (limit = 50, resolvedOnly = false) =>
  api.get(`/outage-events?limit=${limit}&resolved_only=${resolvedOnly}`);

// ── ISP reliability (global) ──────────────────────────────────────────────
export const getISPReliability = (hours = 168) =>
  api.get(`/isp-reliability?hours=${hours}`);

// ── Network / system ──────────────────────────────────────────────────────
export const getNetworkUsage = () =>
  api.get('/network-usage');

// ── Admin ─────────────────────────────────────────────────────────────────
export const clearMeasurements = () =>
  api.delete('/measurements');

// ── New endpoints ──────────────────────────────────────────────────────────

export const getQualityScore = (hours = 24) =>
  api.get(`/quality-score?hours=${hours}`);

export const getGlobalStatus = () =>
  api.get('/status');

export const getTimeline = (days = 30) =>
  api.get(`/timeline?days=${days}`);

export const getISPRankings = (hours = 168) =>
  api.get(`/isp-rankings?hours=${hours}`);

export const getOutageConfidence = () =>
  api.get('/outage-confidence');

export const confirmReport = (id) =>
  api.post(`/reports/${id}/confirm`);

export const rejectReport = (id) =>
  api.post(`/reports/${id}/reject`);

export const getDiagnostics = () =>
  api.get('/diagnostics');

export const getAIInsights = (hours = 168) =>
  api.get(`/ai-insights?hours=${hours}`);

export const getMyConnection = () =>
  api.get('/my-connection');

// ── v3 endpoints ──────────────────────────────────────────────────────────────

export const getCongestionHeatmap = (days = 28) =>
  api.get(`/congestion-heatmap?days=${days}`);

export const getComparison = () =>
  api.get('/comparison');

export const getAnomalies = (hours = 168) =>
  api.get(`/anomalies?hours=${hours}`);

export const runTraceroute = (host = '8.8.8.8') =>
  api.get(`/traceroute?host=${encodeURIComponent(host)}`);

export const createSnapshot = (data) =>
  api.post('/snapshots', JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

export const getSnapshot = (id) =>
  api.get(`/snapshots/${id}`);

export const getMultiRegion = () =>
  api.get('/multi-region');
