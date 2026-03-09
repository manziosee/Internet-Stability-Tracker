import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { getOutages } from '../services/api';
import 'leaflet/dist/leaflet.css';
import './OutageMap.css';

function OutageMap() {
  const [outages, setOutages] = useState([]);

  useEffect(() => {
    fetchOutages();
    const interval = setInterval(fetchOutages, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchOutages = async () => {
    try {
      const res = await getOutages();
      setOutages(res.data.filter(o => o.latitude && o.longitude));
    } catch (error) {
      console.error('Error fetching outages:', error);
    }
  };

  return (
    <div className="outage-map">
      <h1>Outage Map</h1>
      <MapContainer center={[0, 0]} zoom={2} style={{ height: '600px', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {outages.map((outage) => (
          <Marker key={outage.id} position={[outage.latitude, outage.longitude]}>
            <Popup>
              <div>
                <strong>{outage.isp}</strong><br />
                Location: {outage.location}<br />
                Download: {outage.download_speed.toFixed(2)} Mbps<br />
                Time: {new Date(outage.timestamp).toLocaleString()}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default OutageMap;
