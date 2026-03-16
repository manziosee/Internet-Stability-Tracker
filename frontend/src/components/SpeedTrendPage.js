import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, CircularProgress, Alert,
  ToggleButtonGroup, ToggleButton, LinearProgress, Divider,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { getSpeedTrend } from '../services/api';

const TREND_COLOR = {
  improving:         'success',
  declining:         'error',
  stable:            'info',
  insufficient_data: 'default',
};

export default function SpeedTrendPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [weeks,   setWeeks]   = useState(4);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSpeedTrend(weeks)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load speed trend data.'))
      .finally(() => setLoading(false));
  }, [weeks]);

  // Weeks that have actual measurements
  const allWeeks    = data?.data || [];
  const weeksWithData = allWeeks.filter(w => w.avg_download != null);
  const maxDl       = Math.max(...weeksWithData.map(w => w.avg_download || 0), 1);
  const trend       = data?.trend;
  const hasTrend    = trend && trend !== 'insufficient_data';

  const TrendIcon = trend === 'improving' ? TrendingUpIcon
                  : trend === 'declining' ? TrendingDownIcon
                  : TrendingFlatIcon;

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>

      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <TrendingUpIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Speed Trend</Typography>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Detects whether your internet speed is improving, stable, or declining over multiple weeks.
      </Typography>

      {/* ── Week selector ── */}
      <Box sx={{ mb: 3 }}>
        <ToggleButtonGroup
          value={weeks}
          exclusive
          size="small"
          onChange={(_, v) => v && setWeeks(v)}
        >
          {[2, 4, 8, 12].map(w => (
            <ToggleButton key={w} value={w}>{w}w</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error   && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && data && (
        <>
          {/* ── Verdict card ── */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{
                width: 48, height: 48, borderRadius: 3, flexShrink: 0,
                bgcolor: hasTrend ? (trend === 'improving' ? '#66BB6A18' : trend === 'declining' ? '#EF535018' : '#42A5F518') : 'action.hover',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <TrendIcon sx={{
                  fontSize: 28,
                  color: hasTrend
                    ? (trend === 'improving' ? '#66BB6A' : trend === 'declining' ? '#EF5350' : '#42A5F5')
                    : 'text.disabled',
                }} />
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" fontWeight={700}>
                  {data.verdict || 'No verdict available'}
                </Typography>
                {hasTrend && data.trend_pct != null ? (
                  <Typography variant="body2" color="text.secondary">
                    Net change over {weeksWithData.length} week{weeksWithData.length !== 1 ? 's' : ''}:{' '}
                    <strong style={{ color: data.trend_pct > 0 ? '#66BB6A' : data.trend_pct < 0 ? '#EF5350' : undefined }}>
                      {data.trend_pct > 0 ? '+' : ''}{data.trend_pct}%
                    </strong>
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {weeksWithData.length === 0
                      ? 'Run speed tests to start tracking trends.'
                      : weeksWithData.length === 1
                      ? 'Need at least 2 weeks of data to detect a trend.'
                      : 'Collecting more data…'}
                  </Typography>
                )}
              </Box>

              <Chip
                label={hasTrend ? trend.replace('_', ' ') : `${weeksWithData.length}/${weeks} weeks with data`}
                color={TREND_COLOR[trend] || 'default'}
                sx={{ fontWeight: 700 }}
              />
            </CardContent>
          </Card>

          {/* ── Weeks with data ── */}
          {weeksWithData.length > 0 ? (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Weeks with data
              </Typography>
              <Grid container spacing={2}>
                {weeksWithData.map((week, i) => {
                  const pct = week.avg_download ? Math.round((week.avg_download / maxDl) * 100) : 0;
                  const isLatest = weeksWithData.indexOf(week) === weeksWithData.length - 1;
                  return (
                    <Grid size={{ xs: 12, sm: 6, md: weeksWithData.length <= 2 ? 6 : 4 }} key={i}>
                      <Card variant="outlined" sx={isLatest ? { borderColor: 'primary.main', borderWidth: 2 } : {}}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="subtitle2" fontWeight={700}>
                              {week.week_label}
                            </Typography>
                            {isLatest && (
                              <Chip label="Latest" size="small" color="primary" sx={{ fontWeight: 700, height: 18, fontSize: 10 }} />
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                            {week.week_start} → {week.week_end}
                          </Typography>

                          <Box sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">Download</Typography>
                              <Typography variant="caption" fontWeight={800} color="primary">
                                {week.avg_download} Mbps
                              </Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={pct} sx={{ height: 7, borderRadius: 4 }} />
                          </Box>

                          <Divider sx={{ my: 1 }} />

                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" color="text.secondary">
                              ↑ <strong>{week.avg_upload ?? '—'}</strong> Mbps
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              <strong>{week.avg_ping ?? '—'}</strong> ms ping
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {week.sample_count} test{week.sample_count !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </>
          ) : (
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <InfoOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No speed tests recorded yet in this period.
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Run a speed test from the dashboard to start building trend data.
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* ── Empty weeks notice (collapsed, not shown as cards) ── */}
          {allWeeks.length > weeksWithData.length && weeksWithData.length > 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
              {allWeeks.length - weeksWithData.length} earlier week{allWeeks.length - weeksWithData.length !== 1 ? 's' : ''} had no data and are hidden.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
