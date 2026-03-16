import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Alert,
  ToggleButtonGroup, ToggleButton, Tooltip,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { getUptimeCalendar } from '../services/api';

const LEVEL_COLORS = ['#1a1a2e', '#1b5e20', '#2e7d32', '#43a047'];
const LEVEL_LABELS = ['No data', 'Poor (<90%)', 'Good (90–99%)', 'Perfect (≥99%)'];

export default function UptimeCalendarPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [days,    setDays]    = useState(90);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getUptimeCalendar(days)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load uptime calendar. Run some speed tests first.'))
      .finally(() => setLoading(false));
  }, [days]);

  const calendar   = data?.calendar   || [];
  const summary    = data?.summary    || {};

  // Build week columns for grid display
  const weeks = [];
  for (let i = 0; i < calendar.length; i += 7) {
    weeks.push(calendar.slice(i, i + 7));
  }

  const statCards = [
    { label: 'Avg Uptime',    value: summary.avg_uptime_pct != null ? `${summary.avg_uptime_pct}%` : '—', color: '#66BB6A' },
    { label: 'Perfect Days',  value: summary.perfect_days  ?? '—',                                        color: '#42A5F5' },
    { label: 'Outage Days',   value: summary.outage_days   ?? '—',                                        color: '#EF5350' },
    { label: 'Days Tracked',  value: summary.tracked_days  ?? '—',                                        color: '#FFA726' },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <CalendarMonthIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Uptime Calendar</Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <ToggleButtonGroup
          value={days}
          exclusive
          size="small"
          onChange={(_, v) => v && setDays(v)}
        >
          {[30, 60, 90].map(d => (
            <ToggleButton key={d} value={d}>{d} days</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error   && <Alert severity="info">{error}</Alert>}

      {!loading && !error && data && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {statCards.map(s => (
              <Grid size={{ xs: 6, sm: 3 }} key={s.label}>
                <Card>
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h4" fontWeight={800} sx={{ color: s.color }}>
                      {s.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">Uptime level:</Typography>
            {LEVEL_LABELS.map((lbl, i) => (
              <Box key={lbl} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 14, height: 14, borderRadius: '3px', background: LEVEL_COLORS[i], border: '1px solid #333' }} />
                <Typography variant="caption" color="text.secondary">{lbl}</Typography>
              </Box>
            ))}
          </Box>

          {/* Calendar grid */}
          <Card>
            <CardContent sx={{ overflowX: 'auto' }}>
              <Box sx={{ display: 'flex', gap: '3px', minWidth: 'fit-content' }}>
                {weeks.map((week, wi) => (
                  <Box key={wi} sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {week.map((day) => (
                      <Tooltip
                        key={day.date}
                        title={
                          day.uptime_pct != null
                            ? `${day.date}: ${day.uptime_pct}% uptime (${day.total} tests, ${day.outages} outages)`
                            : `${day.date}: No data`
                        }
                        arrow
                      >
                        <Box
                          sx={{
                            width: 14, height: 14, borderRadius: '3px',
                            background: LEVEL_COLORS[day.level],
                            border: '1px solid rgba(255,255,255,0.05)',
                            cursor: 'default',
                            transition: 'transform 0.1s',
                            '&:hover': { transform: 'scale(1.3)', zIndex: 1 },
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Box>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                Each cell = 1 day. Hover for details.
              </Typography>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}