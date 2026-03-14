import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, LinearProgress,
  Alert, CircularProgress, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { motion } from 'framer-motion';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import { getHealthScore } from '../services/api';

const GRADE_COLOR = { 'A+': '#43A047', 'A': '#66BB6A', 'B': '#29B6F6', 'C': '#FFA726', 'D': '#EF5350', 'F': '#B71C1C' };

export default function NetworkHealthPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    getHealthScore(7)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load health score.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (error)   return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;
  if (!data)   return null;

  const gradeColor = GRADE_COLOR[data.grade] || '#757575';
  const components = [
    { key: 'download_speed', label: 'Download Speed' },
    { key: 'upload_speed',   label: 'Upload Speed' },
    { key: 'ping_latency',   label: 'Ping / Latency' },
    { key: 'stability',      label: 'Stability' },
    { key: 'uptime',         label: 'Uptime' },
  ];

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>Network Health Score</Typography>
        <Typography color="text.secondary" gutterBottom>
          Composite score based on speed, ping, stability, and uptime — last {data.window_days} days.
        </Typography>
      </motion.div>

      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card sx={{ textAlign: 'center', py: 3 }}>
            <CardContent>
              <Typography variant="h1" fontWeight={900} sx={{ color: gradeColor, fontSize: '5rem', lineHeight: 1 }}>
                {data.grade}
              </Typography>
              <Typography variant="h3" fontWeight={700} sx={{ mt: 1 }}>
                {data.score}
                <Typography component="span" variant="h6" color="text.secondary">/100</Typography>
              </Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                {data.sample_count} tests analyzed
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Score Breakdown</Typography>
              {components.map(({ key, label }) => {
                const val   = data.components?.[key] ?? 0;
                const color = val >= 80 ? 'success' : val >= 60 ? 'primary' : val >= 40 ? 'warning' : 'error';
                return (
                  <Box key={key} mb={1.5}>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2">{label}</Typography>
                      <Typography variant="body2" fontWeight={600}>{val}</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={val} color={color}
                      sx={{ height: 8, borderRadius: 4 }} />
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {[
          { label: 'Download', value: `${data.averages?.download_mbps} Mbps` },
          { label: 'Upload',   value: `${data.averages?.upload_mbps} Mbps` },
          { label: 'Ping',     value: `${data.averages?.ping_ms} ms` },
        ].map(({ label, value }) => (
          <Grid size={{ xs: 4 }} key={label}>
            <Card variant="outlined" sx={{ textAlign: 'center', p: 1.5 }}>
              <Typography variant="h6" fontWeight={700}>{value}</Typography>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {data.tips?.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <TipsAndUpdatesIcon sx={{ mr: 1, verticalAlign: 'middle' }} />Recommendations
            </Typography>
            <List dense>
              {data.tips.map((tip, i) => (
                <ListItem key={i}>
                  <ListItemIcon><TipsAndUpdatesIcon color="warning" fontSize="small" /></ListItemIcon>
                  <ListItemText primary={tip} />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
