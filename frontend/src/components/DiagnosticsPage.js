import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, Typography, Paper, Button, CircularProgress, Chip,
  Grid, LinearProgress, useTheme, Alert, Skeleton,
} from '@mui/material';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SpeedIcon from '@mui/icons-material/Speed';
import DnsIcon from '@mui/icons-material/Dns';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RouterIcon from '@mui/icons-material/Router';
import PublicIcon from '@mui/icons-material/Public';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BusinessIcon from '@mui/icons-material/Business';
import { getDiagnostics, getMyConnection } from '../services/api';
import axios from 'axios';

const CONNECTIVITY_CONFIG = {
  full:    { label: 'Full Connectivity',    color: '#43A047', bg: 'rgba(67,160,71,0.12)',  border: 'rgba(67,160,71,0.3)',  Icon: CheckCircleOutlineIcon },
  partial: { label: 'Partial Connectivity', color: '#FFA726', bg: 'rgba(255,167,38,0.12)', border: 'rgba(255,167,38,0.3)', Icon: NetworkCheckIcon },
  none:    { label: 'No Connectivity',      color: '#EF5350', bg: 'rgba(239,83,80,0.12)',  border: 'rgba(239,83,80,0.3)',  Icon: ErrorOutlineIcon },
};

function LatencyBar({ ms, max = 500 }) {
  if (ms == null) return <Typography variant="caption" color="text.disabled">Timeout</Typography>;
  const pct = Math.min((ms / max) * 100, 100);
  const color = ms < 100 ? '#43A047' : ms < 250 ? '#FFA726' : '#EF5350';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress variant="determinate" value={pct}
        sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: 4 } }} />
      <Typography variant="caption" fontWeight={800} sx={{ color, minWidth: 55, textAlign: 'right' }}>
        {ms} ms
      </Typography>
    </Box>
  );
}

function InfoRow({ icon: Icon, label, value, mono = false }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75 }}>
      <Icon sx={{ fontSize: 17, color: 'text.secondary', flexShrink: 0 }} />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={700} sx={{ fontFamily: mono ? 'monospace' : undefined, letterSpacing: mono ? '0.04em' : undefined }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

export default function DiagnosticsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connInfo, setConnInfo] = useState(null);
  const [connLoading, setConnLoading] = useState(true);

  // Auto-load connection info on mount
  // Call ip-api.com directly from the browser so the real public IP is detected
  // (not the backend server's IP), then merge in last speed-test from DB.
  useEffect(() => {
    setConnLoading(true);
    Promise.all([
      axios.get('http://ip-api.com/json/', {
        params: { fields: 'status,country,countryCode,regionName,city,isp,org,as,query' },
      }).catch(() => ({ data: {} })),
      getMyConnection().catch(() => ({ data: {} })),
    ]).then(([geoRes, dbRes]) => {
      const geo = geoRes.data || {};
      const db  = dbRes.data  || {};
      setConnInfo({
        public_ip:           geo.query      || db.public_ip  || null,
        isp:                 geo.isp        || db.isp        || null,
        org:                 geo.org        || db.org        || null,
        asn:                 geo.as         || db.asn        || null,
        country:             geo.country    || db.country    || null,
        country_code:        geo.countryCode|| db.country_code|| null,
        region:              geo.regionName || db.region     || null,
        city:                geo.city       || db.city       || null,
        last_measured_isp:   db.last_measured_isp  || null,
        last_download_mbps:  db.last_download_mbps || null,
        last_upload_mbps:    db.last_upload_mbps   || null,
        last_ping_ms:        db.last_ping_ms        || null,
        last_test_at:        db.last_test_at        || null,
      });
    }).finally(() => setConnLoading(false));
  }, []);

  const runDiagnostics = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await getDiagnostics();
      setResult(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Diagnostics failed');
    } finally {
      setLoading(false);
    }
  };

  const statusCfg = result ? CONNECTIVITY_CONFIG[result.connectivity] ?? CONNECTIVITY_CONFIG.full : null;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 900, mx: 'auto' }}>
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
              <NetworkCheckIcon sx={{ color: '#f0c24b', fontSize: 28 }} />
              <Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>Network Diagnostics</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  Your IP · ISP info · DNS resolution · HTTP latency
                </Typography>
              </Box>
            </Box>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="contained"
                size="large"
                onClick={runDiagnostics}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} sx={{ color: 'rgba(255,255,255,0.8)' }} /> : <PlayArrowIcon />}
                sx={{
                  background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #f6d978 0%, #f0c24b 100%)',
                  color: loading ? 'rgba(255,255,255,0.6)' : '#000',
                  fontWeight: 800, px: 3, py: 1.25, borderRadius: 3,
                  boxShadow: loading ? 'none' : '0 8px 24px rgba(240,194,75,0.3)',
                  '&:disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
                }}
              >
                {loading ? 'Running…' : 'Run Diagnostics'}
              </Button>
            </motion.div>
          </Box>
        </Paper>
      </motion.div>

      {/* My Connection Panel — always visible */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Paper sx={{ mb: 3, p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.22)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <RouterIcon sx={{ fontSize: 20, color: '#f0c24b' }} />
            <Typography variant="h6" fontWeight={700}>My Connection</Typography>
            {connLoading && <CircularProgress size={14} sx={{ color: '#f0c24b', ml: 'auto' }} />}
          </Box>

          {connLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="text" height={28} sx={{ borderRadius: 1 }} />)}
            </Box>
          ) : connInfo ? (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <InfoRow icon={PublicIcon}     label="Public IP"  value={connInfo.public_ip} mono />
                <InfoRow icon={BusinessIcon}   label="ISP"        value={connInfo.isp} />
                <InfoRow icon={BusinessIcon}   label="Org / ASN"  value={connInfo.asn} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <InfoRow icon={LocationOnIcon} label="Country"    value={connInfo.country ? `${connInfo.country} (${connInfo.country_code})` : null} />
                <InfoRow icon={LocationOnIcon} label="Region"     value={connInfo.region} />
                <InfoRow icon={LocationOnIcon} label="City"       value={connInfo.city} />
              </Grid>

              {/* Last speed test row */}
              {connInfo.last_download_mbps != null && (
                <Grid size={{ xs: 12 }}>
                  <Box sx={{ mt: 0.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Last speed test via {connInfo.last_measured_isp}:</Typography>
                    {[
                      { label: `↓ ${connInfo.last_download_mbps} Mbps`, color: '#43A047' },
                      { label: `↑ ${connInfo.last_upload_mbps} Mbps`,   color: '#42A5F5' },
                      { label: `${connInfo.last_ping_ms} ms ping`,       color: '#f0c24b' },
                    ].map(({ label, color }) => (
                      <Chip key={label} label={label} size="small"
                        sx={{ fontWeight: 800, fontSize: 11, bgcolor: `${color}14`, color, border: `1px solid ${color}30` }} />
                    ))}
                    <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                      {new Date(connInfo.last_test_at).toLocaleString()}
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          ) : (
            <Typography variant="body2" color="text.disabled">Could not detect connection info.</Typography>
          )}
        </Paper>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
            <CircularProgress sx={{ color: '#f0c24b', mb: 2 }} />
            <Typography fontWeight={600} color="text.secondary">Running diagnostics…</Typography>
            <Typography variant="caption" color="text.disabled">Testing DNS resolution and HTTP latency to 4 servers</Typography>
          </Paper>
        </motion.div>
      )}

      {!loading && result && statusCfg && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Overall status */}
          <Paper sx={{ mb: 3, p: 3, bgcolor: statusCfg.bg, border: `2px solid ${statusCfg.border}`, borderRadius: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <statusCfg.Icon sx={{ fontSize: 36, color: statusCfg.color }} />
                <Box>
                  <Typography variant="h6" fontWeight={900} sx={{ color: statusCfg.color }}>{statusCfg.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {result.reachable}/{result.total_targets} servers reachable
                    {result.avg_latency_ms != null && ` · avg ${result.avg_latency_ms} ms`}
                  </Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Checked: {new Date(result.checked_at).toLocaleTimeString()}
              </Typography>
            </Box>
          </Paper>

          {/* Per-target results */}
          <Grid container spacing={2}>
            {result.targets.map((t, i) => (
              <Grid size={{ xs: 12, sm: 6 }} key={t.name}>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Paper sx={{
                    p: 2.5, height: '100%',
                    background: isDark ? '#080808' : '#fff',
                    border: `1px solid ${t.reachable ? 'rgba(67,160,71,0.2)' : 'rgba(239,83,80,0.2)'}`,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DnsIcon sx={{ fontSize: 18, color: t.reachable ? '#43A047' : '#EF5350' }} />
                        <Typography fontWeight={700} variant="subtitle2">{t.name}</Typography>
                      </Box>
                      <Chip
                        label={t.reachable ? 'Online' : 'Offline'}
                        size="small"
                        icon={t.reachable ? <CheckCircleOutlineIcon style={{ fontSize: 12 }} /> : <ErrorOutlineIcon style={{ fontSize: 12 }} />}
                        sx={{ fontWeight: 800, fontSize: 10,
                          bgcolor: t.reachable ? 'rgba(67,160,71,0.12)' : 'rgba(239,83,80,0.12)',
                          color: t.reachable ? '#43A047' : '#EF5350',
                        }}
                      />
                    </Box>

                    <Typography variant="caption" color="text.disabled" display="block" mb={1.5}>{t.host}</Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                          <DnsIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>DNS Resolution</Typography>
                        </Box>
                        <LatencyBar ms={t.dns_ms} max={200} />
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                          <SpeedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>HTTP Latency</Typography>
                          {t.status_code && <Chip label={t.status_code} size="small" sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: t.status_code < 400 ? 'rgba(67,160,71,0.12)' : 'rgba(239,83,80,0.12)', color: t.status_code < 400 ? '#43A047' : '#EF5350' }} />}
                        </Box>
                        <LatencyBar ms={t.http_ms} max={1000} />
                      </Box>
                    </Box>
                  </Paper>
                </motion.div>
              </Grid>
            ))}
          </Grid>

          {/* Summary */}
          <Paper sx={{ mt: 3, p: 2.5, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Latency Summary</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {[
                { label: 'DNS Avg',  value: result.targets.filter((t) => t.dns_ms).length > 0 ? `${Math.round(result.targets.filter((t) => t.dns_ms).reduce((a, t) => a + t.dns_ms, 0) / result.targets.filter((t) => t.dns_ms).length)} ms` : 'N/A', color: '#42A5F5' },
                { label: 'HTTP Avg', value: result.avg_latency_ms != null ? `${result.avg_latency_ms} ms` : 'N/A', color: '#f0c24b' },
                { label: 'Reachable', value: `${result.reachable}/${result.total_targets}`, color: result.reachable === result.total_targets ? '#43A047' : '#FFA726' },
              ].map(({ label, value, color }) => (
                <Box key={label} sx={{ px: 2, py: 1, borderRadius: 2, bgcolor: `${color}10`, border: `1px solid ${color}30`, textAlign: 'center', minWidth: 100 }}>
                  <Typography fontWeight={900} sx={{ color, fontSize: '1.25rem' }}>{value}</Typography>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </motion.div>
      )}

      {/* Initial state — show after conn info loads */}
      {!loading && !result && !error && !connLoading && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Paper sx={{ p: 5, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }}>
              <NetworkCheckIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
            </motion.div>
            <Typography variant="h6" fontWeight={700} color="text.secondary" gutterBottom>Ready to Diagnose</Typography>
            <Typography variant="body2" color="text.disabled" mb={2.5}>
              Click "Run Diagnostics" to test DNS resolution and HTTP latency to Google and Cloudflare.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['DNS Resolution', 'HTTP Latency', 'Connectivity Check'].map((item) => (
                <Chip key={item} label={item} sx={{ fontWeight: 600, bgcolor: 'rgba(240,194,75,0.08)', color: '#f0c24b', border: '1px solid rgba(240,194,75,0.2)' }} />
              ))}
            </Box>
          </Paper>
        </motion.div>
      )}
    </Box>
  );
}
