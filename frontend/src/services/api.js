import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getMeasurements = (skip = 0, limit = 100) => 
  api.get(`/measurements?skip=${skip}&limit=${limit}`);

export const getRecentMeasurements = (hours = 24) => 
  api.get(`/measurements/recent?hours=${hours}`);

export const getOutages = () => 
  api.get('/outages');

export const getISPComparison = () => 
  api.get('/isp-comparison');

export const createReport = (data) => 
  api.post('/reports', data);

export const runTestNow = (location, lat, lon) => 
  api.post('/test-now', null, { params: { location, lat, lon } });
