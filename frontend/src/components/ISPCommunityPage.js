import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Alert,
  TextField, Button, LinearProgress,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import { getISPCommunityStatus } from '../services/api';

const STATUS_COLOR = { healthy: 'success', degraded: 'warning', outage: 'error', no_data: 'default' };

export default function ISPCommunityPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [isp,     setIsp]     = useState('');

  const load = (ispOverride) => {
    setLoading(true);
    setError(null);
    getISPCommunityStatus(ispOverride ?? isp)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load ISP community data. Run a speed test first to detect your ISP.'))
      .finally(() => setLoading(false));
  };

  // Auto-load on mount using device's detected ISP
  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusLabel = data?.status
    ? data.status.charAt(0).toUpperCase() + data.status.slice(1).replace('_', ' ')
    : '—';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <PeopleIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>ISP Community Status</Typography>
      </Box>

      <Typography color="text.secondary" sx={{ mb: 3 }}>
        See whether internet issues are just you — or affecting all users on your ISP.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="ISP name (optional)"
          value={isp}
          onChange={e => setIsp(e.target.value)}
          size="small"
          placeholder="e.g. MTN, Airtel, Starlink…"
          sx={{ minWidth: 240 }}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <Button variant="contained" onClick={() => load()} disabled={loading}>
          {loading ? 'Checking…' : 'Check ISP Status'}
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}
      {error   && <Alert severity="info">{error}</Alert>}

      {!loading && !error && data && data.status !== 'no_data' && (
        <Grid container spacing={2}>
          {/* Status banner */}
          <Grid size={{ xs: 12 }}>
            <Card sx={{ border: `2px solid`, borderColor:
              data.status === 'healthy' ? '#43a047' :
              data.status === 'degraded' ? '#fb8c00' : '#e53935',
            }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>{data.isp}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {data.verdict}
                  </Typography>
                </Box>
                <Chip
                  label={statusLabel}
                  color={STATUS_COLOR[data.status] || 'default'}
                  sx={{ ml: 'auto', fontWeight: 700, fontSize: 14 }}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Stats */}
          {[
            { label: 'Outage Rate',     value: `${data.outage_pct}%`,          color: data.outage_pct > 20 ? '#EF5350' : '#66BB6A' },
            { label: 'Avg Download',    value: `${data.avg_download} Mbps`,    color: '#42A5F5' },
            { label: 'Avg Ping',        value: `${data.avg_ping} ms`,          color: '#FFA726' },
            { label: 'Reports (24h)',   value: data.total_reports,              color: '#CE93D8' },
            { label: 'Unique Devices',  value: data.unique_devices,             color: '#80DEEA' },
            { label: 'Window',          value: `${data.window_hours}h`,         color: '#90a4ae' },
          ].map(s => (
            <Grid size={{ xs: 6, sm: 4, md: 2 }} key={s.label}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h5" fontWeight={800} sx={{ color: s.color }}>
                    {s.value}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}

          {/* Outage rate bar */}
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Community outage rate (last 24h)
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(data.outage_pct, 100)}
                  color={data.outage_pct < 10 ? 'success' : data.outage_pct < 40 ? 'warning' : 'error'}
                  sx={{ height: 10, borderRadius: 5 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {data.outage_pct}% of {data.total_reports} measurements from {data.unique_devices} devices show an outage
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {!loading && !error && data?.status === 'no_data' && (
        <Alert severity="info">
          No community data for this ISP in the last 24 hours. Try running a speed test first.
        </Alert>
      )}
    </Box>
  );
}