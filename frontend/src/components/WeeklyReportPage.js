import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Alert, CircularProgress,
  Divider, Chip, LinearProgress,
} from '@mui/material';
import { motion } from 'framer-motion';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NightlightIcon from '@mui/icons-material/Nightlight';
import SpeedIcon from '@mui/icons-material/Speed';
import UploadIcon from '@mui/icons-material/Upload';
import NetworkPingIcon from '@mui/icons-material/NetworkPing';
import { getWeeklyReport } from '../services/api';

function DeltaBadge({ v }) {
  if (v == null) return null;
  if (v > 5)  return <Chip icon={<TrendingUpIcon />}  size="small" label={`+${v}%`} color="success" sx={{ fontWeight: 700, height: 22 }} />;
  if (v < -5) return <Chip icon={<TrendingDownIcon />} size="small" label={`${v}%`}  color="error"   sx={{ fontWeight: 700, height: 22 }} />;
  return       <Chip icon={<TrendingFlatIcon />}   size="small" label="stable"     color="info"    sx={{ fontWeight: 700, height: 22 }} />;
}

function StatCard({ icon: Icon, iconColor, label, value, sub, delta, progress, progressColor }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon sx={{ fontSize: 18, color: iconColor }} />
          </Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography variant="h5" fontWeight={800}>{value}</Typography>
          {delta !== undefined && <DeltaBadge v={delta} />}
        </Box>

        {sub && (
          <Typography variant="caption" color="text.secondary">{sub}</Typography>
        )}

        {progress != null && (
          <LinearProgress
            variant="determinate"
            value={Math.min(progress, 100)}
            color={progressColor || 'primary'}
            sx={{ mt: 1, height: 5, borderRadius: 3 }}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function WeeklyReportPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    getWeeklyReport()
      .then(r => setData(r.data))
      .catch(() => setError('Could not load weekly report. Make sure you have run at least one speed test.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (error)   return <Alert severity="info" sx={{ m: 3 }}>{error}</Alert>;
  if (!data)   return null;

  const dl_delta  = data.week_over_week?.download_delta_pct ?? null;
  const ul_delta  = data.week_over_week?.upload_delta_pct   ?? null;
  const uptime    = data.stats?.uptime_pct ?? 100;
  const outages   = data.stats?.outage_count ?? 0;
  const tests     = data.stats?.tests_run ?? 0;
  const avgDl     = data.stats?.avg_download;
  const avgUl     = data.stats?.avg_upload;
  const avgPing   = data.stats?.avg_ping;

  // Derive a headline sentence from available data
  const overallGood = (dl_delta == null || dl_delta >= 0) && uptime >= 99 && outages === 0;
  const headline = overallGood
    ? 'Connection was consistent this week.'
    : outages > 0
      ? `${outages} outage event${outages !== 1 ? 's' : ''} detected this week.`
      : 'Some performance fluctuations detected.';

  // Format date range
  const today     = new Date();
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const dateRange = `${fmt(weekAgo)} – ${fmt(today)}, ${today.getFullYear()}`;

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AssessmentIcon color="primary" />
              <Typography variant="h4" fontWeight={800}>Weekly Report</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{dateRange}</Typography>
          </Box>
          <Chip
            icon={outages === 0 ? <CheckCircleIcon /> : undefined}
            label={headline}
            color={outages === 0 && uptime >= 99 ? 'success' : outages > 0 ? 'error' : 'warning'}
            sx={{ fontWeight: 600, maxWidth: 360 }}
          />
        </Box>
      </motion.div>

      {/* ── Speed stats ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <StatCard
              icon={SpeedIcon}
              iconColor="#42A5F5"
              label="Avg Download"
              value={avgDl != null ? `${avgDl} Mbps` : '—'}
              sub={dl_delta != null ? `vs ${Math.abs(dl_delta)}% last week` : `${tests} tests this week`}
              delta={dl_delta}
              progress={avgDl != null ? Math.min((avgDl / 200) * 100, 100) : null}
              progressColor="info"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <StatCard
              icon={UploadIcon}
              iconColor="#66BB6A"
              label="Avg Upload"
              value={avgUl != null ? `${avgUl} Mbps` : '—'}
              sub={ul_delta != null ? `vs ${Math.abs(ul_delta)}% last week` : undefined}
              delta={ul_delta}
              progress={avgUl != null ? Math.min((avgUl / 100) * 100, 100) : null}
              progressColor="success"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <StatCard
              icon={NetworkPingIcon}
              iconColor={avgPing > 150 ? '#EF5350' : avgPing > 80 ? '#FFA726' : '#43A047'}
              label="Avg Ping"
              value={avgPing != null ? `${avgPing} ms` : '—'}
              sub={avgPing <= 80 ? 'Low latency — excellent' : avgPing <= 150 ? 'Moderate latency' : 'High latency'}
            />
          </Grid>
        </Grid>
      </motion.div>

      {/* ── Uptime + test count row ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '16px !important' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Uptime
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5 }}>
                  <Typography variant="h4" fontWeight={800} color={uptime >= 99 ? 'success.main' : uptime >= 95 ? 'warning.main' : 'error.main'}>
                    {uptime}%
                  </Typography>
                  <Chip
                    size="small"
                    label={outages === 0 ? 'No outages' : `${outages} outage${outages !== 1 ? 's' : ''}`}
                    color={outages === 0 ? 'success' : 'error'}
                    sx={{ fontWeight: 700, height: 20 }}
                  />
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={uptime}
                  color={uptime >= 99 ? 'success' : uptime >= 95 ? 'warning' : 'error'}
                  sx={{ mt: 1, height: 6, borderRadius: 3 }}
                />
              </Grid>

              <Divider orientation="vertical" flexItem sx={{ mx: 1, display: { xs: 'none', sm: 'block' } }} />

              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">Tests run</Typography>
                <Typography variant="h4" fontWeight={800}>{tests}</Typography>
                <Typography variant="caption" color="text.secondary">this week</Typography>
              </Grid>

              {(data.best_hour != null || data.worst_hour != null) && (
                <>
                  <Divider orientation="vertical" flexItem sx={{ mx: 1, display: { xs: 'none', sm: 'block' } }} />
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Box sx={{ display: 'flex', gap: 3 }}>
                      {data.best_hour != null && (
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                            <WbSunnyIcon sx={{ fontSize: 14, color: '#FFA726' }} />
                            <Typography variant="caption" color="text.secondary">Best hour</Typography>
                          </Box>
                          <Typography variant="h5" fontWeight={800} color="success.main">
                            {String(data.best_hour).padStart(2, '0')}:00
                          </Typography>
                        </Box>
                      )}
                      {data.worst_hour != null && (
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                            <NightlightIcon sx={{ fontSize: 14, color: '#7986CB' }} />
                            <Typography variant="caption" color="text.secondary">Worst hour</Typography>
                          </Box>
                          <Typography variant="h5" fontWeight={800} color="error.main">
                            {String(data.worst_hour).padStart(2, '0')}:00
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Grid>
                </>
              )}
            </Grid>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Narrative summary (clean, no markdown noise) ── */}
      {data.narrative && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Summary
              </Typography>
              <Typography variant="body2" sx={{ lineHeight: 1.8, color: 'text.primary' }}>
                {/* Strip markdown symbols and emoji to show clean prose */}
                {(data.narrative || '')
                  .replace(/\*\*/g, '')
                  .replace(/^[📊✅⚠️🔴]+\s*/gm, '')
                  .replace(/^[-•]\s*/gm, '• ')
                  .trim()}
              </Typography>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </Box>
  );
}
