import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, Grid, Card, CardContent, Typography, Button, CircularProgress,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton, Skeleton, Chip, Alert, Tooltip,
  LinearProgress, IconButton, useTheme
} from '@mui/material';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import WifiIcon from '@mui/icons-material/Wifi';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, Area, AreaChart, ReferenceLine
} from 'recharts';
import { getRecentMeasurements, getISPComparison, runTestNow } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAT_CARDS = [
  {
    key: 'total',
    label: 'Total Tests',
    icon: SpeedIcon,
    gradient: 'linear-gradient(145deg, #000000 0%, #111111 60%, #1a1a1a 100%)',
    shadow: 'rgba(240,194,75,0.22)',
    accentColor: '#f0c24b',
    numColor: '#ffffff',
    unit: '',
    sparklineKey: null,
  },
  {
    key: 'outages',
    label: 'Outages Detected',
    icon: WarningAmberIcon,
    gradient: 'linear-gradient(145deg, #f0c24b 0%, #d4a21f 55%, #b8890a 100%)',
    shadow: 'rgba(240,194,75,0.5)',
    accentColor: '#000000',
    numColor: '#000000',
    unit: '',
    sparklineKey: null,
  },
  {
    key: 'avgDownload',
    label: 'Avg Download',
    icon: DownloadIcon,
    gradient: 'linear-gradient(145deg, #050505 0%, #0f0f0f 40%, #1c1500 80%, #2a1e00 100%)',
    shadow: 'rgba(240,194,75,0.32)',
    accentColor: '#f0c24b',
    numColor: '#f0c24b',
    unit: 'Mbps',
    sparklineKey: 'download_speed',
  },
  {
    key: 'avgUpload',
    label: 'Avg Upload',
    icon: UploadIcon,
    gradient: 'linear-gradient(145deg, #1c1500 0%, #0f0f0f 55%, #050505 100%)',
    shadow: 'rgba(240,194,75,0.28)',
    accentColor: '#f0c24b',
    numColor: '#ffffff',
    unit: 'Mbps',
    sparklineKey: 'upload_speed',
  },
];

const TIME_RANGES = [
  { label: '6h', value: 6 },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
  { label: '48h', value: 48 },
];

const cardVariants = {
  hidden: { opacity: 0, y: 32, scale: 0.96 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Animated count-up from 0 → target */
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const num = typeof target === 'number' && !isNaN(target) ? target : null;
    if (num === null) { setVal(0); return; }
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setVal(eased * num);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration]);

  return val;
}

/** Compute percentage trend between the second and first half of an array */
function computeTrend(measurements, key) {
  if (!measurements || measurements.length < 4) return null;
  const half = Math.floor(measurements.length / 2);
  const recent = measurements.slice(0, half);
  const older = measurements.slice(half);
  const avg = (arr) => arr.reduce((s, m) => s + (m[key] || 0), 0) / arr.length;
  const olderAvg = avg(older);
  if (olderAvg === 0) return null;
  const pct = ((avg(recent) - olderAvg) / olderAvg) * 100;
  return { pct: Math.abs(pct).toFixed(0), up: pct >= 0 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Animated SVG sparkline */
function Sparkline({ data, color, id }) {
  if (!data || data.length < 2) return null;
  const valid = data.filter((v) => typeof v === 'number' && !isNaN(v) && v >= 0);
  if (valid.length < 2) return null;

  const W = 110, H = 36;
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const range = max - min || 1;
  const pts = valid.map((v, i) => [
    (i / (valid.length - 1)) * W,
    H - ((v - min) / range) * (H - 6) - 3,
  ]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const fill = `${line} L${W},${H} L0,${H} Z`;
  const gid = `sp-${id}`;

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gid})`} />
      <path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Pulsing live dot */
function LiveDot({ color = '#4CAF50' }) {
  return (
    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', width: 12, height: 12 }}>
      <motion.div
        animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          backgroundColor: color,
        }}
      />
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, position: 'relative', zIndex: 1, m: 'auto' }} />
    </Box>
  );
}

/** Circular countdown ring */
function CountdownRing({ seconds, total = 60 }) {
  const pct = (seconds / total) * 100;
  return (
    <Tooltip title={`Auto-refresh in ${seconds}s`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 20, px: 1.5, py: 0.5, cursor: 'default' }}>
        <Box sx={{ position: 'relative', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress
            variant="determinate" value={100} size={22} thickness={4}
            sx={{ color: 'rgba(255,255,255,0.15)', position: 'absolute' }}
          />
          <CircularProgress
            variant="determinate" value={pct} size={22} thickness={4}
            sx={{ color: 'rgba(255,255,255,0.75)', position: 'absolute' }}
          />
        </Box>
        <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 22 }}>
          {seconds}s
        </Typography>
      </Box>
    </Tooltip>
  );
}

/** Stat card with count-up, sparkline, and trend badge */
function StatCard({ card, value, index, loading, sparklineData, trend, hasActiveOutage }) {
  const IconComponent = card.icon;
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  const isNumeric = !isNaN(numValue);
  const animated = useCountUp(isNumeric ? numValue : 0);
  const displayVal = isNumeric
    ? (Number.isInteger(numValue) ? Math.round(animated) : animated.toFixed(1))
    : value;

  const isOutageCard = card.key === 'outages';
  const pulseOutage = isOutageCard && hasActiveOutage;
  const isGoldCard = card.key === 'outages';

  const iconBg = isGoldCard ? 'rgba(0,0,0,0.2)' : 'rgba(240,194,75,0.18)';
  const iconColor = isGoldCard ? '#000' : card.accentColor;
  const labelColor = isGoldCard ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.65)';
  const trendBg = trend?.up
    ? (isGoldCard ? 'rgba(0,0,0,0.18)' : 'rgba(240,194,75,0.25)')
    : 'rgba(0,0,0,0.25)';
  const trendColor = isGoldCard ? '#000' : card.accentColor;

  return (
    <motion.div custom={index} initial="hidden" animate="visible" variants={cardVariants} style={{ width: '100%', height: '100%' }}>
      <Card
        sx={{
          width: '100%',
          height: 260,
          background: card.gradient,
          boxShadow: `0 12px 40px ${card.shadow}`,
          border: isGoldCard ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(240,194,75,0.15)',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'default',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          '&:hover': {
            transform: 'translateY(-8px)',
            boxShadow: `0 24px 56px ${card.shadow}`,
          },
        }}
      >
        {/* Pulsing ring for active outage */}
        {pulseOutage && (
          <motion.div
            style={{ position: 'absolute', inset: 0, borderRadius: 16, pointerEvents: 'none', zIndex: 2 }}
            animate={{ boxShadow: ['0 0 0 0px rgba(239,83,80,0.7)', '0 0 0 8px rgba(239,83,80,0)', '0 0 0 0px rgba(239,83,80,0)'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* Gold shimmer streak */}
        {!isGoldCard && (
          <Box sx={{
            position: 'absolute', top: 0, left: '-30%', width: '60%', height: '100%',
            background: 'linear-gradient(105deg, transparent 40%, rgba(240,194,75,0.06) 50%, transparent 60%)',
            pointerEvents: 'none', zIndex: 0,
          }} />
        )}

        {/* Watermark icon */}
        <Box sx={{ position: 'absolute', right: -22, top: -22, opacity: isGoldCard ? 0.08 : 0.07, '& svg': { fontSize: 180 }, color: isGoldCard ? '#000' : card.accentColor }}>
          <IconComponent />
        </Box>

        <CardContent sx={{ p: 3, position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Top row: icon + trend badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ bgcolor: iconBg, borderRadius: 2, p: 1.1, display: 'flex', alignItems: 'center', border: isGoldCard ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(240,194,75,0.2)' }}>
              <IconComponent sx={{ fontSize: 26, color: iconColor }} />
            </Box>
            {trend && !loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, bgcolor: trendBg, borderRadius: 10, px: 1, py: 0.3 }}>
                {trend.up
                  ? <TrendingUpIcon sx={{ fontSize: 13, color: trendColor }} />
                  : <TrendingDownIcon sx={{ fontSize: 13, color: trendColor }} />
                }
                <Typography sx={{ color: trendColor, fontSize: 11, fontWeight: 800, lineHeight: 1 }}>
                  {trend.pct}%
                </Typography>
              </Box>
            )}
          </Box>

          {/* Label */}
          <Typography sx={{ color: labelColor, fontWeight: 700, letterSpacing: '1.1px', textTransform: 'uppercase', fontSize: '0.65rem', mb: 0.75 }}>
            {card.label}
          </Typography>

          {/* Big number */}
          {loading ? (
            <Skeleton variant="text" width={90} height={80} sx={{ bgcolor: isGoldCard ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)', borderRadius: 1 }} />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
              <Typography
                sx={{
                  color: card.numColor,
                  fontWeight: 900,
                  fontSize: { xs: '3.4rem', sm: '4rem', md: '4.8rem' },
                  lineHeight: 1,
                  letterSpacing: '-3px',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: isGoldCard ? 'none' : `0 0 40px ${card.accentColor}55`,
                }}
              >
                {displayVal}
              </Typography>
              {card.unit && (
                <Typography sx={{ color: isGoldCard ? 'rgba(0,0,0,0.6)' : `${card.accentColor}aa`, fontWeight: 700, fontSize: { xs: '1rem', sm: '1.2rem', md: '1.3rem' }, mb: 0.5 }}>
                  {card.unit}
                </Typography>
              )}
            </Box>
          )}

          {/* Sparkline (download / upload only) */}
          {sparklineData && sparklineData.length > 1 && !loading && (
            <Box sx={{ mt: 'auto', pt: 1.5, opacity: 0.9 }}>
              <Sparkline data={sparklineData} color={card.accentColor} id={card.key} />
            </Box>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Chart tooltip — dark-mode aware */
function CustomTooltip({ active, payload, label }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  if (!active || !payload || !payload.length) return null;
  return (
    <Paper
      elevation={12}
      sx={{
        p: 2,
        background: isDark ? 'rgba(10,25,41,0.97)' : 'rgba(255,255,255,0.97)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        backdropFilter: 'blur(12px)',
        minWidth: 160,
        borderRadius: 2,
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block" mb={1} fontWeight={600}>
        {label}
      </Typography>
      {payload.map((entry) => (
        <Box key={entry.dataKey} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
          <Typography variant="body2" fontWeight={800} color="text.primary">
            {entry.value?.toFixed(1)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Mbps · {entry.name}
          </Typography>
        </Box>
      ))}
    </Paper>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function Dashboard() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [measurements, setMeasurements] = useState([]);
  const [ispData, setIspData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [timeRange, setTimeRange] = useState(24);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown] = useState(60);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [measRes, ispRes] = await Promise.all([
        getRecentMeasurements(timeRange),
        getISPComparison(),
      ]);
      setMeasurements(measRes.data);
      setIspData(ispRes.data);
      setLastUpdated(new Date());
    } catch {
      setError('Failed to load data. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  // Auto-refresh every 60s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Reset countdown whenever data is freshly loaded
  useEffect(() => {
    if (lastUpdated) setCountdown(60);
  }, [lastUpdated]);

  // Tick countdown
  useEffect(() => {
    const t = setInterval(() => setCountdown((s) => (s <= 1 ? 60 : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const runTest = async () => {
    setTesting(true);
    try {
      await runTestNow();
      await fetchData();
    } catch {
      setError('Speed test failed. Please try again.');
    } finally {
      setTesting(false);
    }
  };

  // ── Computed stats ─────────────────────────────────────────────────────────

  const stats = {
    total: measurements.length,
    outages: measurements.filter((m) => m.is_outage).length,
    avgDownload:
      measurements.length > 0
        ? parseFloat((measurements.reduce((a, b) => a + b.download_speed, 0) / measurements.length).toFixed(1))
        : '—',
    avgUpload:
      measurements.length > 0
        ? parseFloat((measurements.reduce((a, b) => a + b.upload_speed, 0) / measurements.length).toFixed(1))
        : '—',
  };

  const outageRate = measurements.length > 0
    ? parseFloat(((stats.outages / stats.total) * 100).toFixed(0))
    : 0;

  const avgDownloadNum = typeof stats.avgDownload === 'number' ? stats.avgDownload : null;

  const hasActiveOutage = measurements.length > 0 && measurements[0]?.is_outage;

  const networkStatus = measurements.length === 0
    ? 'unknown'
    : hasActiveOutage
      ? 'outage'
      : outageRate > 10 ? 'degraded' : 'healthy';

  const statusConfig = {
    healthy:  { label: 'All Systems Normal',  color: '#43A047', bg: 'rgba(67,160,71,0.12)',  border: 'rgba(67,160,71,0.3)',  Icon: CheckCircleOutlineIcon },
    degraded: { label: 'Network Degraded',    color: '#FFA726', bg: 'rgba(255,167,38,0.12)', border: 'rgba(255,167,38,0.3)', Icon: WarningAmberIcon },
    outage:   { label: 'Outage Detected',     color: '#EF5350', bg: 'rgba(239,83,80,0.12)',  border: 'rgba(239,83,80,0.3)',  Icon: ErrorOutlineIcon },
    unknown:  { label: 'Awaiting Data',       color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)',Icon: WifiIcon },
  };
  const status = statusConfig[networkStatus];

  // Quality score 0-100
  const qualityScore = Math.max(0, Math.min(100, Math.round(
    100
    - outageRate * 2
    - (avgDownloadNum !== null && avgDownloadNum < 10 ? 20 : avgDownloadNum !== null && avgDownloadNum < 25 ? 8 : 0)
  )));
  const healthColor = outageRate > 10 ? '#EF5350' : outageRate > 3 ? '#FFA726' : '#66BB6A';

  // Sparkline & trend data per card
  const sparklines = {
    avgDownload: measurements.slice(0, 20).map((m) => m.download_speed).reverse(),
    avgUpload: measurements.slice(0, 20).map((m) => m.upload_speed).reverse(),
  };
  const trends = {
    avgDownload: computeTrend(measurements, 'download_speed'),
    avgUpload: computeTrend(measurements, 'upload_speed'),
  };

  const chartData = [...measurements].reverse().map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    download: parseFloat(m.download_speed?.toFixed(2)),
    upload: parseFloat(m.upload_speed?.toFixed(2)),
  }));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1300, mx: 'auto' }}>

      {/* ── Hero Header ───────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Paper
          sx={{
            mb: 3,
            p: { xs: 2.5, md: 3.5 },
            background: 'linear-gradient(135deg, #000000 0%, #0a0800 55%, #111000 100%)',
            border: '1px solid rgba(240,194,75,0.35)',
            boxShadow: '0 8px 48px rgba(240,194,75,0.1)',
            overflow: 'hidden',
            position: 'relative',
          }}
          elevation={0}
        >
          {/* Decorative blobs */}
          <Box sx={{ position: 'absolute', top: -60, right: -40, width: 240, height: 240, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)' }} />
          <Box sx={{ position: 'absolute', bottom: -80, right: 120, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)' }} />
          <Box sx={{ position: 'absolute', top: -30, left: '38%', width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)' }} />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, position: 'relative', zIndex: 1 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75 }}>
                <LiveDot />
                <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Live Monitoring
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ color: '#fff', fontWeight: 800, mb: 0.4, letterSpacing: '-1px' }}>
                Network Dashboard
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontSize: 13 }}>
                {lastUpdated
                  ? `Updated at ${lastUpdated.toLocaleTimeString()}`
                  : 'Fetching latest measurements…'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Countdown ring */}
              <CountdownRing seconds={countdown} />

              {/* Refresh icon */}
              <Tooltip title="Refresh now">
                <IconButton
                  onClick={fetchData}
                  disabled={loading}
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.12)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.22)' },
                    '&:disabled': { color: 'rgba(255,255,255,0.3)' },
                  }}
                >
                  <motion.div
                    animate={loading ? { rotate: 360 } : { rotate: 0 }}
                    transition={{ duration: 1, repeat: loading ? Infinity : 0, ease: 'linear' }}
                    style={{ display: 'flex' }}
                  >
                    <RefreshIcon fontSize="small" />
                  </motion.div>
                </IconButton>
              </Tooltip>

              {/* Run speed test */}
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={runTest}
                  disabled={testing}
                  startIcon={
                    testing
                      ? <CircularProgress size={17} sx={{ color: 'rgba(255,255,255,0.8)' }} />
                      : (
                        <motion.div
                          animate={!testing ? { x: [0, 3, 0] } : {}}
                          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                          style={{ display: 'flex' }}
                        >
                          <PlayArrowIcon />
                        </motion.div>
                      )
                  }
                  sx={{
                    background: testing
                      ? 'rgba(255,255,255,0.08)'
                      : 'linear-gradient(135deg, #f6d978 0%, #f0c24b 100%)',
                    color: testing ? 'rgba(255,255,255,0.7)' : '#0d0f15',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    px: 3,
                    py: 1.25,
                    borderRadius: 3,
                    border: testing ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(240,194,75,0.5)',
                    boxShadow: testing ? 'none' : '0 14px 32px rgba(240,194,75,0.32)',
                    letterSpacing: '0.2px',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #ffe9a3 0%, #f5cd55 100%)',
                      boxShadow: '0 14px 36px rgba(240,194,75,0.45)',
                    },
                    '&:disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
                  }}
                >
                  {testing ? 'Running…' : 'Run Speed Test'}
                </Button>
              </motion.div>
            </Box>
          </Box>
        </Paper>
      </motion.div>

      {/* ── Error alert ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2.5 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Network Status Badge ──────────────────────────────────────────── */}
      {!loading && measurements.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Box
            sx={{
              mb: 3, px: 2.5, py: 1.75,
              borderRadius: 3,
              bgcolor: status.bg,
              border: `1px solid ${status.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              {networkStatus === 'outage' && <LiveDot color="#EF5350" />}
              <status.Icon sx={{ fontSize: 20, color: status.color }} />
              <Typography fontWeight={800} fontSize="0.95rem" sx={{ color: status.color }}>
                {status.label}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip
                label={`${outageRate}% outage rate`}
                size="small"
                sx={{ bgcolor: `${status.color}20`, color: status.color, fontWeight: 700, border: `1px solid ${status.border}` }}
              />
              <Chip
                label={`${timeRange}h window · ${measurements.length} tests`}
                size="small"
                sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', fontWeight: 600 }}
              />
            </Box>
          </Box>
        </motion.div>
      )}

      {/* ── Stat Cards ───────────────────────────────────────────────────── */}
      <Grid
        container
        spacing={3}
        sx={{ mb: 3, maxWidth: 1100, mx: 'auto', justifyContent: 'center', alignItems: 'stretch' }}
      >
        {STAT_CARDS.map((card, i) => (
          <Grid
            item
            xs={12}
            sm={6}
            key={card.key}
            sx={{ display: 'flex', justifyContent: 'center' }}
          >
            <StatCard
              card={card}
              value={stats[card.key]}
              index={i}
              loading={loading}
              sparklineData={card.sparklineKey ? sparklines[card.key] : null}
              trend={trends[card.key] || null}
              hasActiveOutage={hasActiveOutage}
            />
          </Grid>
        ))}
      </Grid>

      {/* ── Network Health ───────────────────────────────────────────────── */}
      {!loading && measurements.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Paper sx={{ p: 3, mb: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <SignalCellularAltIcon sx={{ color: healthColor, fontSize: 22 }} />
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>Network Health</Typography>
                  <Typography variant="caption" color="text.secondary">Based on uptime and average speed</Typography>
                </Box>
              </Box>

              {/* Quality Score gauge */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                    <CircularProgress
                      variant="determinate" value={100} size={64} thickness={5}
                      sx={{ color: isDark ? 'rgba(255,255,255,0.06)' : '#F0F4F8', position: 'absolute', top: 0, left: 0 }}
                    />
                    <CircularProgress
                      variant="determinate" value={qualityScore} size={64} thickness={5}
                      sx={{ color: healthColor }}
                    />
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography fontWeight={900} fontSize="1.05rem" sx={{ color: healthColor, lineHeight: 1 }}>
                        {qualityScore}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5} fontWeight={600}>
                    Quality Score
                  </Typography>
                </Box>

                <Box>
                  <Chip
                    label={`${100 - outageRate}% uptime`}
                    size="small"
                    sx={{ bgcolor: `${healthColor}20`, color: healthColor, fontWeight: 700, border: `1px solid ${healthColor}40`, mb: 0.75 }}
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    {stats.outages} outage{stats.outages !== 1 ? 's' : ''} / {timeRange}h
                  </Typography>
                </Box>
              </Box>
            </Box>

            <LinearProgress
              variant="determinate"
              value={Math.max(0, 100 - outageRate)}
              sx={{
                height: 12,
                borderRadius: 6,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : `${healthColor}18`,
                '& .MuiLinearProgress-bar': {
                  background: `linear-gradient(90deg, ${healthColor} 0%, ${healthColor}bb 100%)`,
                  borderRadius: 6,
                  transition: 'transform 1.2s ease',
                },
              }}
            />
          </Paper>
        </motion.div>
      )}

      {/* ── Speed Chart ──────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
        <Paper sx={{ p: 3, mb: 3, border: '1px solid rgba(240,194,75,0.18)', background: isDark ? '#080808' : '#fff' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>Speed Over Time</Typography>
              <Typography variant="caption" color="text.secondary">Download & upload history</Typography>
            </Box>
            <ToggleButtonGroup
              value={timeRange}
              exclusive
              onChange={(_, v) => v && setTimeRange(v)}
              size="small"
              sx={{
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F4F8',
                borderRadius: 2,
                p: 0.5,
                '& .MuiToggleButtonGroup-grouped': { border: 0, borderRadius: '8px !important', mx: 0.25 },
                '& .MuiToggleButton-root': {
                  px: 2, py: 0.6, fontWeight: 600, fontSize: 13,
                  color: 'text.secondary',
                  '&.Mui-selected': {
                    bgcolor: isDark ? 'rgba(240,194,75,0.18)' : '#f0c24b',
                    color: isDark ? '#f0c24b' : '#000',
                    boxShadow: isDark ? '0 2px 8px rgba(240,194,75,0.25)' : '0 2px 8px rgba(0,0,0,0.12)',
                  },
                },
              }}
            >
              {TIME_RANGES.map((r) => (
                <ToggleButton key={r.value} value={r.value}>{r.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {loading ? (
            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
          ) : chartData.length === 0 ? (
            <Box sx={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                <WifiIcon sx={{ fontSize: 52, color: 'text.disabled' }} />
              </motion.div>
              <Typography color="text.secondary" fontWeight={500}>No data for this time range</Typography>
              <Typography variant="caption" color="text.disabled">Run a speed test to get started</Typography>
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="downloadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f0c24b" stopOpacity={isDark ? 0.5 : 0.35} />
                    <stop offset="100%" stopColor="#f0c24b" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e8e8e8" stopOpacity={isDark ? 0.35 : 0.25} />
                    <stop offset="100%" stopColor="#e8e8e8" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                  interval="preserveStartEnd"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                  tickLine={false}
                  axisLine={false}
                  unit=" Mb"
                  width={56}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 16, fontSize: 13, fontWeight: 600 }} iconType="circle" iconSize={8} />
                {avgDownloadNum && (
                  <ReferenceLine
                    y={avgDownloadNum}
                    stroke="#f0c24b"
                    strokeDasharray="4 4"
                    strokeOpacity={0.45}
                    label={{ value: 'avg', fill: theme.palette.text.secondary, fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
                <Area type="monotone" dataKey="download" stroke="#f0c24b" strokeWidth={2.5} fill="url(#downloadGrad)"
                  name="Download" dot={false} activeDot={{ r: 6, fill: '#f0c24b', stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2 }} />
                <Area type="monotone" dataKey="upload" stroke="#d0d0d0" strokeWidth={2.5} fill="url(#uploadGrad)"
                  name="Upload" dot={false} activeDot={{ r: 6, fill: '#d0d0d0', stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Paper>
      </motion.div>

      {/* ── ISP Comparison ───────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}>
        <Paper sx={{ p: 3, border: '1px solid rgba(240,194,75,0.18)', background: isDark ? '#080808' : '#fff' }}>
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="h6" fontWeight={700}>ISP Comparison</Typography>
            <Typography variant="caption" color="text.secondary">Performance breakdown by provider</Typography>
          </Box>

          {loading ? (
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
          ) : ispData.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.2, repeat: Infinity }}>
                <WifiIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1.5 }} />
              </motion.div>
              <Typography color="text.secondary" fontWeight={500}>No ISP data yet</Typography>
              <Typography variant="caption" color="text.disabled">Run a speed test to compare providers</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Provider</TableCell>
                    <TableCell>Download</TableCell>
                    <TableCell>Upload</TableCell>
                    <TableCell align="right">Ping</TableCell>
                    <TableCell align="right">Tests</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ispData.map((isp, idx) => {
                    const maxDownload = Math.max(...ispData.map((i) => i.avg_download || 0));
                    const barWidth = maxDownload > 0 ? ((isp.avg_download || 0) / maxDownload) * 100 : 0;
                    return (
                      <TableRow key={idx} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box
                              sx={{
                                width: 38, height: 38, borderRadius: 2,
                                background: `linear-gradient(135deg, hsl(${(idx * 60) % 360},55%,${isDark ? '30%' : '88%'}) 0%, hsl(${(idx * 60 + 30) % 360},55%,${isDark ? '25%' : '78%'}) 100%)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <Typography fontWeight={900} fontSize={14} sx={{ color: isDark ? `hsl(${(idx * 60) % 360},70%,80%)` : `hsl(${(idx * 60) % 360},50%,30%)` }}>
                                {isp.isp?.charAt(0).toUpperCase()}
                              </Typography>
                            </Box>
                            <Typography fontWeight={700} variant="body2">{isp.isp}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.6 }}>
                              <DownloadIcon sx={{ fontSize: 14, color: '#f0c24b' }} />
                              <Typography variant="body2" fontWeight={700} sx={{ color: '#f0c24b' }}>
                                {isp.avg_download?.toFixed(1)} Mbps
                              </Typography>
                            </Box>
                            <Box sx={{ height: 5, borderRadius: 3, bgcolor: isDark ? 'rgba(240,194,75,0.12)' : 'rgba(240,194,75,0.15)', overflow: 'hidden', width: 110 }}>
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${barWidth}%` }}
                                transition={{ duration: 0.9, ease: 'easeOut' }}
                                style={{ height: '100%', background: 'linear-gradient(90deg, #d4a21f, #f0c24b)', borderRadius: 3 }}
                              />
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <UploadIcon sx={{ fontSize: 14, color: isDark ? '#d0d0d0' : '#666' }} />
                            <Typography variant="body2" fontWeight={600} sx={{ color: isDark ? '#d0d0d0' : '#555' }}>
                              {isp.avg_upload?.toFixed(1)} Mbps
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${isp.avg_ping?.toFixed(0)} ms`}
                            size="small"
                            sx={{
                              fontWeight: 700,
                              bgcolor: isp.avg_ping < 50
                                ? (isDark ? 'rgba(46,125,50,0.25)' : '#E8F5E9')
                                : isp.avg_ping < 100
                                  ? (isDark ? 'rgba(245,124,0,0.2)' : '#FFF8E1')
                                  : (isDark ? 'rgba(198,40,40,0.2)' : '#FFEBEE'),
                              color: isp.avg_ping < 50 ? '#43A047' : isp.avg_ping < 100 ? '#F57C00' : '#C62828',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} color="text.secondary">
                            {isp.total_tests}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </motion.div>
    </Box>
  );
}

export default Dashboard;
