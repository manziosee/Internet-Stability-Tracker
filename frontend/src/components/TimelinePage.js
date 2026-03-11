import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Typography, Paper, Chip, ToggleButtonGroup,
  ToggleButton, Skeleton, useTheme, Divider
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HistoryIcon from '@mui/icons-material/History';
import { getTimeline } from '../services/api';

const EVENT_CONFIG = {
  outage:      { color: '#EF5350', bg: 'rgba(239,83,80,0.1)',  border: 'rgba(239,83,80,0.25)',  Icon: ErrorOutlineIcon,         label: 'Outage' },
  degradation: { color: '#FFA726', bg: 'rgba(255,167,38,0.1)', border: 'rgba(255,167,38,0.25)', Icon: TrendingDownIcon,         label: 'Degradation' },
  recovery:    { color: '#43A047', bg: 'rgba(67,160,71,0.1)',  border: 'rgba(67,160,71,0.25)',  Icon: CheckCircleOutlineIcon,   label: 'Recovery' },
};

const SEVERITY_BADGE = {
  critical: { label: 'Critical', color: '#EF5350', bg: 'rgba(239,83,80,0.15)' },
  high:     { label: 'High',     color: '#FF7043', bg: 'rgba(255,112,67,0.15)' },
  medium:   { label: 'Medium',   color: '#FFA726', bg: 'rgba(255,167,38,0.15)' },
  low:      { label: 'Low',      color: '#43A047', bg: 'rgba(67,160,71,0.15)' },
};

function groupByDate(events) {
  const groups = {};
  events.forEach((e) => {
    const day = e.started_at.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  });
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

export default function TimelinePage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    getTimeline(days)
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  const grouped = data ? groupByDate(data.events) : [];

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <Paper sx={{
          mb: 3, p: { xs: 2.5, md: 3.5 },
          background: 'linear-gradient(135deg, #000 0%, #0a0800 55%, #111000 100%)',
          border: '1px solid rgba(240,194,75,0.35)',
          boxShadow: '0 8px 48px rgba(240,194,75,0.1)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <HistoryIcon sx={{ color: '#f0c24b', fontSize: 28 }} />
              <Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>Performance Timeline</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  Chronological history of outages, degradations, and recoveries
                </Typography>
              </Box>
            </Box>
            <ToggleButtonGroup value={days} exclusive onChange={(_, v) => v && setDays(v)} size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.6)', border: 0, px: 2, '&.Mui-selected': { bgcolor: '#f0c24b', color: '#000', fontWeight: 800 } } }}>
              {[7, 14, 30, 60].map((d) => <ToggleButton key={d} value={d}>{d}d</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
        </Paper>
      </motion.div>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />)}
        </Box>
      ) : !data || data.total === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 52, color: '#43A047', mb: 1.5 }} />
          </motion.div>
          <Typography variant="h6" fontWeight={700} color="text.secondary">No Events in Last {days} Days</Typography>
          <Typography variant="caption" color="text.disabled">Your connection has been stable!</Typography>
        </Paper>
      ) : (
        <Box>
          {/* Summary chips */}
          <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Chip label={`${data.total} total events`} sx={{ fontWeight: 700 }} />
            {Object.entries(
              data.events.reduce((acc, e) => ({ ...acc, [e.event_type]: (acc[e.event_type] || 0) + 1 }), {})
            ).map(([type, count]) => {
              const cfg = EVENT_CONFIG[type];
              return cfg ? (
                <Chip key={type} label={`${count} ${cfg.label.toLowerCase()}${count !== 1 ? 's' : ''}`}
                  sx={{ fontWeight: 700, bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }} />
              ) : null;
            })}
          </Box>

          {/* Grouped by date */}
          {grouped.map(([date, events], gi) => (
            <motion.div key={date} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }}>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box sx={{ height: 1, bgcolor: 'divider', flex: 1 }} />
                  <Chip
                    label={new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    size="small"
                    sx={{ fontWeight: 700, bgcolor: isDark ? 'rgba(240,194,75,0.12)' : 'rgba(240,194,75,0.1)', color: '#f0c24b', border: '1px solid rgba(240,194,75,0.25)' }}
                  />
                  <Box sx={{ height: 1, bgcolor: 'divider', flex: 1 }} />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: { xs: 0, md: 2 } }}>
                  {events.map((e, i) => {
                    const cfg = EVENT_CONFIG[e.event_type] ?? EVENT_CONFIG.degradation;
                    const sev = SEVERITY_BADGE[e.severity] ?? SEVERITY_BADGE.medium;
                    const EIcon = cfg.Icon;
                    return (
                      <motion.div key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                        <Paper sx={{
                          p: 2, bgcolor: cfg.bg, border: `1px solid ${cfg.border}`,
                          display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap',
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                            <EIcon sx={{ fontSize: 20, color: cfg.color, flexShrink: 0 }} />
                            <Box>
                              <Chip label={cfg.label} size="small" sx={{ fontWeight: 800, fontSize: 10, bgcolor: `${cfg.color}20`, color: cfg.color, mb: 0.25 }} />
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10 }}>
                                {new Date(e.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {e.ended_at && ` → ${new Date(e.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                              </Typography>
                            </Box>
                          </Box>

                          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />

                          <Box sx={{ flex: 1, minWidth: 180 }}>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                              {e.isp && <Chip label={e.isp} size="small" sx={{ fontWeight: 700, fontSize: 10 }} />}
                              {e.location && <Chip label={e.location} size="small" sx={{ fontSize: 10 }} />}
                              <Chip label={sev.label} size="small" sx={{ fontWeight: 800, fontSize: 10, bgcolor: sev.bg, color: sev.color }} />
                            </Box>
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                              {e.duration_minutes != null && (
                                <Typography variant="caption" color="text.secondary">
                                  Duration: <strong>{e.duration_minutes < 60 ? `${e.duration_minutes}m` : `${(e.duration_minutes / 60).toFixed(1)}h`}</strong>
                                </Typography>
                              )}
                              {e.avg_download != null && (
                                <Typography variant="caption" color="text.secondary">
                                  Avg speed: <strong style={{ color: '#f0c24b' }}>{e.avg_download} Mbps</strong>
                                </Typography>
                              )}
                              {e.measurement_count > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  {e.measurement_count} reading{e.measurement_count !== 1 ? 's' : ''}
                                </Typography>
                              )}
                            </Box>
                          </Box>

                          <Chip
                            label={e.is_resolved ? 'Resolved' : 'Ongoing'}
                            size="small"
                            sx={{ fontWeight: 800, fontSize: 10, alignSelf: 'center',
                              bgcolor: e.is_resolved ? 'rgba(67,160,71,0.15)' : 'rgba(239,83,80,0.15)',
                              color: e.is_resolved ? '#43A047' : '#EF5350',
                            }}
                          />
                        </Paper>
                      </motion.div>
                    );
                  })}
                </Box>
              </Box>
            </motion.div>
          ))}
        </Box>
      )}
    </Box>
  );
}
