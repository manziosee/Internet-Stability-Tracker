import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, LinearProgress,
  Alert, CircularProgress, List, ListItem, ListItemIcon, ListItemText,
  ToggleButtonGroup, ToggleButton, IconButton, Tooltip, Chip,
} from '@mui/material';
import { motion } from 'framer-motion';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getHealthScore } from '../services/api';

const GRADE_COLOR = {
  'A+': '#43A047', 'A': '#66BB6A', 'B': '#29B6F6',
  'C': '#FFA726', 'D': '#EF5350', 'F': '#B71C1C', 'N/A': '#757575',
};

const COMPONENT_META = [
  { key: 'download_speed', label: 'Download Speed',  desc: '25% weight — based on avg vs 100 Mbps baseline' },
  { key: 'upload_speed',   label: 'Upload Speed',    desc: '20% weight — based on avg vs 50 Mbps baseline' },
  { key: 'ping_latency',   label: 'Ping / Latency',  desc: '25% weight — ≤20 ms = 100, ≥250 ms = 10' },
  { key: 'stability',      label: 'Stability',       desc: '15% weight — speed consistency (min/mean + low variance)' },
  { key: 'uptime',         label: 'Uptime',          desc: '15% weight — % of time without detected outages' },
];

export default function NetworkHealthPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [window,  setWindow]  = useState(7);

  const load = (w) => {
    setLoading(true);
    setError('');
    getHealthScore(w ?? window)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load health score. Run a speed test first.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(window); }, [window]); // eslint-disable-line

  const gradeColor = GRADE_COLOR[data?.grade] || '#757575';

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h4" fontWeight={700}>Network Health Score</Typography>
            <Typography color="text.secondary" variant="body2">
              Composite score based on speed, ping, stability, and uptime — live from your test data.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ToggleButtonGroup value={window} exclusive size="small"
              onChange={(_, v) => v && setWindow(v)}>
              <ToggleButton value={1}>24h</ToggleButton>
              <ToggleButton value={7}>7d</ToggleButton>
              <ToggleButton value={30}>30d</ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title="Refresh">
              <span>
                <IconButton onClick={() => load()} disabled={loading} size="small">
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </motion.div>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error    && <Alert severity="info" sx={{ mt: 2 }}>{error}</Alert>}

      {!loading && !error && data && (
        <Grid container spacing={3} sx={{ mt: 1 }}>
          {/* Grade card */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ textAlign: 'center', py: 3, height: '100%' }}>
              <CardContent>
                <motion.div
                  key={data.grade}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                >
                  <Typography variant="h1" fontWeight={900}
                    sx={{ color: gradeColor, fontSize: '5rem', lineHeight: 1 }}>
                    {data.grade}
                  </Typography>
                </motion.div>
                <Typography variant="h3" fontWeight={700} sx={{ mt: 1 }}>
                  {data.score}
                  <Typography component="span" variant="h6" color="text.secondary">/100</Typography>
                </Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                  {data.sample_count} tests · last {data.window_days}d
                </Typography>
                <Chip
                  label={
                    data.score >= 90 ? 'Excellent' :
                    data.score >= 80 ? 'Very Good' :
                    data.score >= 70 ? 'Good' :
                    data.score >= 60 ? 'Fair' :
                    data.score >= 50 ? 'Poor' : 'Very Poor'
                  }
                  color={
                    data.score >= 80 ? 'success' :
                    data.score >= 60 ? 'warning' : 'error'
                  }
                  sx={{ mt: 1.5 }}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Score breakdown */}
          <Grid size={{ xs: 12, sm: 8 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Score Breakdown</Typography>
                {COMPONENT_META.map(({ key, label, desc }) => {
                  const val   = data.components?.[key] ?? 0;
                  const color = val >= 80 ? 'success' : val >= 60 ? 'primary' : val >= 40 ? 'warning' : 'error';
                  return (
                    <Tooltip title={desc} placement="left" key={key}>
                      <Box mb={1.5} sx={{ cursor: 'default' }}>
                        <Box display="flex" justifyContent="space-between" mb={0.5}>
                          <Typography variant="body2">{label}</Typography>
                          <Typography variant="body2" fontWeight={700}
                            color={val >= 80 ? 'success.main' : val >= 60 ? 'primary.main' : val >= 40 ? 'warning.main' : 'error.main'}>
                            {val}
                          </Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={val} color={color}
                          sx={{ height: 8, borderRadius: 4 }} />
                      </Box>
                    </Tooltip>
                  );
                })}
              </CardContent>
            </Card>
          </Grid>

          {/* Averages */}
          {[
            { label: 'Avg Download', value: `${data.averages?.download_mbps} Mbps`, color: '#42A5F5' },
            { label: 'Avg Upload',   value: `${data.averages?.upload_mbps} Mbps`,   color: '#66BB6A' },
            { label: 'Avg Ping',     value: `${data.averages?.ping_ms} ms`,          color: '#FFA726' },
          ].map(({ label, value, color }) => (
            <Grid size={{ xs: 4 }} key={label}>
              <Card variant="outlined" sx={{ textAlign: 'center', p: 1.5 }}>
                <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </Card>
            </Grid>
          ))}

          {/* Tips */}
          {data.tips?.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <TipsAndUpdatesIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Recommendations
                  </Typography>
                  <List dense disablePadding>
                    {data.tips.map((tip, i) => (
                      <ListItem key={i} disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <TipsAndUpdatesIcon color="warning" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={tip} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}
