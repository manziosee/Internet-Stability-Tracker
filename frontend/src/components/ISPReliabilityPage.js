import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton, Tooltip, LinearProgress,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { getISPReliability, getOutageEvents } from '../services/api';

const GRADE_COLOR = {
  'A+': '#43A047', A: '#66BB6A', B: '#FFA726', C: '#FF7043', D: '#EF5350', F: '#B71C1C',
};

const SEVERITY_COLOR = {
  critical: '#B71C1C',
  high: '#EF5350',
  medium: '#FFA726',
};

function GradeBadge({ grade }) {
  const color = GRADE_COLOR[grade] || '#9E9E9E';
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        borderRadius: '50%',
        fontWeight: 900,
        fontSize: 15,
        border: `2px solid ${color}`,
        color,
        bgcolor: `${color}18`,
      }}
    >
      {grade}
    </Box>
  );
}

function UptimeBar({ value }) {
  const color = value >= 97 ? '#43A047' : value >= 90 ? '#FFA726' : '#EF5350';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(value, 100)}
        sx={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 },
        }}
      />
      <Typography variant="caption" fontWeight={700} sx={{ color, minWidth: 42 }}>
        {value.toFixed(1)}%
      </Typography>
    </Box>
  );
}

export default function ISPReliabilityPage() {
  const [reliability, setReliability] = useState([]);
  const [outageEvents, setOutageEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(168);
  const [tab, setTab] = useState('reliability');

  useEffect(() => {
    fetchData();
  }, [hours]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [relRes, eventsRes] = await Promise.all([
        getISPReliability(hours),
        getOutageEvents(50),
      ]);
      setReliability(relRes.data);
      setOutageEvents(eventsRes.data);
    } catch (err) {
      console.error('ISP reliability fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1280, mx: 'auto' }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: { xs: 2.5, md: 3 },
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(7,8,13,0.92) 0%, rgba(15,16,24,0.92) 60%, rgba(17,24,38,0.9) 100%)'
              : 'linear-gradient(135deg, rgba(245,194,75,0.1) 0%, rgba(245,194,75,0.12) 100%)',
          border: (theme) =>
            `1px solid ${theme.palette.mode === 'dark' ? 'rgba(240,194,75,0.22)' : 'rgba(245,194,75,0.35)'}`,
          borderRadius: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={800}>
              ISP Reliability & Outage History
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Graded by uptime % and average download speed
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <ToggleButtonGroup
              value={hours}
              exclusive
              onChange={(_, v) => v && setHours(v)}
              size="small"
            >
              <ToggleButton value={24}>24h</ToggleButton>
              <ToggleButton value={168}>7d</ToggleButton>
              <ToggleButton value={720}>30d</ToggleButton>
            </ToggleButtonGroup>

            <ToggleButtonGroup
              value={tab}
              exclusive
              onChange={(_, v) => v && setTab(v)}
              size="small"
            >
              <ToggleButton value="reliability">
                <StarIcon sx={{ fontSize: 14, mr: 0.5 }} /> Reliability
              </ToggleButton>
              <ToggleButton value="events">
                <WarningAmberIcon sx={{ fontSize: 14, mr: 0.5 }} /> Outage Events
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#f0c24b' }} />
        </Box>
      ) : tab === 'reliability' ? (
        <ReliabilityTable data={reliability} />
      ) : (
        <OutageEventsTable data={outageEvents} />
      )}
    </Box>
  );
}

function ReliabilityTable({ data }) {
  if (data.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', border: '1px solid rgba(240,194,75,0.18)' }}>
        <Typography color="text.secondary">No data yet — run a speed test first.</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer
      component={Paper}
      sx={{ border: '1px solid rgba(240,194,75,0.18)', borderRadius: 3, overflow: 'hidden' }}
    >
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(240,194,75,0.07)' : 'rgba(240,194,75,0.08)' }}>
            <TableCell sx={{ fontWeight: 700 }}>Grade</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>ISP</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Uptime</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Avg Download</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Avg Upload</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Avg Ping</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Tests</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Outages</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, i) => (
            <TableRow
              key={row.isp}
              sx={{
                '&:hover': { bgcolor: 'rgba(240,194,75,0.04)' },
                borderLeft: i === 0 ? '3px solid #f0c24b' : 'none',
              }}
            >
              <TableCell>
                <GradeBadge grade={row.grade} />
              </TableCell>
              <TableCell>
                <Typography fontWeight={700}>{row.isp}</Typography>
              </TableCell>
              <TableCell sx={{ minWidth: 160 }}>
                <UptimeBar value={row.uptime_pct} />
              </TableCell>
              <TableCell>
                <Typography fontWeight={600} color={row.avg_download >= 25 ? '#43A047' : row.avg_download >= 5 ? '#FFA726' : '#EF5350'}>
                  {row.avg_download != null ? `${row.avg_download} Mbps` : '—'}
                </Typography>
              </TableCell>
              <TableCell>{row.avg_upload != null ? `${row.avg_upload} Mbps` : '—'}</TableCell>
              <TableCell>{row.avg_ping != null ? `${row.avg_ping} ms` : '—'}</TableCell>
              <TableCell>{row.total_tests}</TableCell>
              <TableCell>
                {row.outage_tests > 0 ? (
                  <Chip
                    label={row.outage_tests}
                    size="small"
                    icon={<WarningAmberIcon style={{ fontSize: 12 }} />}
                    sx={{ bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontWeight: 700, fontSize: 11 }}
                  />
                ) : (
                  <Chip
                    label="0"
                    size="small"
                    icon={<CheckCircleIcon style={{ fontSize: 12 }} />}
                    sx={{ bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', fontWeight: 700, fontSize: 11 }}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function OutageEventsTable({ data }) {
  if (data.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', border: '1px solid rgba(240,194,75,0.18)' }}>
        <Typography color="text.secondary">No outage events recorded yet.</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer
      component={Paper}
      sx={{ border: '1px solid rgba(240,194,75,0.18)', borderRadius: 3, overflow: 'hidden' }}
    >
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(240,194,75,0.07)' : 'rgba(240,194,75,0.08)' }}>
            <TableCell sx={{ fontWeight: 700 }}>Severity</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>ISP</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Started</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Duration</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Avg Download</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Measurements</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((ev) => (
            <TableRow key={ev.id} sx={{ '&:hover': { bgcolor: 'rgba(240,194,75,0.04)' } }}>
              <TableCell>
                <Chip
                  label={ev.severity}
                  size="small"
                  icon={<ErrorIcon style={{ fontSize: 12, color: SEVERITY_COLOR[ev.severity] }} />}
                  sx={{
                    bgcolor: `${SEVERITY_COLOR[ev.severity]}18`,
                    color: SEVERITY_COLOR[ev.severity],
                    fontWeight: 700,
                    fontSize: 11,
                    textTransform: 'capitalize',
                  }}
                />
              </TableCell>
              <TableCell>
                {ev.is_resolved ? (
                  <Chip label="Resolved" size="small" sx={{ bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', fontWeight: 700, fontSize: 11 }} />
                ) : (
                  <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontWeight: 700, fontSize: 11 }} />
                )}
              </TableCell>
              <TableCell><Typography fontWeight={600}>{ev.isp || '—'}</Typography></TableCell>
              <TableCell>{ev.location || '—'}</TableCell>
              <TableCell>
                <Tooltip title={new Date(ev.started_at).toLocaleString()}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption">
                      {new Date(ev.started_at).toLocaleString([], {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </Typography>
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell>
                {ev.duration_minutes != null
                  ? ev.duration_minutes >= 60
                    ? `${(ev.duration_minutes / 60).toFixed(1)}h`
                    : `${ev.duration_minutes}m`
                  : ev.is_resolved ? '—' : 'Ongoing'}
              </TableCell>
              <TableCell>
                {ev.avg_download != null ? `${ev.avg_download} Mbps` : '—'}
              </TableCell>
              <TableCell>{ev.measurement_count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
