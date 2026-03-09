import React, { useState } from 'react';
import { createReport } from '../services/api';
import './ReportForm.css';

function ReportForm() {
  const [formData, setFormData] = useState({
    isp: '',
    location: '',
    latitude: '',
    longitude: '',
    issue_type: '',
    description: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createReport({
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude)
      });
      setSubmitted(true);
      setFormData({
        isp: '',
        location: '',
        latitude: '',
        longitude: '',
        issue_type: '',
        description: ''
      });
    } catch (error) {
      console.error('Error submitting report:', error);
    }
  };

  if (submitted) {
    return (
      <div className="report-success">
        <h2>Report Submitted!</h2>
        <p>Thank you for your contribution to the community.</p>
        <button onClick={() => setSubmitted(false)}>Submit Another Report</button>
      </div>
    );
  }

  return (
    <div className="report-form">
      <h1>Report Network Issue</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="ISP Name"
          value={formData.isp}
          onChange={(e) => setFormData({...formData, isp: e.target.value})}
          required
        />
        <input
          type="text"
          placeholder="Location"
          value={formData.location}
          onChange={(e) => setFormData({...formData, location: e.target.value})}
          required
        />
        <input
          type="number"
          step="any"
          placeholder="Latitude"
          value={formData.latitude}
          onChange={(e) => setFormData({...formData, latitude: e.target.value})}
          required
        />
        <input
          type="number"
          step="any"
          placeholder="Longitude"
          value={formData.longitude}
          onChange={(e) => setFormData({...formData, longitude: e.target.value})}
          required
        />
        <select
          value={formData.issue_type}
          onChange={(e) => setFormData({...formData, issue_type: e.target.value})}
          required
        >
          <option value="">Select Issue Type</option>
          <option value="outage">Complete Outage</option>
          <option value="slow">Slow Speeds</option>
          <option value="intermittent">Intermittent Connection</option>
          <option value="other">Other</option>
        </select>
        <textarea
          placeholder="Description"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          required
        />
        <button type="submit">Submit Report</button>
      </form>
    </div>
  );
}

export default ReportForm;