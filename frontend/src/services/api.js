import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getMeasurements = (skip = 0, limit = 100) =>
  api.get(`/measurements?skip=${skip}&limit=${limit}`);

export const getRecentMeasurements = (hours = 24) =>
  api.get(`/measurements/recent?hours=${hours}`);

export const getStats = (hours = 24) =>
  api.get(`/stats?hours=${hours}`);

export const getAlerts = () =>
  api.get('/alerts');

export const getOutages = (limit = 50) =>
  api.get(`/outages?limit=${limit}`);

export const getISPComparison = () =>
  api.get('/isp-comparison');

export const getReports = (skip = 0, limit = 100) =>
  api.get(`/reports?skip=${skip}&limit=${limit}`);

export const createReport = (data) =>
  api.post('/reports', data);

export const runTestNow = (location, lat, lon) =>
  api.post('/test-now', null, { params: { location, lat, lon } });

export const getOutageEvents = (limit = 50, resolvedOnly = false) =>
  api.get(`/outage-events?limit=${limit}&resolved_only=${resolvedOnly}`);

export const getISPReliability = (hours = 168) =>
  api.get(`/isp-reliability?hours=${hours}`);

export const getNetworkUsage = () =>
  api.get('/network-usage');

export const clearMeasurements = () =>
  api.delete('/measurements');

// ── New endpoints ──────────────────────────────────────────────────────────────

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
