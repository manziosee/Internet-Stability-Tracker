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

// Auto-retry on cold-start connection errors (Fly.io suspends machines when idle)
// Retry once after 2s on network errors or 503/502 responses
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (config._retried) return Promise.reject(error);
    const isNetworkError = !error.response;
    const isColdStart = error.response?.status === 503 || error.response?.status === 502;
    if (isNetworkError || isColdStart) {
      config._retried = true;
      await new Promise((r) => setTimeout(r, 2500));
      return api(config);
    }
    return Promise.reject(error);
  }
);

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

// ── Alert Log & Webhooks ───────────────────────────────────────────────────────

export const getAlertLog = (limit = 50) =>
  api.get(`/alerts/log?limit=${limit}`);

export const listWebhooks = () =>
  api.get('/webhooks');

export const createWebhook = (data) =>
  api.post('/webhooks', data);

export const deleteWebhook = (id) =>
  api.delete(`/webhooks/${id}`);

export const testWebhook = (id) =>
  api.post(`/webhooks/test/${id}`);

// ── New Features v3.2 ────────────────────────────────────────────────────────

export const analyzeSLA = (params) =>
  api.get('/sla/analyze', { params });

export const detectThrottling = (baselineMbps = 0) =>
  api.get('/throttle/detect', { params: { baseline_mbps: baselineMbps } });

export const getHealthScore = (windowDays = 7) =>
  api.get('/health-score', { params: { window_days: windowDays } });

export const getWeeklyReport = () =>
  api.get('/reports/weekly');

export const calculateCost = (params) =>
  api.get('/cost-calculator', { params });

export const getBeforeAfterComparison = (params) =>
  api.get('/comparison/before-after', { params });

export const getLeaderboard = (metric = 'download') =>
  api.get('/leaderboard', { params: { metric } });

export const submitToLeaderboard = (displayName) =>
  api.post('/leaderboard/submit', { display_name: displayName });

export const getMyRank = () =>
  api.get('/leaderboard/my-rank');

export const exportCSV = (days = 90) =>
  api.get('/export/csv', { params: { days }, responseType: 'blob' });

export const exportJSONData = (days = 90) =>
  api.get('/export/json', { params: { days } });

export const listAPIKeys = () =>
  api.get('/api-keys');

export const createAPIKey = (label) =>
  api.post('/api-keys', { label });

export const revokeAPIKey = (id) =>
  api.delete(`/api-keys/${id}`);

export const getISPReportCard = (days = 30) =>
  api.get('/isp-report-card', { params: { days } });

export const testSlackTeamsWebhook = (webhookUrl, platform = 'slack') =>
  api.post('/integrations/test-webhook', { webhook_url: webhookUrl, platform });

export const getPredictionsSummary = () =>
  api.get('/predictions/summary');

export const getUptimeCalendar = (days = 90) =>
  api.get('/uptime-calendar', { params: { days } });

export const getISPCommunityStatus = (ispName = '') =>
  api.get('/isp-community-status', { params: ispName ? { isp_name: ispName } : {} });

export const getSpeedTrend = (weeks = 4) =>
  api.get('/speed-trend', { params: { weeks } });

// ── v3.3 — New Feature APIs ───────────────────────────────────────────────────

// ISP Contract
export const getContract = () =>
  api.get('/contract');

export const saveContract = (data) =>
  api.post('/contract', data);

export const getContractCompliance = () =>
  api.get('/contract/compliance');

// Network Quality Certificate
export const getCertificate = () =>
  api.get('/certificate');

// Best Time Recommender
export const getBestTime = () =>
  api.get('/best-time');

// Multi-Device Aggregator
export const getMyDeviceGroups = () =>
  api.get('/devices/my-groups');

export const getNearbyDevices = () =>
  api.get('/devices/nearby');

export const linkDevice = (data) =>
  api.post('/devices/link', data);

export const unlinkDevice = (groupId) =>
  api.delete(`/devices/link/${encodeURIComponent(groupId)}`);

export const compareDevices = () =>
  api.get('/devices/compare');

// DNS Monitor
export const runDNSTest = (domain = 'google.com') =>
  api.get('/dns-test', { params: { domain } });

// Complaint Letter
export const getComplaintLetter = (params = {}) =>
  api.get('/complaint-letter', { params: {
    your_name:      params.your_name      || '',
    your_address:   params.your_address   || '',
    isp_name:       params.isp_name       || '',
    account_number: params.account_number || '',
    issue_start:    params.issue_start    || '',
  } });

// Scheduled Tests
export const getSchedules = () =>
  api.get('/schedules');

export const createSchedule = (data) =>
  api.post('/schedules', data);

export const updateSchedule = (id, data) =>
  api.put(`/schedules/${id}`, data);

export const deleteSchedule = (id) =>
  api.delete(`/schedules/${id}`);

// Packet Loss & Jitter
export const runPacketLossTest = (params = {}) =>
  api.post('/packet-loss/run', null, { params });

export const getPacketLossHistory = (limit = 50) =>
  api.get('/packet-loss/history', { params: { limit } });

// Neighborhood Outages (enhanced outage map)
export const getNeighborhoodOutages = (params = {}) =>
  api.get('/neighborhood-outages', { params });

// WFH Score
export const getWFHScore = () =>
  api.get('/wfh-score');

// Internet Crisis Monitor
export const getInternetCrisis = () =>
  api.get('/internet-crisis');

export const getGlobalCrisis = () =>
  api.get('/internet-crisis/global');

export const getLocalCrisis = () =>
  api.get('/internet-crisis/local');

export const getCrisisHistory = (days = 7) =>
  api.get('/internet-crisis/history', { params: { days } });

export const getCrisisCommunityImpact = (hours = 24) =>
  api.get('/internet-crisis/community-impact', { params: { hours } });
