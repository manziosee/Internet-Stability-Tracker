import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Typography, Paper, Grid, Chip, CircularProgress, Button,
  TextField, ToggleButtonGroup, ToggleButton, Tooltip, Alert,
  LinearProgress, useTheme, Skeleton, IconButton, Snackbar,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ShareIcon from '@mui/icons-material/Share';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PublicIcon from '@mui/icons-material/Public';
import BoltIcon from '@mui/icons-material/Bolt';
import SpeedIcon from '@mui/icons-material/Speed';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RouteIcon from '@mui/icons-material/Route';
import {
  getCongestionHeatmap, getComparison, getAnomalies,
  runTraceroute, createSnapshot, getMultiRegion,
} from '../services/api';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Congestion Heatmap ────────────────────────────────────────────────────────
function CongestionHeatmap({ data }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  if (!data?.cells?.length) return null;

  const validSpeeds = data.cells.filter((c) => c.avg_mbps != null).map((c) => c.avg_mbps);
  const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1;
  const minSpeed = validSpeeds.length > 0 ? Math.min(...validSpeeds) : 0;

  function cellColor(avg) {
    if (avg == null) return isDark ? '#1a1a1a' : '#f0f0f0';
    const ratio = maxSpeed > minSpeed ? (avg - minSpeed) / (maxSpeed - minSpeed) : 0.5;
    // Red (slow) → Yellow → Green (fast)
    if (ratio < 0.33) return `rgba(239,83,80,${0.3 + ratio * 1.5})`;
    if (ratio < 0.66) return `rgba(255,167,38,${0.3 + (ratio - 0.33) * 1.5})`;
    return `rgba(67,160,71,${0.3 + (ratio - 0.66) * 1.5})`;
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1, pl: '44px' }}>
        {Array.from({ length: 24 }, (_, h) => (
          <Typography key={h} variant="caption" color="text.disabled"
            sx={{ width: 26, textAlign: 'center', fontSize: 9, flexShrink: 0 }}>
            {h % 3 === 0 ? `${h}h` : ''}
          </Typography>
        ))}
      </Box>
      {DAY_NAMES.map((day, dow) => (
        <Box key={dow} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}
            sx={{ width: 36, flexShrink: 0, fontSize: 10 }}>
            {day}
          </Typography>
          {Array.from({ length: 24 }, (_, hr) => {
            const cell = data.cells.find((c) => c.day === dow && c.hour === hr);
            const avg  = cell?.avg_mbps ?? null;
            return (
              <Tooltip key={hr} title={avg != null ? `${day} ${hr}:00 — ${avg} Mbps (${cell.samples} samples)` : `${day} ${hr}:00 — no data`}>
                <Box sx={{
                  width: 26, height: 18, borderRadius: 0.5, flexShrink: 0,
                  bgcolor: cellColor(avg),
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`,
                  cursor: 'default',
                  transition: 'opacity 0.15s',
                  '&:hover': { opacity: 0.75 },
                }} />
              </Tooltip>
            );
          })}
        </Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, pl: '44px' }}>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9 }}>Slow</Typography>
        {['#EF5350', '#FF8F00', '#FFA726', '#66BB6A', '#43A047'].map((c) => (
          <Box key={c} sx={{ width: 18, height: 10, borderRadius: 0.5, bgcolor: c }} />
        ))}
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9 }}>Fast</Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9, ml: 1 }}>
          · {data.total_samples} samples over {data.days_analyzed} days
        </Typography>
      </Box>
    </Box>
  );
}

// ── Comparison delta chip ────────────────────────────────────────────────────
function DeltaChip({ pct, label, invertGood = false }) {
  if (pct == null) return <Chip label="—" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />;
  const better = invertGood ? pct < 0 : pct > 0;
  const color  = better ? '#43A047' : pct === 0 ? '#888' : '#EF5350';
  const Icon   = pct > 0 ? TrendingUpIcon : pct < 0 ? TrendingDownIcon : TrendingFlatIcon;
  return (
    <Chip
      icon={<Icon style={{ fontSize: 13, color }} />}
      label={`${pct > 0 ? '+' : ''}${pct}% ${label}`}
      size="small"
      sx={{ bgcolor: `${color}14`, color, border: `1px solid ${color}30`, fontWeight: 700, fontSize: 11 }}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdvancedInsightsPage() {
  const theme   = useTheme();
  const isDark  = theme.palette.mode === 'dark';
  const pageRef = useRef(null);

  // State
  const [heatmap,    setHeatmap]    = useState(null);
  const [comparison, setComparison] = useState(null);
  const [anomalies,  setAnomalies]  = useState(null);
  const [multiRegion,setMultiRegion]= useState(null);
  const [traceroute, setTraceroute] = useState(null);
  const [traceHost,  setTraceHost]  = useState('8.8.8.8');
  const [traceLoading,setTraceLoad] = useState(false);
  const [slaTarget,  setSlaTarget]  = useState('');
  const [snackMsg,   setSnackMsg]   = useState('');
  const [heatDays,   setHeatDays]   = useState(28);
  const [anomHours,  setAnomHours]  = useState(168);
  const [loading,    setLoading]    = useState(true);

  // ISP SLA contracted speed (localStorage persistence)
  useEffect(() => {
    const saved = localStorage.getItem('ist_sla_target');
    if (saved) setSlaTarget(saved);
  }, []);
  const saveSla = (v) => {
    setSlaTarget(v);
    try { localStorage.setItem('ist_sla_target', v); } catch {}
  };

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      getCongestionHeatmap(heatDays).catch(() => null),
      getComparison().catch(() => null),
      getAnomalies(anomHours).catch(() => null),
      getMultiRegion().catch(() => null),
    ]).then(([h, c, a, m]) => {
      if (h) setHeatmap(h.data);
      if (c) setComparison(c.data);
      if (a) setAnomalies(a.data);
      if (m) setMultiRegion(m.data);
    }).finally(() => setLoading(false));
  }, [heatDays, anomHours]);

  useEffect(() => { loadData(); }, [loadData]);

  const runTrace = async () => {
    setTraceLoad(true);
    setTraceroute(null);
    try {
      const r = await runTraceroute(traceHost);
      setTraceroute(r.data);
    } catch (err) {
      const status = err?.response?.status;
      const msg = status === 503
        ? 'traceroute/tracepath is not installed in the server sandbox. Run it locally: traceroute 8.8.8.8'
        : status === 400
        ? 'Invalid host. Use a valid hostname or IP (e.g. 8.8.8.8, google.com).'
        : 'Traceroute failed — server error. Try again later.';
      setTraceroute({ error: msg });
    }
    finally { setTraceLoad(false); }
  };

  // ── PDF Export ───────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const canvas = await html2canvas(pageRef.current, { scale: 1.5, useCORS: true, backgroundColor: isDark ? '#0a0a0a' : '#fff' });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const imgH  = (canvas.height * pageW) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, imgH);
      pdf.save(`ist-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setSnackMsg('PDF export failed: ' + e.message);
    }
  };

  // ── Shareable Snapshot ───────────────────────────────────────────────────────
  const shareReport = async () => {
    try {
      const payload = { comparison, anomalies: anomalies?.anomalies?.length, heatmap_samples: heatmap?.total_samples, generated_at: new Date().toISOString() };
      const r = await createSnapshot(payload);
      const url = `${window.location.origin}${r.data.url}`;
      await navigator.clipboard.writeText(url);
      setSnackMsg('Report link copied to clipboard!');
    } catch {
      setSnackMsg('Could not create shareable link.');
    }
  };

  // ── SLA calculation ──────────────────────────────────────────────────────────
  const contractedMbps = parseFloat(slaTarget) || 0;
  const thisWeekDl     = comparison?.this_week?.avg_download ?? null;
  const slaHitPct      = (contractedMbps > 0 && thisWeekDl != null)
    ? Math.min(100, Math.round((thisWeekDl / contractedMbps) * 100))
    : null;

  return (
    <Box ref={pageRef} sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <Paper sx={{
          mb: 3, p: { xs: 2.5, md: 3.5 },
          background: 'linear-gradient(135deg, #000 0%, #0a0800 55%, #111000 100%)',
          border: '1px solid rgba(240,194,75,0.35)',
          boxShadow: '0 8px 48px rgba(240,194,75,0.1)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <BoltIcon sx={{ color: '#f0c24b', fontSize: 28 }} />
              <Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>Advanced Insights</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  Heatmap · anomalies · weekly comparison · multi-region · traceroute · SLA · PDF export
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="outlined" startIcon={<ShareIcon />} onClick={shareReport}
                sx={{ borderColor: 'rgba(240,194,75,0.4)', color: '#f0c24b', '&:hover': { borderColor: '#f0c24b', bgcolor: 'rgba(240,194,75,0.08)' } }}>
                Share
              </Button>
              <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={exportPDF}
                sx={{ borderColor: 'rgba(240,194,75,0.4)', color: '#f0c24b', '&:hover': { borderColor: '#f0c24b', bgcolor: 'rgba(240,194,75,0.08)' } }}>
                PDF
              </Button>
            </Box>
          </Box>
        </Paper>
      </motion.div>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" height={180} sx={{ borderRadius: 2 }} />)}
        </Box>
      ) : (
        <>
          {/* ── Week-over-Week Comparison ───────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Paper sx={{ mb: 3, p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
              <Typography variant="h6" fontWeight={700} gutterBottom>Week-over-Week Comparison</Typography>
              {!comparison?.this_week ? (
                <Typography variant="body2" color="text.disabled">Not enough data — run speed tests for at least 2 weeks.</Typography>
              ) : (
                <Grid container spacing={3}>
                  {[
                    { label: 'Avg Download', thisVal: comparison.this_week?.avg_download, lastVal: comparison.last_week?.avg_download, unit: 'Mbps', pct: comparison.delta?.download_pct },
                    { label: 'Avg Upload',   thisVal: comparison.this_week?.avg_upload,   lastVal: comparison.last_week?.avg_upload,   unit: 'Mbps', pct: comparison.delta?.upload_pct },
                    { label: 'Avg Ping',     thisVal: comparison.this_week?.avg_ping,     lastVal: comparison.last_week?.avg_ping,     unit: 'ms',   pct: comparison.delta?.ping_pct, invertGood: true },
                    { label: 'Uptime',       thisVal: comparison.this_week?.uptime_pct,   lastVal: comparison.last_week?.uptime_pct,   unit: '%',    pct: comparison.delta?.download_pct },
                  ].map(({ label, thisVal, lastVal, unit, pct, invertGood }) => (
                    <Grid size={{ xs: 6, md: 3 }} key={label}>
                      <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: '1px solid rgba(240,194,75,0.12)' }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
                        <Typography variant="h5" fontWeight={900} sx={{ color: '#f0c24b', my: 0.5 }}>
                          {thisVal != null ? thisVal : '—'}<Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.4 }}>{unit}</Typography>
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Typography variant="caption" color="text.disabled">vs {lastVal != null ? `${lastVal} ${unit}` : '—'}</Typography>
                          <DeltaChip pct={pct} label="" invertGood={invertGood} />
                        </Box>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Paper>
          </motion.div>

          {/* ── ISP SLA Comparison ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Paper sx={{ mb: 3, p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SpeedIcon sx={{ color: '#f0c24b', fontSize: 20 }} />
                <Typography variant="h6" fontWeight={700}>ISP SLA Compliance</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <TextField
                  label="Your contracted speed (Mbps)"
                  value={slaTarget}
                  onChange={(e) => saveSla(e.target.value)}
                  type="number"
                  size="small"
                  InputProps={{ inputProps: { min: 1, max: 10000 } }}
                  sx={{ width: 220 }}
                  helperText="Check your ISP plan or contract"
                />
                {slaHitPct != null && (
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" fontWeight={700}>
                        Receiving {slaHitPct}% of contracted speed
                      </Typography>
                      <Chip
                        label={slaHitPct >= 80 ? '✓ SLA Met' : slaHitPct >= 50 ? '⚠ Partial' : '✗ Below SLA'}
                        size="small"
                        sx={{
                          bgcolor: slaHitPct >= 80 ? 'rgba(67,160,71,0.15)' : slaHitPct >= 50 ? 'rgba(255,167,38,0.15)' : 'rgba(239,83,80,0.15)',
                          color:   slaHitPct >= 80 ? '#43A047' : slaHitPct >= 50 ? '#FFA726' : '#EF5350',
                          fontWeight: 700,
                        }}
                      />
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(slaHitPct, 100)}
                      sx={{
                        height: 10, borderRadius: 5,
                        bgcolor: 'rgba(255,255,255,0.06)',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: slaHitPct >= 80 ? '#43A047' : slaHitPct >= 50 ? '#FFA726' : '#EF5350',
                          borderRadius: 5,
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                      Avg this week: {thisWeekDl} Mbps vs contracted: {contractedMbps} Mbps
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          </motion.div>

          {/* ── Congestion Heatmap ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Paper sx={{ mb: 3, p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>Congestion Heatmap</Typography>
                  <Typography variant="caption" color="text.secondary">Average speed by day of week × hour of day</Typography>
                </Box>
                <ToggleButtonGroup value={heatDays} exclusive size="small" onChange={(_, v) => v && setHeatDays(v)}>
                  {[7, 14, 28, 56].map((d) => (
                    <ToggleButton key={d} value={d} sx={{ px: 1.5, fontSize: 11, fontWeight: 700 }}>{d}d</ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
              {heatmap ? <CongestionHeatmap data={heatmap} /> : (
                <Typography variant="body2" color="text.disabled">No data available — run speed tests over multiple days.</Typography>
              )}
            </Paper>
          </motion.div>

          {/* ── Anomaly Detection ──────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Paper sx={{ mb: 3, p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>Anomaly Detection</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Measurements {'>'}2σ from mean — {anomalies?.mean_mbps != null ? `baseline ${anomalies.mean_mbps} ± ${anomalies.std_mbps} Mbps` : ''}
                  </Typography>
                </Box>
                <ToggleButtonGroup value={anomHours} exclusive size="small" onChange={(_, v) => v && setAnomHours(v)}>
                  {[24, 72, 168, 336].map((h) => (
                    <ToggleButton key={h} value={h} sx={{ px: 1.5, fontSize: 11, fontWeight: 700 }}>{h}h</ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
              {!anomalies?.anomalies?.length ? (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 40, color: '#43A047', mb: 1 }} />
                  <Typography color="text.secondary">{anomalies?.message || 'No anomalies detected — connection is stable'}</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {anomalies.anomalies.map((a) => (
                    <Box key={a.id} sx={{
                      display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1, borderRadius: 2,
                      bgcolor: a.type === 'drop' ? 'rgba(239,83,80,0.07)' : 'rgba(67,160,71,0.07)',
                      border: `1px solid ${a.type === 'drop' ? 'rgba(239,83,80,0.2)' : 'rgba(67,160,71,0.2)'}`,
                      flexWrap: 'wrap',
                    }}>
                      {a.type === 'drop'
                        ? <ErrorOutlineIcon sx={{ color: '#EF5350', fontSize: 18, flexShrink: 0 }} />
                        : <TrendingUpIcon   sx={{ color: '#43A047', fontSize: 18, flexShrink: 0 }} />}
                      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>
                        {new Date(a.timestamp + 'Z').toLocaleString()}
                      </Typography>
                      <Typography variant="body2" fontWeight={700}>{a.download_speed} Mbps ↓</Typography>
                      <Chip label={`z=${a.z_score}`} size="small"
                        sx={{ bgcolor: a.type === 'drop' ? 'rgba(239,83,80,0.12)' : 'rgba(67,160,71,0.12)',
                              color: a.type === 'drop' ? '#EF5350' : '#43A047', fontWeight: 700, fontSize: 10 }} />
                      {a.is_outage && <Chip label="outage" size="small" sx={{ bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350', fontSize: 9 }} />}
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </motion.div>

          {/* ── Multi-Region Latency ──────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Paper sx={{ mb: 3, p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <PublicIcon sx={{ color: '#f0c24b', fontSize: 20 }} />
                <Box>
                  <Typography variant="h6" fontWeight={700}>Multi-Region Latency</Typography>
                  <Typography variant="caption" color="text.secondary">Measured from the Fly.io server — helps distinguish local vs global issues</Typography>
                </Box>
              </Box>
              {!multiRegion ? (
                <Typography variant="body2" color="text.disabled">Loading…</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {multiRegion.regions.map((r) => (
                    <Box key={r.name} sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Box sx={{ minWidth: 200, display: 'flex', alignItems: 'center', gap: 1 }}>
                        {r.reachable
                          ? <CheckCircleOutlineIcon sx={{ fontSize: 15, color: '#43A047' }} />
                          : <ErrorOutlineIcon      sx={{ fontSize: 15, color: '#EF5350' }} />}
                        <Typography variant="body2" fontWeight={600}>{r.name}</Typography>
                      </Box>
                      {r.reachable ? (
                        <>
                          <Box sx={{ flex: 1, minWidth: 120 }}>
                            <LinearProgress variant="determinate"
                              value={Math.min((r.latency_ms / 1000) * 100, 100)}
                              sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.06)',
                                '& .MuiLinearProgress-bar': { bgcolor: r.latency_ms < 200 ? '#43A047' : r.latency_ms < 500 ? '#FFA726' : '#EF5350', borderRadius: 3 } }} />
                          </Box>
                          <Typography variant="caption" fontWeight={700} sx={{ minWidth: 60, textAlign: 'right',
                            color: r.latency_ms < 200 ? '#43A047' : r.latency_ms < 500 ? '#FFA726' : '#EF5350' }}>
                            {r.latency_ms} ms
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="caption" color="error.main">Unreachable</Typography>
                      )}
                    </Box>
                  ))}
                  {multiRegion.avg_latency_ms != null && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      Avg: {multiRegion.avg_latency_ms} ms · {multiRegion.reachable_count}/{multiRegion.total} reachable
                    </Typography>
                  )}
                </Box>
              )}
            </Paper>
          </motion.div>

          {/* ── Traceroute ─────────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Paper sx={{ mb: 3, p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <RouteIcon sx={{ color: '#f0c24b', fontSize: 20 }} />
                <Box>
                  <Typography variant="h6" fontWeight={700}>Traceroute</Typography>
                  <Typography variant="caption" color="text.secondary">Run from server — shows each network hop to destination</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                  label="Target host or IP"
                  value={traceHost}
                  onChange={(e) => setTraceHost(e.target.value)}
                  size="small"
                  sx={{ width: 200 }}
                  placeholder="8.8.8.8"
                />
                <Button variant="contained" size="small" onClick={runTrace} disabled={traceLoading}
                  startIcon={traceLoading ? <CircularProgress size={14} /> : <RouteIcon />}
                  sx={{ background: 'linear-gradient(135deg, #f6d978, #f0c24b)', color: '#000', fontWeight: 700 }}>
                  {traceLoading ? 'Running…' : 'Run'}
                </Button>
              </Box>
              {traceroute?.error && <Alert severity="warning">{traceroute.error}</Alert>}
              {traceroute?.hops?.length > 0 && (
                <Box sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: isDark ? '#0d0d0d' : '#f5f5f5',
                           borderRadius: 2, p: 2, maxHeight: 300, overflowY: 'auto',
                           border: '1px solid rgba(240,194,75,0.12)' }}>
                  {traceroute.hops.map((line, i) => (
                    <Box key={i} sx={{ color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)', lineHeight: 1.7 }}>
                      {line}
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </motion.div>
        </>
      )}

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={4000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        action={<IconButton size="small" onClick={() => setSnackMsg('')}><ContentCopyIcon fontSize="small" /></IconButton>}
      />
    </Box>
  );
}
