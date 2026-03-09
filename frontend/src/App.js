import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import OutageMap from './components/OutageMap';
import ReportForm from './components/ReportForm';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <h1>Internet Stability Tracker</h1>
          <div className="nav-links">
            <Link to="/">Dashboard</Link>
            <Link to="/map">Outage Map</Link>
            <Link to="/report">Report Issue</Link>
          </div>
        </nav>
        
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<OutageMap />} />
          <Route path="/report" element={<ReportForm />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
