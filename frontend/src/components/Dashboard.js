import React, { useState, useEffect } from 'react';
import { getRecentMeasurements, getISPComparison, runTestNow } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import './Dashboard.css';

function Dashboard() {
  const [measurements, setMeasurements] = useState([]);
  const [ispData, setIspData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [measRes, ispRes] = await Promise.all([
        getRecentMeasurements(24),
        getISPComparison()
      ]);
      setMeasurements(measRes.data);
      setIspData(ispRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      await runTestNow();
      await fetchData();
    } catch (error) {
      console.error('Error running test:', error);
    }
    setTesting(false);
  };

  if (loading) return <div className="loading">Loading...</div>;

  const chartData = measurements.map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString(),
    download: m.download_speed,
    upload: m.upload_speed,
    ping: m.ping
  }));

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Internet Stability Dashboard</h1>
        <button 
          className="test-button" 
          onClick={runTest} 
          disabled={testing}
        >
          {testing ? 'Testing...' : 'Run Test Now'}
        </button>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Tests</h3>
          <p className="stat-value">{measurements.length}</p>
        </div>
        <div className="stat-card">
          <h3>Outages</h3>
          <p className="stat-value">{measurements.filter(m => m.is_outage).length}</p>
        </div>
        <div className="stat-card">
          <h3>Avg Download</h3>
          <p className="stat-value">
            {(measurements.reduce((a, b) => a + b.download_speed, 0) / measurements.length).toFixed(2)} Mbps
          </p>
        </div>
      </div>

      <div className="chart-container">
        <h2>Speed Over Time</h2>
        <LineChart width={800} height={300} data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="download" stroke="#8884d8" name="Download (Mbps)" />
          <Line type="monotone" dataKey="upload" stroke="#82ca9d" name="Upload (Mbps)" />
        </LineChart>
      </div>

      <div className="isp-comparison">
        <h2>ISP Comparison</h2>
        <table>
          <thead>
            <tr>
              <th>ISP</th>
              <th>Avg Download</th>
              <th>Avg Upload</th>
              <th>Avg Ping</th>
              <th>Tests</th>
            </tr>
          </thead>
          <tbody>
            {ispData.map((isp, idx) => (
              <tr key={idx}>
                <td>{isp.isp}</td>
                <td>{isp.avg_download?.toFixed(2)} Mbps</td>
                <td>{isp.avg_upload?.toFixed(2)} Mbps</td>
                <td>{isp.avg_ping?.toFixed(2)} ms</td>
                <td>{isp.total_tests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
