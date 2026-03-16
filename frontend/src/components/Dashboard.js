import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, Grid, Card, CardContent, Typography, Button, CircularProgress,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton, Skeleton, Chip, Alert, Tooltip,
  LinearProgress, IconButton, useTheme,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions
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
import VideocamIcon from '@mui/icons-material/Videocam';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, Area, AreaChart, ReferenceLine, Brush
} from 'recharts';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { Link } from 'react-router-dom';
import { getRecentMeasurements, getISPComparison, runTestNow, getStats, getAlerts, getNetworkUsage, clearMeasurements, getQualityScore, getAIInsights, getOutageConfidence } from '../services/api';

/** Parse a naive UTC timestamp string from the backend (no Z suffix) as UTC */
function parseTS(ts) {
  if (!ts) return new Date(NaN);
  // If already has timezone info, parse directly; otherwise append Z to force UTC
  return new Date(/[Zz]|[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + 'Z');
}

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

const ACTIVITIES = [
  { label: '4K Streaming', minDown: 25, icon: VideocamIcon, color: '#f0c24b' },
  { label: 'HD Streaming', minDown: 10, icon: VideocamIcon, color: '#66BB6A' },
  { label: 'Video Calls', minDown: 5, icon: VideocamIcon, color: '#42A5F5' },
  { label: 'Online Gaming', minDown: 3, icon: SportsEsportsIcon, color: '#AB47BC' },
  { label: 'Music', minDown: 0.5, icon: MusicNoteIcon, color: '#26C6DA' },
  { label: 'Browsing', minDown: 0.3, icon: CloudDownloadIcon, color: '#78909C' },
];

function speedRating(dl) {
  if (dl === null || dl === undefined) return { label: 'No Data', color: '#78909C', grade: '—' };
  if (dl >= 100) return { label: 'Excellent', color: '#43A047', grade: 'A+' };
  if (dl >= 50)  return { label: 'Very Good', color: '#66BB6A', grade: 'A' };
  if (dl >= 25)  return { label: 'Good',      color: '#f0c24b', grade: 'B' };
  if (dl >= 10)  return { label: 'Fair',      color: '#FFA726', grade: 'C' };
  if (dl >= 1)   return { label: 'Poor',      color: '#EF5350', grade: 'D' };
  return { label: 'Outage', color: '#B71C1C', grade: 'F' };
}

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
  const [apiStats, setApiStats] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [apiQuality, setApiQuality] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [outageConfidence, setOutageConfidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testingStage, setTestingStage] = useState('');
  const [lastTestResult, setLastTestResult] = useState(null);
  const [networkUsage, setNetworkUsage] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [bandwidth, setBandwidth] = useState({ download: null, upload: null, measuring: false });
  const [bandwidthHistory, setBandwidthHistory] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected'); // 'connected' | 'disconnected'
  const [now, setNow] = useState(new Date());

  // ── WebSocket real-time feed ───────────────────────────────────────────────
  const wsRef = useRef(null);
  useEffect(() => {
    const API_BASE = process.env.REACT_APP_API_URL || '/api';
    const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/live';
    let reconnectTimer;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen  = () => { if (!destroyed) setWsStatus('connected'); };
        ws.onclose = () => {
          if (destroyed) return;
          setWsStatus('disconnected');
          reconnectTimer = setTimeout(connect, 10000);  // reconnect after 10s
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'measurement') {
              // New measurement pushed from server — refresh data
              fetchData();
            }
          } catch {}
        };
        // Keepalive ping every 25s
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25000);
        ws.addEventListener('close', () => clearInterval(ping));
      } catch {}
    }

    connect();
    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;  // prevent reconnect loop on cleanup
        wsRef.current.onerror = null;  // prevent error triggering close → reconnect
        wsRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [timeRange, setTimeRange] = useState(24);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown] = useState(60);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [measRes, ispRes, statsRes, alertsRes, qualRes, confidenceRes] = await Promise.all([
        getRecentMeasurements(timeRange),
        getISPComparison(),
        getStats(timeRange),
        getAlerts(),
        getQualityScore(timeRange).catch(() => null),
        getOutageConfidence().catch(() => null),
      ]);
      setMeasurements(measRes.data);
      setIspData(ispRes.data);
      setApiStats(statsRes.data);
      setAlerts(alertsRes.data);
      if (qualRes) setApiQuality(qualRes.data);
      if (confidenceRes) setOutageConfidence(confidenceRes.data);
      setLastUpdated(new Date());
      // Fetch AI insights separately (slower, won't block main load)
      getAIInsights(timeRange).then((r) => setAiInsights(r.data)).catch(() => {});
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

  // Tick countdown + live clock
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((s) => (s <= 1 ? 60 : s - 1));
      setNow(new Date());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch network usage (apps list + server totals)
  const fetchNetworkUsage = useCallback(async () => {
    if (networkLoading) return;
    setNetworkLoading(true);
    try {
      const res = await getNetworkUsage();
      setNetworkUsage(res.data);
    } catch { /* silent */ } finally {
      setNetworkLoading(false);
    }
  }, [networkLoading]);

  useEffect(() => {
    fetchNetworkUsage();
    const t = setInterval(fetchNetworkUsage, 10000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser-side bandwidth measurement — times a real fetch against the backend
  // so we measure the user's connection speed, not the server's network I/O.
  const measureBandwidth = useCallback(async () => {
    setBandwidth((prev) => ({ ...prev, measuring: true }));
    try {
      const API_BASE = process.env.REACT_APP_API_URL || '/api';
      const PROBE_KB = 256;

      // ── Download: fetch 256 KB, time how long it takes ──
      const t0 = performance.now();
      const dlRes = await fetch(`${API_BASE}/bandwidth-probe?size_kb=${PROBE_KB}`, {
        cache: 'no-store',
      });
      await dlRes.arrayBuffer();
      const dlSec = (performance.now() - t0) / 1000;
      const dlMbps = parseFloat(((PROBE_KB * 1024 * 8) / dlSec / 1_000_000).toFixed(2));

      // ── Upload: POST 32 KB (stays under 64 KB request-body limit), time it ──
      const UPLOAD_BYTES = 32 * 1024;
      const tu0 = performance.now();
      await fetch(`${API_BASE}/bandwidth-probe`, {
        method: 'POST',
        body: new Uint8Array(UPLOAD_BYTES),
        headers: { 'Content-Type': 'application/octet-stream' },
        cache: 'no-store',
      });
      const ulSec = (performance.now() - tu0) / 1000;
      const ulMbps = parseFloat(((UPLOAD_BYTES * 8) / ulSec / 1_000_000).toFixed(2));

      setBandwidth({ download: dlMbps, upload: ulMbps, measuring: false });
      setBandwidthHistory(prev => [...prev, { dl: dlMbps, ul: ulMbps }].slice(-24));
    } catch {
      setBandwidth((prev) => ({ ...prev, measuring: false }));
    }
  }, []);

  useEffect(() => {
    measureBandwidth();
    const t = setInterval(measureBandwidth, 8000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Request browser notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const runTest = async () => {
    setTesting(true);
    setLastTestResult(null);
    setError(null);
    try {
      // Step 1: get location
      setTestingStage('Getting location…');
      let lat = null, lon = null, location = null;
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        lat = parseFloat(pos.coords.latitude.toFixed(6));
        lon = parseFloat(pos.coords.longitude.toFixed(6));
      } catch { /* permission denied — run without coords */ }

      // Step 2: run test
      setTestingStage('Connecting to best server…');
      await new Promise((r) => setTimeout(r, 400)); // brief pause so user sees stage
      setTestingStage('Measuring download speed…');
      const res = await runTestNow(location, lat, lon);
      setLastTestResult({ ...res.data, ran_at: new Date() });

      // Step 3: refresh data
      setTestingStage('Saving results…');
      await fetchData();
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
      setError(`Speed test failed: ${detail}`);
    } finally {
      setTesting(false);
      setTestingStage('');
    }
  };

  const exportCSV = () => {
    if (!measurements.length) return;
    const header = 'Timestamp,Download (Mbps),Upload (Mbps),Ping (ms),ISP,Location,Outage';
    const rows = [...measurements].reverse().map((m) =>
      [
        parseTS(m.timestamp).toISOString(),
        m.download_speed?.toFixed(2),
        m.upload_speed?.toFixed(2),
        m.ping?.toFixed(0),
        m.isp,
        m.location || '',
        m.is_outage ? 'Yes' : 'No',
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speed-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearMeasurements();
      setClearDialogOpen(false);
      await fetchData();
    } catch (err) {
      setError(`Clear failed: ${err?.response?.data?.detail || err?.message}`);
      setClearDialogOpen(false);
    } finally {
      setClearing(false);
    }
  };

  // ── Computed stats — prefer API stats endpoint over local aggregation ──────

  const stats = {
    total: apiStats?.total_tests ?? measurements.length,
    outages: apiStats?.total_outages ?? measurements.filter((m) => m.is_outage).length,
    avgDownload: apiStats?.avg_download_mbps != null
      ? parseFloat(apiStats.avg_download_mbps.toFixed(1))
      : measurements.length > 0
        ? parseFloat((measurements.reduce((a, b) => a + b.download_speed, 0) / measurements.length).toFixed(1))
        : '—',
    avgUpload: apiStats?.avg_upload_mbps != null
      ? parseFloat(apiStats.avg_upload_mbps.toFixed(1))
      : measurements.length > 0
        ? parseFloat((measurements.reduce((a, b) => a + b.upload_speed, 0) / measurements.length).toFixed(1))
        : '—',
    avgPing: apiStats?.avg_ping_ms != null ? parseFloat(apiStats.avg_ping_ms.toFixed(0)) : null,
    uptime: apiStats?.uptime_percentage ?? null,
    lastTestAt: apiStats?.last_test_at ?? null,
  };

  const outageRate = stats.uptime != null
    ? parseFloat((100 - stats.uptime).toFixed(0))
    : stats.total > 0
      ? parseFloat(((stats.outages / stats.total) * 100).toFixed(0))
      : 0;

  const avgDownloadNum = typeof stats.avgDownload === 'number' ? stats.avgDownload : null;

  const hasActiveOutage = alerts?.current_outage ?? (measurements.length > 0 && measurements[0]?.is_outage);

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

  // Quality score — prefer API value, fall back to local estimate
  const qualityScore = apiQuality?.score ?? Math.max(0, Math.min(100, Math.round(
    100
    - outageRate * 2
    - (avgDownloadNum !== null && avgDownloadNum < 10 ? 20 : avgDownloadNum !== null && avgDownloadNum < 25 ? 8 : 0)
  )));
  const qualityGrade = apiQuality?.grade ?? null;
  const qualityLabel = apiQuality?.label ?? null;
  const healthColor = qualityScore >= 80 ? '#66BB6A' : qualityScore >= 55 ? '#FFA726' : '#EF5350';

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
    time: parseTS(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    download: parseFloat(m.download_speed?.toFixed(2)),
    upload: parseFloat(m.upload_speed?.toFixed(2)),
  }));

  const rating = speedRating(avgDownloadNum);
  const notifGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  // Push notifications: outage start, recovery, and degraded state
  const prevOutageRef = useRef(false);
  const prevDegradedRef = useRef(false);
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const isDegraded = !hasActiveOutage && avgDownloadNum > 0 && avgDownloadNum < 5;
    // Outage started
    if (hasActiveOutage && !prevOutageRef.current) {
      new Notification('⚠️ Internet Outage Detected', {
        body: 'Your connection appears to be down. Internet Stability Tracker is monitoring.',
        icon: '/favicon.svg',
        tag: 'outage-start',
      });
    }
    // Outage recovered
    if (!hasActiveOutage && prevOutageRef.current) {
      new Notification('✅ Connection Restored', {
        body: 'Your internet connection has recovered. Monitoring continues.',
        icon: '/favicon.svg',
        tag: 'outage-end',
      });
    }
    // Degraded speed alert (only notify once per degraded period)
    if (isDegraded && !prevDegradedRef.current && !hasActiveOutage) {
      new Notification('🐢 Slow Connection Detected', {
        body: `Your download speed is ${avgDownloadNum.toFixed(1)} Mbps — below normal.`,
        icon: '/favicon.svg',
        tag: 'degraded',
      });
    }
    prevOutageRef.current = hasActiveOutage;
    prevDegradedRef.current = isDegraded;
  }, [hasActiveOutage, avgDownloadNum]);

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
                {now.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                {' · '}
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {lastUpdated && (
                  <span style={{ opacity: 0.6, marginLeft: 8, fontSize: 11 }}>
                    · data updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* WebSocket status dot */}
              <Tooltip title={wsStatus === 'connected' ? 'Live feed connected' : 'Live feed disconnected — polling every 60s'}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.3, borderRadius: 10,
                  bgcolor: wsStatus === 'connected' ? 'rgba(67,160,71,0.18)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${wsStatus === 'connected' ? 'rgba(67,160,71,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  cursor: 'default' }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%',
                    bgcolor: wsStatus === 'connected' ? '#43A047' : '#888',
                    boxShadow: wsStatus === 'connected' ? '0 0 6px #43A047' : 'none' }} />
                  <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700,
                    color: wsStatus === 'connected' ? '#43A047' : 'rgba(255,255,255,0.4)' }}>
                    {wsStatus === 'connected' ? 'LIVE' : 'POLL'}
                  </Typography>
                </Box>
              </Tooltip>

              {/* Countdown ring */}
              <CountdownRing seconds={countdown} />

              {/* Refresh icon */}
              <Tooltip title="Refresh now">
                <span>
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
                </span>
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
                  {testing ? (testingStage || 'Running…') : 'Run Speed Test'}
                </Button>
              </motion.div>

              {/* Export CSV */}
              <Tooltip title={measurements.length ? 'Export history as CSV' : 'No data to export'}>
                <span>
                  <IconButton
                    onClick={exportCSV}
                    disabled={!measurements.length}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.7)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.16)', color: '#fff' },
                      '&:disabled': { color: 'rgba(255,255,255,0.2)' },
                    }}
                  >
                    <FileDownloadIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              {/* Notification bell */}
              <Tooltip title={notifGranted ? 'Outage alerts enabled' : 'Enable outage alerts'}>
                <IconButton
                  onClick={() => 'Notification' in window && Notification.requestPermission()}
                  sx={{
                    bgcolor: notifGranted ? 'rgba(240,194,75,0.15)' : 'rgba(255,255,255,0.08)',
                    color: notifGranted ? '#f0c24b' : 'rgba(255,255,255,0.45)',
                    border: `1px solid ${notifGranted ? 'rgba(240,194,75,0.35)' : 'rgba(255,255,255,0.12)'}`,
                    '&:hover': { bgcolor: 'rgba(240,194,75,0.25)' },
                  }}
                >
                  <NotificationsActiveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
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

      {/* ── Last Test Result ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {lastTestResult && (
          <motion.div
            key="last-result"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.4 }}
          >
            <Paper
              sx={{
                mb: 3, p: { xs: 2, md: 2.5 },
                background: 'linear-gradient(135deg, #0a1200 0%, #111a00 60%, #1a2600 100%)',
                border: '1px solid rgba(100,220,60,0.35)',
                boxShadow: '0 8px 32px rgba(100,220,60,0.12)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              <Box sx={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130, borderRadius: '50%', bgcolor: 'rgba(100,220,60,0.06)' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, position: 'relative', zIndex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <LiveDot color="#66BB6A" />
                  <Box>
                    <Typography fontWeight={800} sx={{ color: '#66BB6A', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Latest Speed Test Result
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
                      {lastTestResult.ran_at.toLocaleString([], {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                      {' · '}{lastTestResult.isp}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Download', value: lastTestResult.download_speed?.toFixed(2), unit: 'Mbps', color: '#f0c24b', Icon: DownloadIcon },
                    { label: 'Upload',   value: lastTestResult.upload_speed?.toFixed(2),   unit: 'Mbps', color: '#d0d0d0', Icon: UploadIcon },
                    { label: 'Ping',     value: lastTestResult.ping?.toFixed(0),            unit: 'ms',   color: lastTestResult.ping < 30 ? '#66BB6A' : lastTestResult.ping < 80 ? '#FFA726' : '#EF5350', Icon: AccessTimeIcon },
                  ].map(({ label, value, unit, color, Icon }) => (
                    <Box key={label} sx={{ textAlign: 'center', minWidth: 80 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.25 }}>
                        <Icon sx={{ fontSize: 13, color }} />
                        <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Typography>
                      </Box>
                      <Typography sx={{ fontWeight: 900, fontSize: '1.7rem', color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {value}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{unit}</Typography>
                    </Box>
                  ))}
                </Box>
                <Chip
                  label={lastTestResult.is_outage ? 'Outage' : 'OK'}
                  size="small"
                  component={Link}
                  to="/certificate"
                  clickable
                  sx={{
                    fontWeight: 800, fontSize: 12,
                    bgcolor: lastTestResult.is_outage ? 'rgba(239,83,80,0.18)' : 'rgba(102,187,106,0.18)',
                    color: lastTestResult.is_outage ? '#EF5350' : '#66BB6A',
                    border: `1px solid ${lastTestResult.is_outage ? 'rgba(239,83,80,0.4)' : 'rgba(102,187,106,0.4)'}`,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    '&:hover': { opacity: 0.85 },
                  }}
                />
              </Box>
            </Paper>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Network Status Badge ──────────────────────────────────────────── */}
      {!loading && (apiStats != null || measurements.length > 0) && (
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
                label={`${timeRange}h window · ${stats.total} tests`}
                size="small"
                sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', fontWeight: 600 }}
              />
              {alerts?.outage_count_48h > 0 && (
                <Chip
                  label={`${alerts.outage_count_48h} outage${alerts.outage_count_48h !== 1 ? 's' : ''} in 48h`}
                  size="small"
                  sx={{ bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontWeight: 700, border: '1px solid rgba(239,83,80,0.3)' }}
                />
              )}
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
            size={{ xs: 12, sm: 6 }}
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

      {/* ── Outage Confidence + AI Insights ────────────────────────────── */}
      {!loading && (outageConfidence || aiInsights) && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Outage Confidence */}
            {outageConfidence && (
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper sx={{ p: 2.5, height: '100%', background: isDark ? '#080808' : '#fff', border: `1px solid ${outageConfidence.level === 'critical' ? 'rgba(239,83,80,0.4)' : outageConfidence.level === 'high' ? 'rgba(255,167,38,0.4)' : 'rgba(240,194,75,0.18)'}` }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <WarningAmberIcon sx={{ fontSize: 16, color: outageConfidence.level === 'critical' ? '#EF5350' : outageConfidence.level === 'high' ? '#FFA726' : '#f0c24b' }} />
                    Smart Outage Detection
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 1.5 }}>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      <CircularProgress variant="determinate" value={100} size={56} thickness={5} sx={{ color: isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0', position: 'absolute' }} />
                      <CircularProgress variant="determinate" value={outageConfidence.confidence} size={56} thickness={5}
                        sx={{ color: outageConfidence.confidence >= 80 ? '#EF5350' : outageConfidence.confidence >= 50 ? '#FFA726' : '#66BB6A' }} />
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography fontWeight={900} fontSize="0.85rem">{outageConfidence.confidence}%</Typography>
                      </Box>
                    </Box>
                    <Box>
                      <Chip label={outageConfidence.level.toUpperCase()} size="small"
                        sx={{ fontWeight: 800, fontSize: 10, mb: 0.5,
                          bgcolor: outageConfidence.level === 'none' ? 'rgba(67,160,71,0.15)' : outageConfidence.level === 'low' ? 'rgba(240,194,75,0.15)' : outageConfidence.level === 'medium' ? 'rgba(255,167,38,0.15)' : outageConfidence.level === 'high' ? 'rgba(255,87,34,0.15)' : 'rgba(239,83,80,0.15)',
                          color: outageConfidence.level === 'none' ? '#43A047' : outageConfidence.level === 'low' ? '#f0c24b' : outageConfidence.level === 'medium' ? '#FFA726' : '#EF5350',
                        }} />
                      <Typography variant="caption" color="text.secondary" display="block">confidence</Typography>
                    </Box>
                  </Box>
                  {outageConfidence.sources.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      {outageConfidence.sources.map((s, i) => (
                        <Typography key={i} variant="caption" color="text.secondary" display="block" sx={{ fontSize: 11, lineHeight: 1.6 }}>
                          • {s}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </Paper>
              </Grid>
            )}

            {/* AI Insights */}
            {aiInsights && aiInsights.insights.length > 0 && (
              <Grid size={{ xs: 12, md: outageConfidence ? 8 : 12 }}>
                <Paper sx={{ p: 2.5, height: '100%', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    AI Network Insights
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {aiInsights.insights.slice(0, 3).map((insight, i) => (
                      <Box key={i} sx={{
                        p: 1.5, borderRadius: 2,
                        bgcolor: insight.severity === 'error' ? 'rgba(239,83,80,0.08)' : insight.severity === 'warning' ? 'rgba(255,167,38,0.08)' : 'rgba(240,194,75,0.06)',
                        border: `1px solid ${insight.severity === 'error' ? 'rgba(239,83,80,0.2)' : insight.severity === 'warning' ? 'rgba(255,167,38,0.2)' : 'rgba(240,194,75,0.15)'}`,
                      }}>
                        <Typography variant="caption" fontWeight={800} display="block" sx={{ color: insight.severity === 'error' ? '#EF5350' : insight.severity === 'warning' ? '#FFA726' : '#f0c24b', mb: 0.25 }}>
                          {insight.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.5 }}>
                          {insight.message}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  {aiInsights.trend && aiInsights.trend !== 'insufficient_data' && (
                    <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip size="small" label={`Trend: ${aiInsights.trend}`}
                        sx={{ fontWeight: 700, fontSize: 11,
                          bgcolor: aiInsights.trend === 'improving' ? 'rgba(67,160,71,0.12)' : aiInsights.trend === 'degrading' ? 'rgba(239,83,80,0.12)' : 'rgba(148,163,184,0.12)',
                          color: aiInsights.trend === 'improving' ? '#43A047' : aiInsights.trend === 'degrading' ? '#EF5350' : 'text.secondary',
                        }} />
                      {aiInsights.overall_avg_download && (
                        <Chip size="small" label={`Avg ${aiInsights.overall_avg_download} Mbps (${aiInsights.hours_analyzed}h)`} sx={{ fontWeight: 600, fontSize: 11 }} />
                      )}
                    </Box>
                  )}
                </Paper>
              </Grid>
            )}
          </Grid>
        </motion.div>
      )}

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
                    {qualityGrade ? `Grade ${qualityGrade} · ${qualityLabel}` : 'Quality Score'}
                  </Typography>
                </Box>

                <Box>
                  <Chip
                    label={`${stats.uptime != null ? stats.uptime.toFixed(1) : (100 - outageRate)}% uptime`}
                    size="small"
                    sx={{ bgcolor: `${healthColor}20`, color: healthColor, fontWeight: 700, border: `1px solid ${healthColor}40`, mb: 0.75 }}
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    {stats.outages} outage{stats.outages !== 1 ? 's' : ''} / {timeRange}h
                    {stats.avgPing != null && ` · ${stats.avgPing}ms ping`}
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
                {chartData.length > 20 && (
                  <Brush
                    dataKey="time"
                    height={22}
                    stroke="rgba(240,194,75,0.3)"
                    fill={isDark ? '#0a0a0a' : '#f8f8f8'}
                    travellerWidth={8}
                    startIndex={Math.max(0, chartData.length - 30)}
                  />
                )}
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

      {/* ── Internet Activity Cards ───────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52 }}>
        <Paper sx={{ p: 3, mb: 3, border: '1px solid rgba(240,194,75,0.18)', background: isDark ? '#080808' : '#fff' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>What Can You Do?</Typography>
              <Typography variant="caption" color="text.secondary">Based on your current average download speed</Typography>
            </Box>
            {avgDownloadNum !== null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ textAlign: 'center', px: 2, py: 0.75, borderRadius: 2, bgcolor: `${rating.color}18`, border: `1px solid ${rating.color}40` }}>
                  <Typography sx={{ fontSize: '1.6rem', fontWeight: 900, color: rating.color, lineHeight: 1 }}>{rating.grade}</Typography>
                  <Typography sx={{ fontSize: 10, color: rating.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{rating.label}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#f0c24b' }}>{avgDownloadNum} Mbps</Typography>
                  <Typography variant="caption" color="text.secondary">avg download</Typography>
                </Box>
              </Box>
            )}
          </Box>
          <Grid container spacing={1.5}>
            {ACTIVITIES.map((act) => {
              const ok = avgDownloadNum !== null && avgDownloadNum >= act.minDown;
              const IconComp = act.icon;
              return (
                <Grid size={{ xs: 6, sm: 4, md: 2 }} key={act.label}>
                  <motion.div whileHover={{ scale: 1.04 }} transition={{ duration: 0.2 }}>
                    <Box
                      sx={{
                        p: 1.5, borderRadius: 2.5, textAlign: 'center',
                        border: `1px solid ${ok ? act.color + '40' : 'rgba(255,255,255,0.06)'}`,
                        bgcolor: ok ? `${act.color}12` : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                        opacity: ok ? 1 : 0.45,
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <IconComp sx={{ fontSize: 26, color: ok ? act.color : 'text.disabled', mb: 0.5 }} />
                      <Typography variant="caption" fontWeight={700} display="block" sx={{ color: ok ? act.color : 'text.disabled', lineHeight: 1.2 }}>
                        {act.label}
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ fontSize: 10, color: 'text.disabled', mt: 0.25 }}>
                        {ok ? '✓ Supported' : `≥ ${act.minDown} Mbps`}
                      </Typography>
                    </Box>
                  </motion.div>
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      </motion.div>

      {/* ── Recent Speed Tests ────────────────────────────────────────────── */}
      {measurements.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.56 }}>
          <Paper sx={{ p: 3, border: '1px solid rgba(240,194,75,0.18)', background: isDark ? '#080808' : '#fff' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>Recent Speed Tests</Typography>
                <Typography variant="caption" color="text.secondary">Last {Math.min(measurements.length, 10)} measurements</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Export as CSV">
                  <IconButton onClick={exportCSV} size="small" sx={{ bgcolor: 'rgba(240,194,75,0.1)', color: '#f0c24b', border: '1px solid rgba(240,194,75,0.2)' }}>
                    <FileDownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Clear all test data">
                  <IconButton onClick={() => setClearDialogOpen(true)} size="small" sx={{ bgcolor: 'rgba(239,83,80,0.08)', color: '#EF5350', border: '1px solid rgba(239,83,80,0.2)', '&:hover': { bgcolor: 'rgba(239,83,80,0.18)' } }}>
                    <DeleteSweepIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <TableContainer sx={{ maxHeight: 340 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: isDark ? '#0d0d0d' : '#fafafa', fontWeight: 700 }}>Time</TableCell>
                    <TableCell sx={{ bgcolor: isDark ? '#0d0d0d' : '#fafafa', fontWeight: 700 }}>Download</TableCell>
                    <TableCell sx={{ bgcolor: isDark ? '#0d0d0d' : '#fafafa', fontWeight: 700 }}>Upload</TableCell>
                    <TableCell sx={{ bgcolor: isDark ? '#0d0d0d' : '#fafafa', fontWeight: 700 }}>Ping</TableCell>
                    <TableCell sx={{ bgcolor: isDark ? '#0d0d0d' : '#fafafa', fontWeight: 700 }}>ISP</TableCell>
                    <TableCell align="center" sx={{ bgcolor: isDark ? '#0d0d0d' : '#fafafa', fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {measurements.slice(0, 10).map((m, idx) => (
                    <TableRow key={m.id} hover sx={{ '&:last-child td': { borderBottom: 0 }, opacity: idx === 0 ? 1 : 0.88 }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <AccessTimeIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                          <Box>
                            <Typography variant="caption" fontWeight={idx === 0 ? 700 : 500} display="block" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {parseTS(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }} display="block">
                              {parseTS(m.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Typography>
                          </Box>
                          {idx === 0 && <Chip label="Latest" size="small" sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: 'rgba(240,194,75,0.15)', color: '#f0c24b' }} />}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} sx={{ color: '#f0c24b' }}>
                          {m.download_speed?.toFixed(1)} Mbps
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} color="text.secondary">
                          {m.upload_speed?.toFixed(1)} Mbps
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`${m.ping?.toFixed(0)}ms`}
                          size="small"
                          sx={{
                            height: 20, fontSize: 11, fontWeight: 700,
                            bgcolor: m.ping < 30 ? 'rgba(67,160,71,0.15)' : m.ping < 80 ? 'rgba(255,167,38,0.15)' : 'rgba(239,83,80,0.15)',
                            color: m.ping < 30 ? '#43A047' : m.ping < 80 ? '#FFA726' : '#EF5350',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" noWrap>{m.isp}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        {m.is_outage ? (
                          <Chip label="Outage" size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(239,83,80,0.15)', color: '#EF5350', fontWeight: 700 }} />
                        ) : (
                          <Chip label="OK" size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(67,160,71,0.15)', color: '#43A047', fontWeight: 700 }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </motion.div>
      )}

      {/* ── Clear Data Confirmation Dialog ───────────────────────────────── */}
      <Dialog
        open={clearDialogOpen}
        onClose={() => !clearing && setClearDialogOpen(false)}
        PaperProps={{ sx: { background: '#0d0d0d', border: '1px solid rgba(239,83,80,0.3)', borderRadius: 3 } }}
      >
        <DialogTitle sx={{ color: '#EF5350', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteSweepIcon /> Clear All Test Data?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'rgba(255,255,255,0.7)' }}>
            This will permanently delete <strong style={{ color: '#fff' }}>all {stats.total} speed test records</strong> and outage events.
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setClearDialogOpen(false)} disabled={clearing} sx={{ color: 'rgba(255,255,255,0.6)' }}>
            Cancel
          </Button>
          <Button
            onClick={handleClear}
            disabled={clearing}
            variant="contained"
            startIcon={clearing ? <CircularProgress size={14} color="inherit" /> : <DeleteSweepIcon />}
            sx={{ bgcolor: '#EF5350', color: '#fff', fontWeight: 800, '&:hover': { bgcolor: '#C62828' }, '&:disabled': { bgcolor: 'rgba(239,83,80,0.3)' } }}
          >
            {clearing ? 'Clearing…' : 'Yes, Clear All'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Live Network Activity ─────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Paper sx={{ mt: 3, border: '1px solid rgba(240,194,75,0.18)', background: isDark ? '#080808' : '#fff', overflow: 'hidden' }}>

          {/* ── Header ── */}
          <Box sx={{ px: 3, pt: 2.5, pb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: bandwidth.measuring ? '#FFA726' : bandwidth.download != null ? '#43A047' : '#757575', position: 'absolute' }} />
                <Box sx={{
                  width: 10, height: 10, borderRadius: '50%', position: 'absolute', opacity: 0.4,
                  bgcolor: bandwidth.measuring ? '#FFA726' : bandwidth.download != null ? '#43A047' : '#757575',
                  animation: 'ist-pulse 2s ease-out infinite',
                  '@keyframes ist-pulse': {
                    '0%':   { transform: 'scale(1)', opacity: 0.5 },
                    '80%':  { transform: 'scale(2.8)', opacity: 0 },
                    '100%': { transform: 'scale(2.8)', opacity: 0 },
                  },
                }} />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>Live Network Activity</Typography>
                <Typography variant="caption" color="text.secondary">
                  Browser-measured bandwidth · active process connections · refreshes every 8s
                </Typography>
              </Box>
            </Box>
            <Chip size="small"
              label={bandwidth.measuring ? 'Measuring…' : bandwidth.download != null ? 'Live' : 'Initialising'}
              sx={{
                fontWeight: 700, fontSize: 10, height: 22,
                bgcolor: bandwidth.measuring ? 'rgba(255,167,38,0.15)' : bandwidth.download != null ? 'rgba(67,160,71,0.15)' : 'rgba(117,117,117,0.15)',
                color:   bandwidth.measuring ? '#FFA726'              : bandwidth.download != null ? '#43A047'             : '#757575',
                border:  `1px solid ${bandwidth.measuring ? 'rgba(255,167,38,0.3)' : bandwidth.download != null ? 'rgba(67,160,71,0.3)' : 'rgba(117,117,117,0.2)'}`,
              }}
            />
          </Box>

          <Box sx={{ px: 3, py: 2.5 }}>
            {/* ── Bandwidth stat cards ── */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {[
                { label: 'Download', value: bandwidth.download, icon: DownloadIcon, color: '#42A5F5', histKey: 'dl', thresholds: [50, 20, 5],  qLabels: ['Fast','Good','Fair','Slow'], qColors: ['#43A047','#66BB6A','#FFA726','#EF5350'] },
                { label: 'Upload',   value: bandwidth.upload,   icon: UploadIcon,   color: '#AB47BC', histKey: 'ul', thresholds: [20, 10, 2],  qLabels: ['Fast','Good','Fair','Slow'], qColors: ['#43A047','#66BB6A','#FFA726','#EF5350'] },
              ].map(({ label, value, icon: Icon, color, histKey, thresholds, qLabels, qColors }) => {
                const qi = value == null ? -1 : value >= thresholds[0] ? 0 : value >= thresholds[1] ? 1 : value >= thresholds[2] ? 2 : 3;
                const qColor = qi >= 0 ? qColors[qi] : '#757575';
                const qLabel = qi >= 0 ? qLabels[qi] : '—';
                const history = bandwidthHistory.map(h => h[histKey]);
                const histMax = Math.max(...history, 1);
                return (
                  <Grid size={{ xs: 12, sm: 6 }} key={label}>
                    <Box sx={{
                      p: 2, borderRadius: 2, height: '100%',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'}`,
                      bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Icon sx={{ fontSize: 16, color }} />
                          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
                        </Box>
                        <Chip size="small" label={qLabel} sx={{ fontWeight: 700, fontSize: 10, height: 18, bgcolor: `${qColor}18`, color: qColor, border: `1px solid ${qColor}30` }} />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 1.5 }}>
                        {bandwidth.measuring && value === null ? (
                          <CircularProgress size={20} sx={{ color }} />
                        ) : (
                          <>
                            <Typography fontWeight={900} sx={{ fontSize: '2rem', lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>
                              {value != null ? value.toFixed(1) : '—'}
                            </Typography>
                            <Typography variant="caption" fontWeight={700} sx={{ color, mb: 0.3 }}>Mbps</Typography>
                          </>
                        )}
                      </Box>
                      {history.length >= 2 ? (
                        <Box sx={{ position: 'relative', height: 36 }}>
                          <svg width="100%" height="36" preserveAspectRatio="none" style={{ display: 'block' }}>
                            <defs>
                              <linearGradient id={`g-${histKey}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                                <stop offset="100%" stopColor={color} stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {(() => {
                              const pts = history.map((v, i) => ({ x: (i / (history.length - 1)) * 100, y: 34 - ((v / histMax) * 30) }));
                              const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                              const area = `${line} L${pts[pts.length-1].x},36 L${pts[0].x},36 Z`;
                              return (
                                <>
                                  <path d={area} fill={`url(#g-${histKey})`} />
                                  <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                  <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="2.5" fill={color} />
                                </>
                              );
                            })()}
                          </svg>
                          <Typography variant="caption" color="text.disabled" sx={{ position: 'absolute', bottom: 0, right: 0, fontSize: 9 }}>
                            {history.length} readings
                          </Typography>
                        </Box>
                      ) : (
                        <Box sx={{ height: 36, display: 'flex', alignItems: 'center' }}>
                          <Typography variant="caption" color="text.disabled">Collecting history…</Typography>
                        </Box>
                      )}
                    </Box>
                  </Grid>
                );
              })}
            </Grid>

            {/* ── Session totals ── */}
            {networkUsage && (networkUsage.total_recv_gb != null || networkUsage.total_sent_gb != null) && (
              <Box sx={{ display: 'flex', gap: 3, mb: 2.5, px: 1.5, py: 1, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
                <Box>
                  <Typography variant="caption" color="text.disabled">Total received</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#42A5F5', fontVariantNumeric: 'tabular-nums' }}>{networkUsage.total_recv_gb?.toFixed(2)} GB</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.disabled">Total sent</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#AB47BC', fontVariantNumeric: 'tabular-nums' }}>{networkUsage.total_sent_gb?.toFixed(2)} GB</Typography>
                </Box>
              </Box>
            )}

            {/* ── Active processes ── */}
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, display: 'block' }}>
              Active Processes
            </Typography>

            {networkLoading && !networkUsage ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="rectangular" height={44} sx={{ borderRadius: 1.5 }} />
                ))}
              </Box>
            ) : networkUsage?.apps?.length > 0 ? (() => {
              const maxConns = Math.max(...networkUsage.apps.map(a => a.connections), 1);
              const APP_COLORS = [
                ['#42A5F5', '#1565C0'], ['#AB47BC', '#6A1B9A'], ['#f0c24b', '#b8860b'],
                ['#43A047', '#1B5E20'], ['#EF5350', '#B71C1C'], ['#26C6DA', '#006064'],
              ];
              return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {networkUsage.apps.map((app, i) => {
                    const [light, dark] = APP_COLORS[i % APP_COLORS.length];
                    const ac = isDark ? dark : light;
                    const barPct = Math.round((app.connections / maxConns) * 100);
                    return (
                      <motion.div key={app.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderRadius: 1.5,
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                          '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' },
                          transition: 'background 0.15s',
                        }}>
                          <Box sx={{ width: 32, height: 32, borderRadius: 1.5, flexShrink: 0, bgcolor: `${ac}22`, border: `1px solid ${ac}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography fontWeight={900} fontSize={13} sx={{ color: ac, lineHeight: 1 }}>{app.name.charAt(0).toUpperCase()}</Typography>
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.4 }}>
                              <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: '70%' }}>{app.name}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0, ml: 1 }}>
                                {app.connections} conn{app.connections !== 1 ? 's' : ''}
                              </Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={barPct} sx={{
                              height: 4, borderRadius: 2,
                              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
                              '& .MuiLinearProgress-bar': { bgcolor: ac, borderRadius: 2 },
                            }} />
                          </Box>
                          {app.remote_addresses?.length > 0 && (
                            <Tooltip title={app.remote_addresses.join(', ')} placement="left" arrow>
                              <Chip size="small"
                                label={`${app.remote_addresses.length} IP${app.remote_addresses.length !== 1 ? 's' : ''}`}
                                sx={{ height: 18, fontSize: 9, fontWeight: 700, flexShrink: 0, cursor: 'default', bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </motion.div>
                    );
                  })}
                </Box>
              );
            })() : (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <WifiIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 0.5 }} />
                <Typography variant="body2" color="text.secondary">No active connections detected</Typography>
                <Typography variant="caption" color="text.disabled">Processes with established TCP connections will appear here</Typography>
              </Box>
            )}
          </Box>
        </Paper>
      </motion.div>
    </Box>
  );
}

export default Dashboard;
