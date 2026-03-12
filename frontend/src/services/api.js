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

// ── New Cool Features ──────────────────────────────────────────────────────────────

export const getGamingMetrics = (hours = 1) =>
  api.get(`/gaming-metrics?hours=${hours}`);

export const getVideoCallQuality = () =>
  api.get('/video-call-quality');

export const getRouterHealth = () =>
  api.get('/router-health');

export const getActivityRecommendations = () =>
  api.get('/activity-recommendations');

export const getIsItJustMe = () =>
  api.get('/is-it-just-me');

// ── Security Features ──────────────────────────────────────────────────────────────

export const getSecurityAudit = () =>
  api.get('/security/audit');

export const getPortScan = (target = '127.0.0.1') =>
  api.get(`/security/port-scan?target=${encodeURIComponent(target)}`);

export const getPrivacyScore = () =>
  api.get('/security/privacy-score');

export const getVPNRecommendation = () =>
  api.get('/security/vpn-recommendation');

// ── Advanced Diagnostics ───────────────────────────────────────────────────────────

export const getAdvancedDiagnostics = () =>
  api.get('/diagnostics/advanced');

export const getPacketLoss = (host = '8.8.8.8', count = 20) =>
  api.get(`/diagnostics/packet-loss?host=${encodeURIComponent(host)}&count=${count}`);

export const getJitter = (host = '8.8.8.8', samples = 30) =>
  api.get(`/diagnostics/jitter?host=${encodeURIComponent(host)}&samples=${samples}`);

export const getBufferbloat = () =>
  api.get('/diagnostics/bufferbloat');

export const getMTU = (host = '8.8.8.8') =>
  api.get(`/diagnostics/mtu?host=${encodeURIComponent(host)}`);

export const getDNSLeak = () =>
  api.get('/diagnostics/dns-leak');

export const getVPNSpeedComparison = (vpnInterface = null) =>
  api.get('/diagnostics/vpn-speed', { params: vpnInterface ? { vpn_interface: vpnInterface } : {} });

// ── ML Predictions ─────────────────────────────────────────────────────────────────

export const getPredictNextHour = () =>
  api.get('/predictions/next-hour');

export const getOutageProbability = () =>
  api.get('/predictions/outage-probability');

export const getBestDownloadTime = (hoursAhead = 24) =>
  api.get(`/predictions/best-download-time?hours_ahead=${hoursAhead}`);

export const getCongestionForecast = () =>
  api.get('/predictions/congestion-24h');

// ── Smart Alerts ───────────────────────────────────────────────────────────────────

export const getAlertConfig = () =>
  api.get('/alerts/config');

export const updateAlertConfig = (config) =>
  api.post('/alerts/config', config);

export const testAlert = () =>
  api.post('/alerts/test');

// ── AI Insights Enhanced ───────────────────────────────────────────────────────────

export const getRootCause = (hours = 24) =>
  api.get(`/insights/root-cause?hours=${hours}`);

export const getPredictiveMaintenance = () =>
  api.get('/insights/predictive-maintenance');

export const getAnomaliesAdvanced = (sensitivity = 2.0) =>
  api.get(`/insights/anomalies-advanced?sensitivity=${sensitivity}`);

export const askNaturalQuery = (question) =>
  api.get(`/insights/query?q=${encodeURIComponent(question)}`);

// ── Historical Visualization ───────────────────────────────────────────────────────

export const getHeatmapCalendar = (days = 90) =>
  api.get(`/history/heatmap-calendar?days=${days}`);

export const getSpeedDistribution = (bins = 20) =>
  api.get(`/history/distribution?bins=${bins}`);

export const getPercentiles = () =>
  api.get('/history/percentiles');

export const getCorrelation = () =>
  api.get('/history/correlation');

export const getInteractiveTimeline = (hours = 168) =>
  api.get(`/history/interactive-timeline?hours=${hours}`);

// ── User Preferences ───────────────────────────────────────────────────────────────

export const getPreferences = () =>
  api.get('/preferences');

export const updatePreferences = (prefs) =>
  api.post('/preferences', prefs);
