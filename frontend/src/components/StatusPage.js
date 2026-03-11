import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Typography, Paper, Grid, Chip, CircularProgress,
  LinearProgress, Skeleton, useTheme
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PublicIcon from '@mui/icons-material/Public';
import SpeedIcon from '@mui/icons-material/Speed';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { getGlobalStatus } from '../services/api';

const STATUS_CONFIG = {
  healthy:  { label: 'All Systems Operational', color: '#43A047', bg: 'rgba(67,160,71,0.12)',  border: 'rgba(67,160,71,0.3)',  Icon: CheckCircleOutlineIcon },
  degraded: { label: 'Partial Degradation',     color: '#FFA726', bg: 'rgba(255,167,38,0.12)', border: 'rgba(255,167,38,0.3)', Icon: WarningAmberIcon },
  outage:   { label: 'Outage Detected',          color: '#EF5350', bg: 'rgba(239,83,80,0.12)',  border: 'rgba(239,83,80,0.3)',  Icon: ErrorOutlineIcon },
};

function UptimeBar({ pct, color }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress
        variant="determinate"
        value={pct ?? 100}
        sx={{
          flex: 1, height: 8, borderRadius: 4,
          bgcolor: 'rgba(255,255,255,0.06)',
          '& .MuiLinearProgress-bar': {
            background: `linear-gradient(90deg, ${color} 0%, ${color}99 100%)`,
            borderRadius: 4,
          },
        }}
      />
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 42, textAlign: 'right', color }}>
        {pct != null ? `${pct}%` : 'N/A'}
      </Typography>
    </Box>
  );
}

export default function StatusPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      getGlobalStatus()
        .then((r) => setData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const statusCfg = data ? STATUS_CONFIG[data.status] ?? STATUS_CONFIG.healthy : null;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <Paper sx={{
          mb: 3, p: { xs: 2.5, md: 3.5 },
          background: 'linear-gradient(135deg, #000 0%, #0a0800 55%, #111000 100%)',
          border: '1px solid rgba(240,194,75,0.35)',
          boxShadow: '0 8px 48px rgba(240,194,75,0.1)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <PublicIcon sx={{ color: '#f0c24b', fontSize: 28 }} />
            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>Global Internet Status</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                Real-time platform health — refreshes every 30s
              </Typography>
            </Box>
          </Box>
        </Paper>
      </motion.div>

      {/* Overall Status Banner */}
      {loading ? (
        <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 3, mb: 3 }} />
      ) : data && statusCfg ? (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Paper sx={{
            mb: 3, p: 3,
            bgcolor: statusCfg.bg,
            border: `2px solid ${statusCfg.border}`,
            borderRadius: 3,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <statusCfg.Icon sx={{ fontSize: 40, color: statusCfg.color }} />
                <Box>
                  <Typography variant="h5" fontWeight={900} sx={{ color: statusCfg.color }}>{statusCfg.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Last checked: {new Date(data.checked_at).toLocaleTimeString()}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Chip label={`${data.active_outages} active outage${data.active_outages !== 1 ? 's' : ''}`}
                  sx={{ fontWeight: 800, bgcolor: data.active_outages > 0 ? 'rgba(239,83,80,0.15)' : 'rgba(67,160,71,0.15)', color: data.active_outages > 0 ? '#EF5350' : '#43A047', border: `1px solid ${data.active_outages > 0 ? 'rgba(239,83,80,0.3)' : 'rgba(67,160,71,0.3)'}` }} />
                <Chip label={`${data.open_reports} open report${data.open_reports !== 1 ? 's' : ''}`}
                  sx={{ fontWeight: 700, bgcolor: 'rgba(240,194,75,0.12)', color: '#f0c24b', border: '1px solid rgba(240,194,75,0.25)' }} />
              </Box>
            </Box>
          </Paper>
        </motion.div>
      ) : null}

      {/* Key Metrics */}
      {!loading && data && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: '24h Avg Download', value: data.avg_download_24h != null ? `${data.avg_download_24h} Mbps` : 'N/A', icon: SpeedIcon, color: '#f0c24b' },
            { label: '24h Uptime', value: data.uptime_pct_24h != null ? `${data.uptime_pct_24h}%` : 'N/A', icon: CheckCircleOutlineIcon, color: data.uptime_pct_24h >= 95 ? '#43A047' : '#FFA726' },
            { label: '7-Day Tests', value: data.total_measurements_7d, icon: AccessTimeIcon, color: '#42A5F5' },
            { label: 'Open Reports', value: data.open_reports, icon: ReportProblemIcon, color: data.open_reports > 0 ? '#FFA726' : '#43A047' },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <Grid size={{ xs: 6, md: 3 }} key={label}>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}>
                <Paper sx={{ p: 2.5, background: isDark ? '#080808' : '#fff', border: `1px solid ${color}30`, textAlign: 'center' }}>
                  <Icon sx={{ fontSize: 28, color, mb: 0.5 }} />
                  <Typography variant="h5" fontWeight={900} sx={{ color }}>{value}</Typography>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
                </Paper>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 7-Day Daily Timeline */}
      {!loading && data?.daily_summary?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>7-Day Daily Uptime</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
              {data.daily_summary.map((day, i) => {
                const color = day.uptime_pct >= 95 ? '#43A047' : day.uptime_pct >= 80 ? '#FFA726' : '#EF5350';
                return (
                  <motion.div key={day.date} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 90, color: 'text.secondary' }}>
                        {new Date(day.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Typography>
                      <Box sx={{ flex: 1 }}>
                        <UptimeBar pct={day.uptime_pct} color={color} />
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, minWidth: 120, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <Chip label={`${day.tests} tests`} size="small" sx={{ fontWeight: 600, fontSize: 10 }} />
                        {day.outages > 0 && (
                          <Chip label={`${day.outages} outage${day.outages !== 1 ? 's' : ''}`} size="small"
                            sx={{ fontWeight: 700, fontSize: 10, bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350' }} />
                        )}
                      </Box>
                    </Box>
                  </motion.div>
                );
              })}
            </Box>
          </Paper>
        </motion.div>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#f0c24b' }} />
        </Box>
      )}
    </Box>
  );
}
