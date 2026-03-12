import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, Alert, Card, CardContent,
  Tabs, Tab, Select, MenuItem, FormControl, InputLabel, Chip, Stack,
  ToggleButtonGroup, ToggleButton, useTheme, Skeleton, Tooltip,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BarChartIcon from '@mui/icons-material/BarChart';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { motion } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer, Area, AreaChart,
  Cell, Brush, ReferenceLine,
} from 'recharts';
import {
  getHeatmapCalendar, getSpeedDistribution, getPercentiles,
  getCorrelation, getInteractiveTimeline,
} from '../services/api';

const GOLD = '#f0c24b';

const GRADIENT_COLORS = [
  '#EF5350', '#EF6C00', '#F9A825', '#33691E', '#1B5E20',
];

function getIntensityColor(intensity) {
  const colors = ['#1a1a1a', '#1b3320', '#245c30', '#30a14e', '#39d353'];
  return colors[Math.min(intensity ?? 0, 4)];
}

function PageHeader({ loading, onRefresh }) {
  return (
    <Paper sx={{
      mb: 3, p: { xs: 2.5, md: 3.5 },
      background: 'linear-gradient(135deg, #000 0%, #0a0800 55%, #111000 100%)',
      border: '1px solid rgba(240,194,75,0.35)',
      boxShadow: '0 8px 48px rgba(240,194,75,0.10)',
    }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <HistoryIcon sx={{ color: GOLD, fontSize: 28 }} />
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>
              Historical Data Visualization
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              Timeline · Heatmap · Distribution · Percentiles · Correlation
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          onClick={onRefresh}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} sx={{ color: 'rgba(0,0,0,0.5)' }} /> : <RefreshIcon />}
          sx={{
            background: loading ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg, #f6d978, ${GOLD})`,
            color: loading ? 'rgba(255,255,255,0.5)' : '#000',
            fontWeight: 800, px: 2.5, borderRadius: 2,
            '&:disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </Stack>
    </Paper>
  );
}

function StatCard({ label, value, unit = '', color = GOLD }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Card sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.12)', height: '100%' }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={900} sx={{ color, mt: 0.5 }}>
          {value ?? '—'}<Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{unit}</Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

function ChartContainer({ title, subtitle, height = 360, children }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.12)' }}>
      {title && <Typography variant="h6" fontWeight={700} gutterBottom>{title}</Typography>}
      {subtitle && <Typography variant="caption" color="text.secondary" display="block" mb={2}>{subtitle}</Typography>}
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </Paper>
  );
}

const CustomTooltip = ({ active, payload, label, format }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  if (!active || !payload?.length) return null;
  return (
    <Paper sx={{ p: 1.5, background: isDark ? '#111' : '#fff', border: '1px solid rgba(240,194,75,0.3)', maxWidth: 220 }}>
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
        {format ? format(label) : label}
      </Typography>
      {payload.map((p) => (
        <Typography key={p.dataKey} variant="body2" sx={{ color: p.color, fontWeight: 700 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </Typography>
      ))}
    </Paper>
  );
};

// ── Heatmap Calendar ───────────────────────────────────────────────────────────
function HeatmapTab({ data, loading, days, onDaysChange }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{[1,2,3].map(i => <Skeleton key={i} height={80} sx={{ borderRadius: 2 }} />)}</Box>;
  if (!data) return null;

  // Group into weeks
  const weeks = [];
  let week = [];
  data.heatmap.forEach((day, i) => {
    week.push(day);
    if (week.length === 7 || i === data.heatmap.length - 1) {
      weeks.push([...week]);
      week = [];
    }
  });

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Stack direction="row" gap={1} alignItems="center">
          <CalendarMonthIcon sx={{ color: GOLD }} />
          <Typography variant="h6" fontWeight={700}>Speed Heatmap Calendar</Typography>
        </Stack>
        <ToggleButtonGroup value={days} exclusive size="small" onChange={(_, v) => v && onDaysChange(v)}>
          {[30, 90, 180, 365].map((d) => (
            <ToggleButton key={d} value={d} sx={{ px: 1.5, fontSize: 11, fontWeight: 700,
              '&.Mui-selected': { bgcolor: GOLD, color: '#000' } }}>
              {d === 365 ? '1yr' : `${d}d`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Paper sx={{ p: 3, mb: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.12)' }}>
        <Box sx={{ overflowX: 'auto', pb: 1 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {/* Day labels */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mr: 0.5 }}>
              <Box sx={{ height: 14 }} />
              {DAY_LABELS.map((d, i) => (
                <Typography key={i} variant="caption" color="text.disabled" sx={{ height: 15, lineHeight: '15px', fontSize: 9 }}>{d}</Typography>
              ))}
            </Box>
            {/* Weeks */}
            {weeks.map((wk, wi) => (
              <Box key={wi} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" color="text.disabled" sx={{ height: 14, fontSize: 9, textAlign: 'center' }}>
                  {wi % 4 === 0 && wk[0]?.date ? MONTH_LABELS[new Date(wk[0].date).getMonth()] : ''}
                </Typography>
                {wk.map((day, di) => (
                  <Tooltip
                    key={di}
                    title={`${day.date}: ${day.avg_speed_mbps ?? '0'} Mbps · ${day.measurement_count} tests`}
                    placement="top"
                  >
                    <Box sx={{
                      width: 13, height: 13,
                      bgcolor: getIntensityColor(day.intensity),
                      borderRadius: '2px',
                      cursor: 'default',
                      transition: 'opacity 0.15s',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`,
                      '&:hover': { opacity: 0.7 },
                    }} />
                  </Tooltip>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Legend */}
        <Stack direction="row" alignItems="center" gap={0.75} mt={2}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>Less</Typography>
          {[0,1,2,3,4].map((i) => (
            <Box key={i} sx={{ width: 13, height: 13, bgcolor: getIntensityColor(i), borderRadius: '2px' }} />
          ))}
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>More</Typography>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10, ml: 1 }}>· Speed intensity</Typography>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Box flex={1}><StatCard label="Total Measurements" value={data.total_measurements} /></Box>
        <Box flex={1}><StatCard label="Days Analyzed" value={data.days} /></Box>
        <Box flex={1}><StatCard label="From" value={data.date_range?.start?.slice(0, 10) ?? '—'} /></Box>
        <Box flex={1}><StatCard label="To" value={data.date_range?.end?.slice(0, 10) ?? '—'} /></Box>
      </Stack>
    </Box>
  );
}

// ── Distribution Histogram ─────────────────────────────────────────────────────
function DistributionTab({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Skeleton height={400} sx={{ borderRadius: 2 }} />;
  if (!data) return null;

  const chartData = (data.histogram || []).map((b, i) => ({
    ...b,
    fill: GRADIENT_COLORS[Math.min(Math.floor((i / (data.histogram.length - 1)) * (GRADIENT_COLORS.length - 1)), GRADIENT_COLORS.length - 1)],
  }));

  return (
    <Box>
      <Stack direction="row" gap={1} alignItems="center" mb={3}>
        <BarChartIcon sx={{ color: GOLD }} />
        <Typography variant="h6" fontWeight={700}>Speed Distribution Histogram</Typography>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        {[
          { label: 'Average Speed', value: data.avg_speed_mbps, unit: 'Mbps' },
          { label: 'Median Speed',  value: data.median_speed_mbps, unit: 'Mbps' },
          { label: 'Min Speed',     value: data.min_speed_mbps, unit: 'Mbps' },
          { label: 'Max Speed',     value: data.max_speed_mbps, unit: 'Mbps' },
        ].map((s) => <Box key={s.label} flex={1}><StatCard label={s.label} value={s.value} unit={s.unit} /></Box>)}
      </Stack>

      <ChartContainer
        title="Download Speed Distribution"
        subtitle="How often you achieved each speed range — taller bars = more frequent"
        height={380}
      >
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} />
          <XAxis
            dataKey="range_start_mbps"
            tickFormatter={(v) => `${v.toFixed(0)}`}
            label={{ value: 'Speed (Mbps)', position: 'insideBottom', offset: -10, fill: '#888', fontSize: 12 }}
            tick={{ fontSize: 11, fill: '#888' }}
          />
          <YAxis
            label={{ value: '% Tests', angle: -90, position: 'insideLeft', offset: 10, fill: '#888', fontSize: 12 }}
            tick={{ fontSize: 11, fill: '#888' }}
          />
          <RTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <Paper sx={{ p: 1.5, background: isDark ? '#111' : '#fff', border: '1px solid rgba(240,194,75,0.3)' }}>
                  <Typography variant="caption" color="text.secondary">
                    {d.range_start_mbps?.toFixed(1)} – {d.range_end_mbps?.toFixed(1)} Mbps
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: GOLD }}>
                    {d.percentage}% of tests ({d.count} measurements)
                  </Typography>
                </Paper>
              );
            }}
          />
          <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
            {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Bar>
          {data.avg_speed_mbps && (
            <ReferenceLine x={data.avg_speed_mbps} stroke={GOLD} strokeDasharray="6 3"
              label={{ value: `Avg ${data.avg_speed_mbps} Mbps`, fill: GOLD, fontSize: 11, position: 'top' }} />
          )}
        </BarChart>
      </ChartContainer>
    </Box>
  );
}

// ── Percentile Charts ──────────────────────────────────────────────────────────
function PercentilesTab({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Skeleton height={400} sx={{ borderRadius: 2 }} />;
  if (!data) return null;

  const chartData = Object.keys(data.download_speed_mbps || {}).map((key) => ({
    percentile: key.toUpperCase(),
    download: data.download_speed_mbps[key],
    upload:   data.upload_speed_mbps?.[key],
    ping:     data.ping_ms?.[key],
  }));

  return (
    <Box>
      <Stack direction="row" gap={1} alignItems="center" mb={2}>
        <ShowChartIcon sx={{ color: GOLD }} />
        <Typography variant="h6" fontWeight={700}>Percentile Analysis</Typography>
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>P50</strong> = typical performance · <strong>P95</strong> = 95% of tests below this · <strong>P99</strong> = worst-case scenario
        </Typography>
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        {[
          { label: 'Download (P50 / P95 / P99)', values: data.download_speed_mbps, unit: 'Mbps' },
          { label: 'Upload (P50 / P95 / P99)',   values: data.upload_speed_mbps, unit: 'Mbps' },
          { label: 'Ping (P50 / P95 / P99)',     values: data.ping_ms, unit: 'ms' },
        ].map(({ label, values, unit }) => (
          <Box key={label} flex={1}>
            <Card sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.12)' }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
                <Stack direction="row" gap={1.5} mt={1} flexWrap="wrap">
                  {['p50', 'p95', 'p99'].map((p) => (
                    <Box key={p}>
                      <Typography variant="caption" color="text.disabled" textTransform="uppercase">{p}</Typography>
                      <Typography variant="h6" fontWeight={900} sx={{ color: GOLD }}>{values?.[p] ?? '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{unit}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Stack>

      <ChartContainer
        title="Speed by Percentile"
        subtitle="How download and upload speeds are distributed across your tests"
        height={360}
      >
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} />
          <XAxis dataKey="percentile" tick={{ fontSize: 12, fill: '#888' }} />
          <YAxis tick={{ fontSize: 12, fill: '#888' }} />
          <RTooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="download" stroke={GOLD}    name="Download (Mbps)" strokeWidth={2.5} dot={{ r: 5, fill: GOLD }} />
          <Line type="monotone" dataKey="upload"   stroke="#42A5F5" name="Upload (Mbps)"   strokeWidth={2.5} dot={{ r: 5, fill: '#42A5F5' }} />
        </LineChart>
      </ChartContainer>
    </Box>
  );
}

// ── Correlation Tab ────────────────────────────────────────────────────────────
function CorrelationTab({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Skeleton height={400} sx={{ borderRadius: 2 }} />;
  if (!data) return null;

  const hourly  = (data.hourly_correlation  || []).map((d) => ({ ...d, hour: `${d.hour}:00` }));
  const weekday = data.weekday_correlation || [];

  return (
    <Box>
      <Stack direction="row" gap={1} alignItems="center" mb={3}>
        <TrendingUpIcon sx={{ color: GOLD }} />
        <Typography variant="h6" fontWeight={700}>Correlation Analysis</Typography>
      </Stack>

      {/* Best / Worst hour cards */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        {data.insights?.best_hour && (
          <Box flex={1}>
            <Card sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(67,160,71,0.25)' }}>
              <CardContent>
                <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                  <AccessTimeIcon sx={{ fontSize: 18, color: '#43A047' }} />
                  <Typography variant="caption" fontWeight={700} color="text.secondary">Best Hour</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={900} sx={{ color: '#43A047' }}>
                  {data.insights.best_hour.hour}:00
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.insights.best_hour.avg_speed_mbps} Mbps avg
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}
        {data.insights?.worst_hour && (
          <Box flex={1}>
            <Card sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(239,83,80,0.25)' }}>
              <CardContent>
                <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                  <AccessTimeIcon sx={{ fontSize: 18, color: '#EF5350' }} />
                  <Typography variant="caption" fontWeight={700} color="text.secondary">Worst Hour</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={900} sx={{ color: '#EF5350' }}>
                  {data.insights.worst_hour.hour}:00
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.insights.worst_hour.avg_speed_mbps} Mbps avg
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}
        {data.insights?.best_day && (
          <Box flex={1}>
            <Card sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(66,165,245,0.25)' }}>
              <CardContent>
                <Typography variant="caption" fontWeight={700} color="text.secondary">Best Day</Typography>
                <Typography variant="h4" fontWeight={900} sx={{ color: '#42A5F5', mt: 0.5 }}>
                  {data.insights.best_day.weekday}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.insights.best_day.avg_speed_mbps} Mbps avg
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}
      </Stack>

      <Stack spacing={3}>
        {hourly.length > 0 && (
          <ChartContainer title="Speed by Hour of Day" subtitle="Average download speed throughout the day" height={300}>
            <AreaChart data={hourly} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <defs>
                <linearGradient id="gradHour" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GOLD} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <RTooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="avg_speed_mbps" stroke={GOLD} fill="url(#gradHour)" name="Speed (Mbps)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        )}

        {weekday.length > 0 && (
          <ChartContainer title="Speed by Day of Week" subtitle="Which days deliver the best speeds" height={260}>
            <BarChart data={weekday} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} />
              <XAxis dataKey="weekday" tick={{ fontSize: 12, fill: '#888' }} />
              <YAxis tick={{ fontSize: 12, fill: '#888' }} />
              <RTooltip content={<CustomTooltip />} />
              <Bar dataKey="avg_speed_mbps" name="Speed (Mbps)" radius={[4, 4, 0, 0]}>
                {weekday.map((_, i) => <Cell key={i} fill={`hsl(${140 + i * 15}, 55%, 45%)`} />)}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </Stack>
    </Box>
  );
}

// ── Interactive Timeline Tab ───────────────────────────────────────────────────
function TimelineTab({ data, loading, hours, onHoursChange }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Skeleton height={450} sx={{ borderRadius: 2 }} />;
  if (!data) return null;

  const chartData = (data.timeline || []).map((d) => ({
    ...d,
    ts: new Date(d.timestamp).getTime(),
    label: new Date(d.timestamp).toLocaleString(),
  }));

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Stack direction="row" gap={1} alignItems="center">
          <TimelineIcon sx={{ color: GOLD }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>Interactive Timeline</Typography>
            <Typography variant="caption" color="text.secondary">Use the brush below the chart to zoom into any time window</Typography>
          </Box>
        </Stack>
        <ToggleButtonGroup value={hours} exclusive size="small" onChange={(_, v) => v && onHoursChange(v)}>
          {[24, 168, 720].map((h) => (
            <ToggleButton key={h} value={h} sx={{ px: 1.5, fontSize: 11, fontWeight: 700,
              '&.Mui-selected': { bgcolor: GOLD, color: '#000' } }}>
              {h === 24 ? '24h' : h === 168 ? '7d' : '30d'}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        {[
          { label: 'Avg Speed',  value: data.statistics?.avg_speed_mbps, unit: 'Mbps', color: GOLD },
          { label: 'Min Speed',  value: data.statistics?.min_speed_mbps, unit: 'Mbps', color: '#42A5F5' },
          { label: 'Max Speed',  value: data.statistics?.max_speed_mbps, unit: 'Mbps', color: '#43A047' },
          { label: 'Outages',    value: data.statistics?.outage_count, unit: '', color: '#EF5350' },
        ].map((s) => <Box key={s.label} flex={1}><StatCard label={s.label} value={s.value} unit={s.unit} color={s.color} /></Box>)}
      </Stack>

      <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.12)' }}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <defs>
              <linearGradient id="gradDl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={GOLD} stopOpacity={0.2} />
                <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => {
                const d = new Date(v);
                return hours <= 24 ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
              }}
              tick={{ fontSize: 10, fill: '#888' }}
            />
            <YAxis tick={{ fontSize: 11, fill: '#888' }} />
            <RTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <Paper sx={{ p: 1.5, background: isDark ? '#111' : '#fff', border: '1px solid rgba(240,194,75,0.3)' }}>
                    <Typography variant="caption" color="text.secondary" display="block">{d.label}</Typography>
                    <Typography variant="body2" sx={{ color: GOLD, fontWeight: 700 }}>↓ {d.download_speed_mbps} Mbps</Typography>
                    <Typography variant="body2" sx={{ color: '#42A5F5', fontWeight: 700 }}>↑ {d.upload_speed_mbps} Mbps</Typography>
                    <Typography variant="body2" color="text.secondary">Ping: {d.ping_ms} ms</Typography>
                    {d.is_outage && <Chip label="OUTAGE" color="error" size="small" sx={{ mt: 0.5, height: 18, fontSize: 9 }} />}
                  </Paper>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="download_speed_mbps" stroke={GOLD}    name="Download (Mbps)" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="upload_speed_mbps"   stroke="#42A5F5" name="Upload (Mbps)"   dot={false} strokeWidth={1.5} />
            <Brush
              dataKey="ts"
              height={30}
              tickFormatter={(v) => new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              fill={isDark ? '#111' : '#f5f5f5'}
              stroke="rgba(240,194,75,0.3)"
              travellerWidth={8}
            />
          </LineChart>
        </ResponsiveContainer>
      </Paper>
    </Box>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
const TABS = [
  { label: 'Heatmap Calendar', Icon: CalendarMonthIcon },
  { label: 'Distribution',     Icon: BarChartIcon },
  { label: 'Percentiles',      Icon: ShowChartIcon },
  { label: 'Correlation',      Icon: TrendingUpIcon },
  { label: 'Timeline',         Icon: TimelineIcon },
];

export default function HistoricalVisualizationPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeTab,        setActiveTab]    = useState(0);
  const [loading,          setLoading]      = useState(false);
  const [heatmapData,      setHeatmap]      = useState(null);
  const [distributionData, setDistribution] = useState(null);
  const [percentilesData,  setPercentiles]  = useState(null);
  const [correlationData,  setCorrelation]  = useState(null);
  const [timelineData,     setTimeline]     = useState(null);
  const [error,            setError]        = useState(null);
  const [heatmapDays,      setHeatmapDays]  = useState(90);
  const [timelineHours,    setTimelineHours]= useState(168);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hm, dist, pct, cor, tl] = await Promise.all([
        getHeatmapCalendar(heatmapDays),
        getSpeedDistribution(20),
        getPercentiles(),
        getCorrelation(),
        getInteractiveTimeline(timelineHours),
      ]);
      setHeatmap(hm.data);
      setDistribution(dist.data);
      setPercentiles(pct.data);
      setCorrelation(cor.data);
      setTimeline(tl.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load historical data');
    } finally {
      setLoading(false);
    }
  }, [heatmapDays, timelineHours]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleHeatmapDays = async (v) => {
    setHeatmapDays(v);
    try {
      const res = await getHeatmapCalendar(v);
      setHeatmap(res.data);
    } catch {}
  };

  const handleTimelineHours = async (v) => {
    setTimelineHours(v);
    try {
      const res = await getInteractiveTimeline(v);
      setTimeline(res.data);
    } catch {}
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1100, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader loading={loading} onRefresh={loadAll} />
      </motion.div>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Paper sx={{ mb: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.15)', overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', minHeight: 52 },
            '& .Mui-selected': { color: `${GOLD} !important` },
            '& .MuiTabs-indicator': { bgcolor: GOLD },
          }}
        >
          {TABS.map(({ label, Icon }) => (
            <Tab key={label} label={label} icon={<Icon sx={{ fontSize: 16 }} />} iconPosition="start" />
          ))}
        </Tabs>
      </Paper>

      <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {activeTab === 0 && <HeatmapTab      data={heatmapData}      loading={loading} days={heatmapDays}    onDaysChange={handleHeatmapDays} />}
        {activeTab === 1 && <DistributionTab data={distributionData} loading={loading} />}
        {activeTab === 2 && <PercentilesTab  data={percentilesData}  loading={loading} />}
        {activeTab === 3 && <CorrelationTab  data={correlationData}  loading={loading} />}
        {activeTab === 4 && <TimelineTab     data={timelineData}     loading={loading} hours={timelineHours} onHoursChange={handleTimelineHours} />}
      </motion.div>
    </Box>
  );
}
