import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

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
