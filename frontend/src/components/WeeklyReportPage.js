import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Alert, CircularProgress } from '@mui/material';
import { motion } from 'framer-motion';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import { getWeeklyReport } from '../services/api';

export default function WeeklyReportPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    getWeeklyReport()
      .then(r => setData(r.data))
      .catch(() => setError('Could not load weekly report.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (error)   return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;
  if (!data)   return null;

  const dl_delta = data.week_over_week?.download_delta_pct ?? 0;
  const ul_delta = data.week_over_week?.upload_delta_pct   ?? 0;

  const DeltaIcon = ({ v }) =>
    v > 5 ? <TrendingUpIcon color="success" fontSize="small" /> :
    v < -5 ? <TrendingDownIcon color="error" fontSize="small" /> :
    <TrendingFlatIcon color="info" fontSize="small" />;

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <AssessmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />Weekly Report
        </Typography>
        <Typography color="text.secondary">Performance summary for the past 7 days.</Typography>
      </motion.div>

      <Card sx={{ mt: 2, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Summary</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 2 }}>
            {data.narrative}
          </Typography>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {[
          { label: 'Avg Download', value: `${data.stats?.avg_download} Mbps`, delta: dl_delta },
          { label: 'Avg Upload',   value: `${data.stats?.avg_upload} Mbps`,   delta: ul_delta },
          { label: 'Avg Ping',     value: `${data.stats?.avg_ping} ms` },
          { label: 'Tests Run',    value: data.stats?.tests_run },
          { label: 'Uptime',       value: `${data.stats?.uptime_pct}%` },
          { label: 'Outages',      value: data.stats?.outage_count },
        ].map(({ label, value, delta }) => (
          <Grid size={{ xs: 6, sm: 4 }} key={label}>
            <Card variant="outlined" sx={{ textAlign: 'center', p: 1.5 }}>
              <Box display="flex" justifyContent="center" alignItems="center" gap={0.5}>
                <Typography variant="h5" fontWeight={700}>{value}</Typography>
                {delta !== undefined && <DeltaIcon v={delta} />}
              </Box>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              {delta !== undefined && (
                <Typography variant="caption" display="block"
                  color={delta > 0 ? 'success.main' : delta < 0 ? 'error.main' : 'text.secondary'}>
                  {delta > 0 ? '+' : ''}{delta}% vs last week
                </Typography>
              )}
            </Card>
          </Grid>
        ))}
      </Grid>

      {(data.best_hour !== null || data.worst_hour !== null) && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="body2" color="text.secondary">Best hour</Typography>
                <Typography variant="h5" fontWeight={700} color="success.main">
                  {data.best_hour != null ? `${String(data.best_hour).padStart(2,'0')}:00` : 'N/A'}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="body2" color="text.secondary">Worst hour</Typography>
                <Typography variant="h5" fontWeight={700} color="error.main">
                  {data.worst_hour != null ? `${String(data.worst_hour).padStart(2,'0')}:00` : 'N/A'}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
