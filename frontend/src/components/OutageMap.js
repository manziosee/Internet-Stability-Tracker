import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import { getOutages, getReports, getRecentMeasurements, confirmReport, rejectReport } from '../services/api';
import axios from 'axios';
import {
  Box, Typography, Paper, Chip, ToggleButtonGroup, ToggleButton,
  List, ListItem, ListItemText, Divider, Skeleton, Button, IconButton, Tooltip,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PeopleIcon from '@mui/icons-material/People';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import LayersIcon from '@mui/icons-material/Layers';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom SVG marker factory
function createMarker(color, letter) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
      <path d="M16 0C9.37 0 4 5.37 4 12c0 9 12 30 12 30s12-21 12-30C28 5.37 22.63 0 16 0z"
        fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="12" r="7" fill="white" opacity="0.9"/>
      <text x="16" y="17" font-size="9" font-weight="bold" text-anchor="middle"
        fill="${color}" font-family="Arial,sans-serif">${letter}</text>
    </svg>
  `;
  return L.divIcon({ html: svg, className: '', iconSize: [32, 42], iconAnchor: [16, 42], popupAnchor: [0, -42] });
}

const outageMarker  = createMarker('#E53935', '!');
const reportMarker  = createMarker('#F57C00', 'R');
const monitorMarker = createMarker('#43A047', '✓');

// Pulsing "you are here" marker
const userLocationIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:18px; height:18px; border-radius:50%;
    background:rgba(67,160,71,0.9);
    border:3px solid #fff;
    box-shadow:0 0 0 0 rgba(67,160,71,0.6);
    animation:pulse-green 1.8s ease-out infinite;
  "></div>
  <style>
    @keyframes pulse-green {
      0%   { box-shadow: 0 0 0 0   rgba(67,160,71,0.6); }
      70%  { box-shadow: 0 0 0 14px rgba(67,160,71,0);   }
      100% { box-shadow: 0 0 0 0   rgba(67,160,71,0);    }
    }
  </style>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -12],
});

const ISSUE_LABELS = {
  outage: 'Complete Outage',
  slow: 'Slow Speeds',
  intermittent: 'Intermittent',
  other: 'Other',
};

function MapAutoFit({ outages, reports, monitors }) {
  const map = useMap();
  useEffect(() => {
    const points = [
      ...outages.filter((o) => o.latitude && o.longitude).map((o) => [o.latitude, o.longitude]),
      ...reports.filter((r) => r.latitude && r.longitude).map((r) => [r.latitude, r.longitude]),
      ...monitors.filter((m) => m.latitude && m.longitude).map((m) => [m.latitude, m.longitude]),
    ];
    if (points.length > 0) map.fitBounds(points, { padding: [40, 40], maxZoom: 10 });
  }, [outages, reports, monitors, map]);
  return null;
}

// Heatmap layer component using leaflet.heat
function HeatmapLayer({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!window.L || !window.L.heatLayer || points.length === 0) return;
    const heat = window.L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 10, max: 1.0 });
    heat.addTo(map);
    return () => map.removeLayer(heat);
  }, [map, points]);
  return null;
}

function OutageMap() {
  const [outages, setOutages]         = useState([]);
  const [reports, setReports]         = useState([]);
  const [monitors, setMonitors]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [layer, setLayer]             = useState('both');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [verifying, setVerifying]     = useState({});
  const [userLocation, setUserLocation] = useState(null); // { lat, lon, isp, city, country }

  const fetchData = useCallback(async () => {
    try {
      const [outRes, repRes, measRes] = await Promise.all([
        getOutages(),
        getReports(),
        getRecentMeasurements(48),
      ]);
      setOutages(outRes.data.filter((o) => o.latitude && o.longitude));
      setReports(repRes.data.filter((r) => r.latitude && r.longitude));
      setMonitors(measRes.data.filter((m) => m.latitude && m.longitude && !m.is_outage));
    } catch (err) {
      console.error('Error fetching map data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Detect user's real location — browser GPS first, ip-api.com fallback
  useEffect(() => {
    const fromGeo = (lat, lon) => {
      // Enrich with ISP/city from ip-api.com
      axios.get('http://ip-api.com/json/', {
        params: { fields: 'status,country,city,isp,lat,lon' },
      }).then((r) => {
        const d = r.data || {};
        setUserLocation({ lat, lon, isp: d.isp, city: d.city, country: d.country });
      }).catch(() => setUserLocation({ lat, lon }));
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fromGeo(pos.coords.latitude, pos.coords.longitude),
        () => {
          // Permission denied — fall back entirely to ip-api.com
          axios.get('http://ip-api.com/json/', {
            params: { fields: 'status,country,city,isp,lat,lon' },
          }).then((r) => {
            const d = r.data || {};
            if (d.lat && d.lon) setUserLocation({ lat: d.lat, lon: d.lon, isp: d.isp, city: d.city, country: d.country });
          }).catch(() => {});
        },
        { timeout: 6000 }
      );
    } else {
      axios.get('http://ip-api.com/json/', {
        params: { fields: 'status,country,city,isp,lat,lon' },
      }).then((r) => {
        const d = r.data || {};
        if (d.lat && d.lon) setUserLocation({ lat: d.lat, lon: d.lon, isp: d.isp, city: d.city, country: d.country });
      }).catch(() => {});
    }
  }, []);

  const handleVerify = async (reportId, action) => {
    setVerifying((v) => ({ ...v, [reportId]: action }));
    try {
      if (action === 'confirm') await confirmReport(reportId);
      else await rejectReport(reportId);
      await fetchData();
    } catch (e) {
      console.error('Verification failed', e);
    } finally {
      setVerifying((v) => ({ ...v, [reportId]: null }));
    }
  };

  const visibleOutages  = layer === 'both' || layer === 'outages'  ? outages  : [];
  const visibleReports  = layer === 'both' || layer === 'reports'  ? reports  : [];
  const visibleMonitors = layer === 'both' || layer === 'monitors' ? monitors : [];

  // Heatmap points: outages + reports weighted by severity
  const heatPoints = [
    ...outages.map((o) => [o.latitude, o.longitude, 1.0]),
    ...reports.map((r) => [r.latitude, r.longitude, 0.6]),
  ];

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1280, mx: 'auto' }}>
      {/* Header */}
      <Paper elevation={0} sx={{
        mb: 3, p: { xs: 2.5, md: 3 },
        background: (theme) => theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, rgba(7,8,13,0.92) 0%, rgba(15,16,24,0.92) 60%, rgba(17,24,38,0.9) 100%)'
          : 'linear-gradient(135deg, rgba(245,194,75,0.1) 0%, rgba(245,194,75,0.12) 100%)',
        border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(240,194,75,0.22)' : 'rgba(245,194,75,0.35)'}`,
        borderRadius: 3, overflow: 'hidden',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={800}>Outage Map</Typography>
            <Typography variant="body2" color="text.secondary">
              Live outages and community reports — refreshed every minute
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Heatmap toggle */}
            <Tooltip title={showHeatmap ? 'Show markers' : 'Show heatmap'}>
              <IconButton onClick={() => setShowHeatmap((v) => !v)}
                sx={{ bgcolor: showHeatmap ? 'rgba(240,194,75,0.15)' : 'rgba(255,255,255,0.08)', color: showHeatmap ? '#f0c24b' : 'text.secondary', border: `1px solid ${showHeatmap ? 'rgba(240,194,75,0.3)' : 'rgba(255,255,255,0.12)'}` }}>
                <LayersIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <ToggleButtonGroup value={layer} exclusive onChange={(_, v) => v && setLayer(v)} size="small"
              sx={{ bgcolor: 'background.paper', borderRadius: 2, '& .MuiToggleButtonGroup-grouped': { border: 0, mx: 0.25 }, '& .MuiToggleButton-root': { px: 2, fontWeight: 700, borderRadius: '10px !important' } }}>
              <ToggleButton value="both">All</ToggleButton>
              <ToggleButton value="outages"><WarningAmberIcon sx={{ fontSize: 15, mr: 0.5 }} />Outages</ToggleButton>
              <ToggleButton value="reports"><PeopleIcon sx={{ fontSize: 15, mr: 0.5 }} />Reports</ToggleButton>
              <ToggleButton value="monitors">Monitoring</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
          <Chip label={`Outages: ${outages.length}`} icon={<WarningAmberIcon fontSize="small" />}
            sx={{ bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontWeight: 700, border: '1px solid rgba(239,83,80,0.25)' }} />
          <Chip label={`Reports: ${reports.length}`} icon={<PeopleIcon fontSize="small" />}
            sx={{ bgcolor: 'rgba(245,124,0,0.12)', color: '#F57C00', fontWeight: 700, border: '1px solid rgba(245,124,0,0.25)' }} />
          <Chip label={`Monitoring: ${monitors.length}`}
            sx={{ bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', fontWeight: 700, border: '1px solid rgba(67,160,71,0.25)' }} />
          {showHeatmap && <Chip label="Heatmap ON" sx={{ bgcolor: 'rgba(240,194,75,0.15)', color: '#f0c24b', fontWeight: 700, border: '1px solid rgba(240,194,75,0.3)' }} />}
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', lg: 'row' } }}>
        {/* Map */}
        <Box sx={{ flex: 1, minHeight: 520, position: 'relative' }}>
          <Box sx={{ position: 'absolute', inset: 12, borderRadius: 3, background: 'linear-gradient(135deg, rgba(240,194,75,0.18), rgba(240,194,75,0.06))', filter: 'blur(40px)', zIndex: 0 }} />
          {loading ? (
            <Skeleton variant="rectangular" height={520} sx={{ borderRadius: 2, position: 'relative', zIndex: 1 }} />
          ) : (
            <Paper sx={{ overflow: 'hidden', height: 520, position: 'relative', zIndex: 1 }}>
              <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapAutoFit outages={visibleOutages} reports={visibleReports} monitors={visibleMonitors} />

                {/* User's current location — pulsing green dot */}
                {userLocation && (
                  <>
                    <Circle
                      center={[userLocation.lat, userLocation.lon]}
                      radius={40000}
                      pathOptions={{ color: '#43A047', fillColor: '#43A047', fillOpacity: 0.08, weight: 1.5, dashArray: '6,4' }}
                    />
                    <Marker position={[userLocation.lat, userLocation.lon]} icon={userLocationIcon}>
                      <Popup>
                        <Box sx={{ minWidth: 160 }}>
                          <Typography fontWeight={700} fontSize={14} color="#43A047" mb={0.5}>Your Location</Typography>
                          {userLocation.city && <Typography fontSize={13}><strong>City:</strong> {userLocation.city}</Typography>}
                          {userLocation.country && <Typography fontSize={13}><strong>Country:</strong> {userLocation.country}</Typography>}
                          {userLocation.isp && <Typography fontSize={13}><strong>ISP:</strong> {userLocation.isp}</Typography>}
                          <Typography fontSize={12} color="text.secondary" mt={0.5}>
                            {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
                          </Typography>
                        </Box>
                      </Popup>
                    </Marker>
                  </>
                )}

                {showHeatmap && heatPoints.length > 0 && <HeatmapLayer points={heatPoints} />}

                {!showHeatmap && visibleOutages.map((outage) => (
                  <Marker key={`outage-${outage.id}`} position={[outage.latitude, outage.longitude]} icon={outageMarker}>
                    <Popup>
                      <Box sx={{ minWidth: 180 }}>
                        <Typography fontWeight={700} fontSize={14} color="#E53935" mb={0.5}>Automated Outage</Typography>
                        <Typography fontSize={13}><strong>ISP:</strong> {outage.isp}</Typography>
                        {outage.location && <Typography fontSize={13}><strong>Location:</strong> {outage.location}</Typography>}
                        <Typography fontSize={13}><strong>Download:</strong> {outage.download_speed?.toFixed(2)} Mbps</Typography>
                        <Typography fontSize={12} color="text.secondary" mt={0.5}>{new Date(outage.timestamp).toLocaleString()}</Typography>
                      </Box>
                    </Popup>
                  </Marker>
                ))}

                {!showHeatmap && visibleMonitors.map((m) => (
                  <Marker key={`monitor-${m.id}`} position={[m.latitude, m.longitude]} icon={monitorMarker}>
                    <Popup>
                      <Box sx={{ minWidth: 180 }}>
                        <Typography fontWeight={700} fontSize={14} color="#43A047" mb={0.5}>Monitoring Point</Typography>
                        <Typography fontSize={13}><strong>ISP:</strong> {m.isp}</Typography>
                        {m.location && <Typography fontSize={13}><strong>Location:</strong> {m.location}</Typography>}
                        <Typography fontSize={13}><strong>Download:</strong> {m.download_speed?.toFixed(1)} Mbps</Typography>
                        <Typography fontSize={13}><strong>Ping:</strong> {m.ping?.toFixed(0)} ms</Typography>
                        <Typography fontSize={12} color="text.secondary" mt={0.5}>{new Date(m.timestamp).toLocaleString()}</Typography>
                      </Box>
                    </Popup>
                  </Marker>
                ))}

                {!showHeatmap && visibleReports.map((report) => (
                  <Marker key={`report-${report.id}`} position={[report.latitude, report.longitude]} icon={reportMarker}>
                    <Popup>
                      <Box sx={{ minWidth: 200 }}>
                        <Typography fontWeight={700} fontSize={14} color="#F57C00" mb={0.5}>Community Report</Typography>
                        <Typography fontSize={13}><strong>ISP:</strong> {report.isp}</Typography>
                        <Typography fontSize={13}><strong>Location:</strong> {report.location}</Typography>
                        <Typography fontSize={13}><strong>Issue:</strong> {ISSUE_LABELS[report.issue_type] || report.issue_type}</Typography>
                        {report.description && <Typography fontSize={12} color="text.secondary" mt={0.5}>{report.description}</Typography>}
                        {/* Verification counts */}
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                          {report.confirmations > 0 && (
                            <Chip label={`✓ ${report.confirmations} confirmed`} size="small" sx={{ bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', fontSize: 10, fontWeight: 700 }} />
                          )}
                          {report.rejections > 0 && (
                            <Chip label={`✗ ${report.rejections} rejected`} size="small" sx={{ bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontSize: 10, fontWeight: 700 }} />
                          )}
                          {report.status === 'confirmed' && (
                            <Chip label="CONFIRMED" size="small" sx={{ bgcolor: 'rgba(67,160,71,0.2)', color: '#43A047', fontWeight: 800, fontSize: 10 }} />
                          )}
                        </Box>
                        {/* Verify buttons */}
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Button size="small" startIcon={<ThumbUpIcon sx={{ fontSize: 13 }} />}
                            disabled={!!verifying[report.id]}
                            onClick={() => handleVerify(report.id, 'confirm')}
                            sx={{ fontSize: 11, py: 0.25, bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', '&:hover': { bgcolor: 'rgba(67,160,71,0.22)' } }}>
                            Confirm
                          </Button>
                          <Button size="small" startIcon={<ThumbDownIcon sx={{ fontSize: 13 }} />}
                            disabled={!!verifying[report.id]}
                            onClick={() => handleVerify(report.id, 'reject')}
                            sx={{ fontSize: 11, py: 0.25, bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', '&:hover': { bgcolor: 'rgba(239,83,80,0.22)' } }}>
                            Reject
                          </Button>
                        </Box>
                        <Typography fontSize={12} color="text.secondary" mt={0.5}>{new Date(report.timestamp).toLocaleString()}</Typography>
                      </Box>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </Paper>
          )}

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['#E53935', `Outage (${outages.length})`], ['#F57C00', `Report (${reports.length})`], ['#43A047', `Monitor (${monitors.length})`]].map(([color, label]) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </Box>
            ))}
            {userLocation && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#43A047', border: '2px solid #fff', boxShadow: '0 0 0 2px #43A047' }} />
                <Typography variant="caption" color="text.secondary">You ({userLocation.city || 'Your Location'})</Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Side panel */}
        <Box sx={{ width: { xs: '100%', lg: 300 }, flexShrink: 0 }}>
          <Paper sx={{ p: 2, height: { lg: 500 }, overflow: 'auto', border: '1px solid rgba(240,194,75,0.18)', background: (theme) => theme.palette.mode === 'dark' ? '#0e121b' : '#fff' }}>
            <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Recent Activity</Typography>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={60} sx={{ mb: 0.5 }} />)
            ) : (
              <List dense disablePadding>
                {[
                  ...outages.slice(0, 5).map((o) => ({ ...o, _type: 'outage' })),
                  ...reports.slice(0, 5).map((r) => ({ ...r, _type: 'report' })),
                  ...monitors.slice(0, 5).map((m) => ({ ...m, _type: 'monitor' })),
                ]
                  .sort((a, b) => new Date(b.timestamp || b.started_at) - new Date(a.timestamp || a.started_at))
                  .slice(0, 12)
                  .map((item, idx) => (
                    <React.Fragment key={`${item._type}-${item.id}`}>
                      {idx > 0 && <Divider />}
                      <ListItem sx={{ px: 0, py: 1 }}>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip label={item._type === 'outage' ? 'Outage' : item._type === 'report' ? 'Report' : 'OK'} size="small"
                                sx={{ bgcolor: item._type === 'outage' ? '#FFEBEE' : item._type === 'report' ? '#FFF3E0' : '#E8F5E9', color: item._type === 'outage' ? '#E53935' : item._type === 'report' ? '#F57C00' : '#43A047', fontWeight: 700, fontSize: 10, height: 20 }} />
                              <Typography variant="body2" fontWeight={600} noWrap>{item.isp}</Typography>
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography variant="caption" color="text.secondary" display="block">
                                {item.location || 'Unknown location'}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                                <Typography variant="caption" color="text.disabled">
                                  {new Date(item.timestamp || item.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                                {item._type === 'report' && (item.confirmations > 0 || item.rejections > 0) && (
                                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    {item.confirmations > 0 && <Chip label={`✓${item.confirmations}`} size="small" sx={{ height: 14, fontSize: 9, bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', fontWeight: 700 }} />}
                                    {item.rejections > 0 && <Chip label={`✗${item.rejections}`} size="small" sx={{ height: 14, fontSize: 9, bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontWeight: 700 }} />}
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          }
                        />
                      </ListItem>
                    </React.Fragment>
                  ))}
                {outages.length === 0 && reports.length === 0 && monitors.length === 0 && (
                  <Typography color="text.secondary" variant="body2" py={2} textAlign="center">
                    No activity yet — run a speed test with location enabled
                  </Typography>
                )}
              </List>
            )}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

export default OutageMap;
