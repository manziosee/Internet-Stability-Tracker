import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { getOutages, getReports, getRecentMeasurements } from '../services/api';
import {
  Box, Typography, Paper, Chip, ToggleButtonGroup, ToggleButton,
  List, ListItem, ListItemText, Divider, Skeleton
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PeopleIcon from '@mui/icons-material/People';
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
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
  });
}

const outageMarker = createMarker('#E53935', '!');
const reportMarker = createMarker('#F57C00', 'R');
const monitorMarker = createMarker('#43A047', '✓');

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
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 10 });
    }
  }, [outages, reports, monitors, map]);
  return null;
}

function OutageMap() {
  const [outages, setOutages] = useState([]);
  const [reports, setReports] = useState([]);
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState('both');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [outRes, repRes, measRes] = await Promise.all([
        getOutages(),
        getReports(),
        getRecentMeasurements(48),
      ]);
      setOutages(outRes.data.filter((o) => o.latitude && o.longitude));
      setReports(repRes.data.filter((r) => r.latitude && r.longitude));
      // Only show non-outage measurements that have coordinates as monitoring points
      setMonitors(measRes.data.filter((m) => m.latitude && m.longitude && !m.is_outage));
    } catch (err) {
      console.error('Error fetching map data:', err);
    } finally {
      setLoading(false);
    }
  };

  const visibleOutages = layer === 'both' || layer === 'outages' ? outages : [];
  const visibleReports = layer === 'both' || layer === 'reports' ? reports : [];
  const visibleMonitors = layer === 'both' || layer === 'monitors' ? monitors : [];

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1280, mx: 'auto' }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: { xs: 2.5, md: 3 },
          background: (theme) => theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(7,8,13,0.92) 0%, rgba(15,16,24,0.92) 60%, rgba(17,24,38,0.9) 100%)'
            : 'linear-gradient(135deg, rgba(245,194,75,0.1) 0%, rgba(245,194,75,0.12) 100%)',
          border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(240,194,75,0.22)' : 'rgba(245,194,75,0.35)'}`,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={800}>
              Outage Map
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Live outages and community reports, refreshed every minute
            </Typography>
          </Box>
          <ToggleButtonGroup
            value={layer}
            exclusive
            onChange={(_, v) => v && setLayer(v)}
            size="small"
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: (theme) => theme.palette.mode === 'dark'
                ? '0 10px 30px rgba(0,0,0,0.35)'
                : '0 10px 30px rgba(0,0,0,0.08)',
              '& .MuiToggleButtonGroup-grouped': { border: 0, mx: 0.25 },
              '& .MuiToggleButton-root': {
                px: 2,
                fontWeight: 700,
                letterSpacing: 0.2,
                borderRadius: '10px !important',
              },
            }}
          >
            <ToggleButton value="both">All</ToggleButton>
            <ToggleButton value="outages">
              <WarningAmberIcon sx={{ fontSize: 15, mr: 0.5 }} /> Outages
            </ToggleButton>
            <ToggleButton value="reports">
              <PeopleIcon sx={{ fontSize: 15, mr: 0.5 }} /> Reports
            </ToggleButton>
            <ToggleButton value="monitors">
              Monitoring
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
          <Chip
            label={`Outages: ${outages.length}`}
            icon={<WarningAmberIcon fontSize="small" />}
            sx={{ bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontWeight: 700, border: '1px solid rgba(239,83,80,0.25)' }}
          />
          <Chip
            label={`Reports: ${reports.length}`}
            icon={<PeopleIcon fontSize="small" />}
            sx={{ bgcolor: 'rgba(245,124,0,0.12)', color: '#F57C00', fontWeight: 700, border: '1px solid rgba(245,124,0,0.25)' }}
          />
          <Chip
            label={`Monitoring: ${monitors.length}`}
            sx={{ bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', fontWeight: 700, border: '1px solid rgba(67,160,71,0.25)' }}
          />
          <Chip
            label="Auto-fit enabled"
            sx={{ bgcolor: 'rgba(240,194,75,0.12)', color: '#f0c24b', fontWeight: 700, border: '1px solid rgba(240,194,75,0.22)' }}
          />
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', lg: 'row' } }}>
        {/* Map */}
        <Box sx={{ flex: 1, minHeight: 520, position: 'relative' }}>
          <Box
            sx={{
              position: 'absolute',
              inset: 12,
              borderRadius: 3,
              background: 'linear-gradient(135deg, rgba(240,194,75,0.18), rgba(240,194,75,0.06))',
              filter: 'blur(40px)',
              zIndex: 0,
            }}
          />
          {loading ? (
            <Skeleton variant="rectangular" height={520} sx={{ borderRadius: 2, position: 'relative', zIndex: 1 }} />
          ) : (
            <Paper sx={{ overflow: 'hidden', height: 520, position: 'relative', zIndex: 1, backdropFilter: 'blur(6px)' }}>
              <MapContainer
                center={[20, 0]}
                zoom={2}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapAutoFit outages={visibleOutages} reports={visibleReports} monitors={visibleMonitors} />

                {visibleOutages.map((outage) => (
                  <Marker key={`outage-${outage.id}`} position={[outage.latitude, outage.longitude]} icon={outageMarker}>
                    <Popup>
                      <Box sx={{ minWidth: 180 }}>
                        <Typography fontWeight={700} fontSize={14} color="#E53935" mb={0.5}>
                          Automated Outage
                        </Typography>
                        <Typography fontSize={13}><strong>ISP:</strong> {outage.isp}</Typography>
                        {outage.location && (
                          <Typography fontSize={13}><strong>Location:</strong> {outage.location}</Typography>
                        )}
                        <Typography fontSize={13}>
                          <strong>Download:</strong> {outage.download_speed?.toFixed(2)} Mbps
                        </Typography>
                        <Typography fontSize={12} color="text.secondary" mt={0.5}>
                          {new Date(outage.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    </Popup>
                  </Marker>
                ))}

                {visibleMonitors.map((m) => (
                  <Marker key={`monitor-${m.id}`} position={[m.latitude, m.longitude]} icon={monitorMarker}>
                    <Popup>
                      <Box sx={{ minWidth: 180 }}>
                        <Typography fontWeight={700} fontSize={14} color="#43A047" mb={0.5}>
                          Monitoring Point
                        </Typography>
                        <Typography fontSize={13}><strong>ISP:</strong> {m.isp}</Typography>
                        {m.location && <Typography fontSize={13}><strong>Location:</strong> {m.location}</Typography>}
                        <Typography fontSize={13}><strong>Download:</strong> {m.download_speed?.toFixed(1)} Mbps</Typography>
                        <Typography fontSize={13}><strong>Upload:</strong> {m.upload_speed?.toFixed(1)} Mbps</Typography>
                        <Typography fontSize={13}><strong>Ping:</strong> {m.ping?.toFixed(0)} ms</Typography>
                        <Typography fontSize={12} color="text.secondary" mt={0.5}>
                          {new Date(m.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    </Popup>
                  </Marker>
                ))}

                {visibleReports.map((report) => (
                  <Marker key={`report-${report.id}`} position={[report.latitude, report.longitude]} icon={reportMarker}>
                    <Popup>
                      <Box sx={{ minWidth: 180 }}>
                        <Typography fontWeight={700} fontSize={14} color="#F57C00" mb={0.5}>
                          Community Report
                        </Typography>
                        <Typography fontSize={13}><strong>ISP:</strong> {report.isp}</Typography>
                        <Typography fontSize={13}><strong>Location:</strong> {report.location}</Typography>
                        <Typography fontSize={13}>
                          <strong>Issue:</strong> {ISSUE_LABELS[report.issue_type] || report.issue_type}
                        </Typography>
                        {report.description && (
                          <Typography fontSize={12} color="text.secondary" mt={0.5}>
                            {report.description}
                          </Typography>
                        )}
                        <Typography fontSize={12} color="text.secondary" mt={0.5}>
                          {new Date(report.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </Paper>
          )}

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#E53935' }} />
              <Typography variant="caption" color="text.secondary">Outage ({outages.length})</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#F57C00' }} />
              <Typography variant="caption" color="text.secondary">Report ({reports.length})</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#43A047' }} />
              <Typography variant="caption" color="text.secondary">Monitoring ({monitors.length})</Typography>
            </Box>
          </Box>
        </Box>

        {/* Side panel */}
        <Box sx={{ width: { xs: '100%', lg: 300 }, flexShrink: 0 }}>
          <Paper sx={{ p: 2, height: { lg: 500 }, overflow: 'auto', border: '1px solid rgba(240,194,75,0.18)', background: (theme) => theme.palette.mode === 'dark' ? '#0e121b' : '#fff' }}>
            <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
              Recent Activity
            </Typography>

            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={60} sx={{ mb: 0.5 }} />
              ))
            ) : (
              <List dense disablePadding>
                {[
                  ...outages.slice(0, 5).map((o) => ({ ...o, _type: 'outage' })),
                  ...reports.slice(0, 5).map((r) => ({ ...r, _type: 'report' })),
                  ...monitors.slice(0, 5).map((m) => ({ ...m, _type: 'monitor' })),
                ]
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .slice(0, 12)
                  .map((item, idx) => (
                    <React.Fragment key={`${item._type}-${item.id}`}>
                      {idx > 0 && <Divider />}
                      <ListItem sx={{ px: 0, py: 1 }}>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip
                                label={item._type === 'outage' ? 'Outage' : item._type === 'report' ? 'Report' : 'OK'}
                                size="small"
                                sx={{
                                  bgcolor: item._type === 'outage' ? '#FFEBEE' : item._type === 'report' ? '#FFF3E0' : '#E8F5E9',
                                  color: item._type === 'outage' ? '#E53935' : item._type === 'report' ? '#F57C00' : '#43A047',
                                  fontWeight: 700,
                                  fontSize: 10,
                                  height: 20,
                                }}
                              />
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {item.isp}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary">
                              {item.location || 'Unknown location'} ·{' '}
                              {new Date(item.timestamp).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Typography>
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
