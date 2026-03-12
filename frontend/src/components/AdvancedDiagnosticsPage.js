import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, Alert, Chip,
  Card, CardContent, LinearProgress, Tabs, Tab, TextField,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem,
  ListItemText, ListItemIcon, Divider, Stack, useTheme, Tooltip,
} from '@mui/material';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import SpeedIcon from '@mui/icons-material/Speed';
import RouterIcon from '@mui/icons-material/Router';
import DnsIcon from '@mui/icons-material/Dns';
import VpnLockIcon from '@mui/icons-material/VpnLock';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdvancedDiagnostics, getPacketLoss, getJitter,
  getBufferbloat, getMTU, getDNSLeak, getVPNSpeedComparison,
} from '../services/api';

const GOLD = '#f0c24b';

function PageHeader({ loading, onRunAll }) {
  return (
    <Paper sx={{
      mb: 3, p: { xs: 2.5, md: 3.5 },
      background: 'linear-gradient(135deg, #000 0%, #0a0800 55%, #111000 100%)',
      border: `1px solid rgba(240,194,75,0.35)`,
      boxShadow: '0 8px 48px rgba(240,194,75,0.10)',
    }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <NetworkCheckIcon sx={{ color: GOLD, fontSize: 28 }} />
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>
              Advanced Network Diagnostics
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              Packet loss · Jitter · Bufferbloat · MTU · DNS leak · VPN speed
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          onClick={onRunAll}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} sx={{ color: 'rgba(0,0,0,0.5)' }} /> : <RefreshIcon />}
          sx={{
            background: loading ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg, #f6d978, ${GOLD})`,
            color: loading ? 'rgba(255,255,255,0.5)' : '#000',
            fontWeight: 800, px: 2.5, borderRadius: 2,
            '&:disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
          }}
        >
          {loading ? 'Running…' : 'Run All Tests'}
        </Button>
      </Stack>
    </Paper>
  );
}

function MetricCard({ label, value, unit, color = 'primary', subtitle, chip }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Card sx={{ background: isDark ? '#080808' : '#fff', border: `1px solid rgba(240,194,75,0.12)`, height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
          {label}
        </Typography>
        <Typography variant="h3" fontWeight={900} sx={{ color, mt: 0.5, lineHeight: 1 }}>
          {value ?? '—'}
        </Typography>
        {unit && <Typography variant="caption" color="text.secondary">{unit}</Typography>}
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
        {chip && <Box sx={{ mt: 1 }}>{chip}</Box>}
      </CardContent>
    </Card>
  );
}

function RunButton({ loading, onClick, label = 'Run Test' }) {
  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={loading ? <CircularProgress size={14} /> : <PlayArrowIcon />}
      onClick={onClick}
      disabled={loading}
      sx={{
        borderColor: `rgba(240,194,75,0.4)`, color: GOLD,
        '&:hover': { borderColor: GOLD, bgcolor: 'rgba(240,194,75,0.08)' },
      }}
    >
      {label}
    </Button>
  );
}

function TabHeader({ icon: Icon, title, loading, onRun }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Icon sx={{ color: GOLD, fontSize: 22 }} />
        <Typography variant="h6" fontWeight={700}>{title}</Typography>
      </Stack>
      <RunButton loading={loading} onClick={onRun} />
    </Stack>
  );
}

// ── Packet Loss Tab ────────────────────────────────────────────────────────────
function PacketLossTab({ data, loading, onRun }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const loss = data?.packet_loss_percent ?? null;
  const severity = loss === null ? null : loss === 0 ? 'success' : loss <= 2 ? 'info' : loss <= 5 ? 'warning' : 'error';
  const qualityLabel = loss === null ? null : loss === 0 ? 'Excellent — No packet loss' : loss <= 2 ? 'Good — Minimal loss' : loss <= 5 ? 'Fair — Affects gaming/VoIP' : 'Poor — Connection issues';

  return (
    <Box>
      <TabHeader icon={NetworkCheckIcon} title="Packet Loss Detection" loading={loading} onRun={onRun} />
      {data?.error && <Alert severity="error" sx={{ mb: 2 }}>{data.error}</Alert>}
      {data && !data.error && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box flex={1}>
              <MetricCard
                label="Packet Loss"
                value={`${loss}%`}
                color={loss > 5 ? '#EF5350' : loss > 0 ? '#FFA726' : '#43A047'}
                subtitle={`${data.packets_received}/${data.packets_sent} packets received`}
                chip={<Chip label={qualityLabel} size="small" color={severity} />}
              />
            </Box>
            <Box flex={1}>
              <MetricCard
                label="Avg Latency"
                value={data.avg_latency_ms?.toFixed(1) ?? 'N/A'}
                unit="ms"
                color={GOLD}
                subtitle={`Host: ${data.host}`}
              />
            </Box>
          </Stack>
          <Alert severity={severity}>
            <Typography variant="body2">{qualityLabel}</Typography>
          </Alert>
        </Stack>
      )}
      {!data && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
          <NetworkCheckIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Click "Run Test" to measure packet loss</Typography>
        </Paper>
      )}
    </Box>
  );
}

// ── Jitter Tab ─────────────────────────────────────────────────────────────────
function JitterTab({ data, loading, onRun }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const jitter = data?.jitter_ms;
  const LEVELS = [
    { range: '< 5ms', label: 'Excellent — competitive gaming & pro VoIP', check: jitter != null && jitter < 5 },
    { range: '5–15ms', label: 'Good — casual gaming & video calls', check: jitter != null && jitter >= 5 && jitter < 15 },
    { range: '15–30ms', label: 'Fair — occasional lag in fast-paced games', check: jitter != null && jitter >= 15 && jitter < 30 },
    { range: '> 30ms', label: 'Poor — not recommended for real-time apps', check: jitter != null && jitter >= 30 },
  ];

  return (
    <Box>
      <TabHeader icon={SpeedIcon} title="Jitter Measurement (Gaming / VoIP)" loading={loading} onRun={onRun} />
      {data?.error && <Alert severity="error" sx={{ mb: 2 }}>{data.error}</Alert>}
      {data && !data.error && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {[
              { label: 'Avg Jitter', value: data.jitter_ms?.toFixed(1), unit: 'ms', chip: <Chip label={data.quality} size="small" /> },
              { label: 'Min Jitter', value: data.min_jitter_ms?.toFixed(1), unit: 'ms' },
              { label: 'Max Jitter', value: data.max_jitter_ms?.toFixed(1), unit: 'ms' },
              { label: 'Std Deviation', value: data.jitter_stdev_ms?.toFixed(1), unit: 'ms' },
            ].map((m) => (
              <Box key={m.label} flex={1}>
                <MetricCard label={m.label} value={m.value} unit={m.unit} color={GOLD} chip={m.chip} />
              </Box>
            ))}
          </Stack>
          <Paper sx={{ p: 2.5, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Quality Levels</Typography>
            <List dense disablePadding>
              {LEVELS.map((lv, i) => (
                <ListItem key={i} disablePadding sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {lv.check
                      ? <CheckCircleIcon sx={{ fontSize: 18, color: '#43A047' }} />
                      : <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.1)' }} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={<Typography variant="body2" fontWeight={700}>{lv.range}</Typography>}
                    secondary={lv.label}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Stack>
      )}
      {!data && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
          <SpeedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Click "Run Test" to measure jitter</Typography>
        </Paper>
      )}
    </Box>
  );
}

// ── Bufferbloat Tab ────────────────────────────────────────────────────────────
function BufferbloatTab({ data, loading, onRun }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const GRADE_COLOR = { A: '#43A047', B: '#66BB6A', C: '#FFA726', D: '#EF5350', F: '#B71C1C' };

  return (
    <Box>
      <TabHeader icon={RouterIcon} title="Bufferbloat Test (Router Congestion)" loading={loading} onRun={onRun} />
      {data?.error && <Alert severity="error" sx={{ mb: 2 }}>{data.error}</Alert>}
      {data && !data.error && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box flex={1}>
              <MetricCard label="Idle Latency" value={data.idle_latency_ms?.toFixed(1)} unit="ms (no load)" color="#43A047" />
            </Box>
            <Box flex={1}>
              <MetricCard label="Loaded Latency" value={data.loaded_latency_ms?.toFixed(1)} unit="ms (under load)" color="#FFA726" />
            </Box>
            <Box flex={1}>
              <MetricCard
                label="Bufferbloat"
                value={data.bufferbloat_ms?.toFixed(1)}
                unit="ms extra latency"
                color={GRADE_COLOR[data.grade] || '#f0c24b'}
                chip={
                  <Chip
                    label={`Grade: ${data.grade}`}
                    size="small"
                    sx={{ bgcolor: `${GRADE_COLOR[data.grade]}22`, color: GRADE_COLOR[data.grade], fontWeight: 700 }}
                  />
                }
              />
            </Box>
          </Stack>
          <Paper sx={{ p: 2.5, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Bufferbloat Scale</Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min((data.bufferbloat_ms / 300) * 100, 100)}
              sx={{
                height: 12, borderRadius: 6, mb: 1,
                bgcolor: 'rgba(255,255,255,0.06)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: GRADE_COLOR[data.grade] || GOLD,
                  borderRadius: 6,
                },
              }}
            />
            <Stack direction="row" justifyContent="space-between">
              {['0ms (A)', '50ms (B)', '100ms (C)', '200ms (D)', '300ms+ (F)'].map((l) => (
                <Typography key={l} variant="caption" color="text.disabled">{l}</Typography>
              ))}
            </Stack>
            <Alert severity={['A', 'B'].includes(data.grade) ? 'success' : data.grade === 'C' ? 'warning' : 'error'} sx={{ mt: 2 }}>
              <Typography variant="body2"><strong>Recommendation:</strong> {data.recommendation}</Typography>
            </Alert>
          </Paper>
        </Stack>
      )}
      {!data && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
          <RouterIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Click "Run Test" to check for bufferbloat</Typography>
        </Paper>
      )}
    </Box>
  );
}

// ── MTU Tab ────────────────────────────────────────────────────────────────────
function MTUTab({ data, loading, onRun }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box>
      <TabHeader icon={SettingsIcon} title="MTU Discovery (Optimal Packet Size)" loading={loading} onRun={onRun} />
      {data?.error && <Alert severity="error" sx={{ mb: 2 }}>{data.error}</Alert>}
      {data && !data.error && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box flex={1}>
              <MetricCard
                label="Optimal MTU"
                value={data.optimal_mtu ?? 'N/A'}
                unit="bytes"
                color={GOLD}
              />
            </Box>
            <Box flex={1}>
              <MetricCard
                label="Standard MTU"
                value={data.standard_mtu}
                unit="bytes (default)"
                color="text.primary"
              />
            </Box>
          </Stack>
          <Alert severity={data.needs_adjustment ? 'warning' : 'success'}>
            <Typography variant="body2">
              <strong>Status:</strong> {data.needs_adjustment ? '⚠️ Adjustment Recommended' : '✅ Optimal Configuration'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              <strong>Recommendation:</strong> {data.recommendation}
            </Typography>
          </Alert>
          <Accordion sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" gap={1} alignItems="center">
                <InfoOutlinedIcon sx={{ fontSize: 16, color: GOLD }} />
                <Typography variant="subtitle2" fontWeight={700}>What is MTU?</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" paragraph>
                MTU (Maximum Transmission Unit) is the largest packet size that can be transmitted without fragmentation.
                Standard Ethernet MTU is 1500 bytes. PPPoE/VPN connections often need lower values.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Impact:</strong> Incorrect MTU causes packet fragmentation, leading to slower speeds and connection issues.
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
      {!data && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
          <SettingsIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Click "Run Test" to discover optimal MTU</Typography>
        </Paper>
      )}
    </Box>
  );
}

// ── DNS Leak Tab ───────────────────────────────────────────────────────────────
function DNSLeakTab({ data, loading, onRun }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box>
      <TabHeader icon={DnsIcon} title="DNS Leak Test (Privacy Check)" loading={loading} onRun={onRun} />
      {data?.error && <Alert severity="error" sx={{ mb: 2 }}>{data.error}</Alert>}
      {data && !data.error && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box flex={1}>
              <MetricCard
                label="Privacy Score"
                value={data.privacy_score}
                color={data.dns_leaked ? '#EF5350' : '#43A047'}
                chip={
                  <Chip
                    label={data.dns_leaked ? 'DNS LEAKED' : 'SECURE'}
                    size="small"
                    icon={data.dns_leaked ? <ErrorIcon style={{ fontSize: 14 }} /> : <CheckCircleIcon style={{ fontSize: 14 }} />}
                    sx={{
                      bgcolor: data.dns_leaked ? 'rgba(239,83,80,0.15)' : 'rgba(67,160,71,0.15)',
                      color: data.dns_leaked ? '#EF5350' : '#43A047',
                      fontWeight: 700,
                    }}
                  />
                }
              />
            </Box>
            <Box flex={1}>
              <Card sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.12)', height: '100%' }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                    Location Match
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Your Country: <strong>{data.your_country}</strong>
                    </Typography>
                    <Typography variant="body2">
                      DNS Country: <strong>{data.dns_server_country}</strong>
                    </Typography>
                    {data.dns_server_isp && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        DNS ISP: {data.dns_server_isp}
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Stack>
          <Alert severity={data.dns_leaked ? 'error' : 'success'}>
            <Typography variant="body2">
              <strong>Status:</strong> {data.dns_leaked ? '❌ DNS Leak Detected' : '✅ No DNS Leak'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              <strong>Recommendation:</strong> {data.recommendation}
            </Typography>
          </Alert>
          <Accordion sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" gap={1} alignItems="center">
                <InfoOutlinedIcon sx={{ fontSize: 16, color: GOLD }} />
                <Typography variant="subtitle2" fontWeight={700}>What is a DNS Leak?</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                A DNS leak occurs when your DNS queries are sent to your ISP's servers instead of your VPN's DNS servers,
                potentially exposing your browsing activity even when using a VPN. Fix it by using DNS over HTTPS (DoH)
                or enabling DNS leak protection in your VPN client.
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
      {!data && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
          <DnsIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Click "Run Test" to check for DNS leaks</Typography>
        </Paper>
      )}
    </Box>
  );
}

// ── VPN Speed Tab ──────────────────────────────────────────────────────────────
function VPNSpeedTab({ data, loading, onRun }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [vpnInterface, setVpnInterface] = useState('');

  const lossPercent = data?.speed_loss_percent;
  const lossColor = lossPercent == null ? GOLD : lossPercent < 10 ? '#43A047' : lossPercent < 25 ? '#FFA726' : '#EF5350';

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <VpnLockIcon sx={{ color: GOLD, fontSize: 22 }} />
          <Typography variant="h6" fontWeight={700}>VPN Speed Comparison</Typography>
        </Stack>
        <RunButton loading={loading} onClick={() => onRun(vpnInterface || null)} />
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          This test measures your current connection speed as a <strong>baseline</strong>.
          For VPN overhead comparison, enter your VPN interface name (e.g. <code>tun0</code>, <code>wg0</code>) — or leave blank for baseline-only mode.
        </Typography>
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mb={3} alignItems="flex-end">
        <TextField
          label="VPN Interface (optional)"
          value={vpnInterface}
          onChange={(e) => setVpnInterface(e.target.value)}
          size="small"
          placeholder="tun0, wg0, ppp0…"
          sx={{ width: 220 }}
          helperText="Leave blank for baseline speed only"
        />
        <Stack direction="row" gap={0.5} flexWrap="wrap">
          {['tun0', 'wg0', 'ppp0'].map((iface) => (
            <Chip
              key={iface}
              label={iface}
              size="small"
              onClick={() => setVpnInterface(iface)}
              variant={vpnInterface === iface ? 'filled' : 'outlined'}
              sx={{ cursor: 'pointer', borderColor: 'rgba(240,194,75,0.3)', color: GOLD }}
            />
          ))}
        </Stack>
      </Stack>

      {data?.error && (
        <Alert severity="warning" sx={{ mb: 2 }}>{data.error}</Alert>
      )}

      {data && !data.error && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box flex={1}>
              <MetricCard
                label="Without VPN"
                value={`${data.without_vpn_mbps?.toFixed(1)}`}
                unit="Mbps (baseline)"
                color="#43A047"
              />
            </Box>
            {data.with_vpn_mbps != null && (
              <Box flex={1}>
                <MetricCard
                  label="With VPN"
                  value={`${data.with_vpn_mbps?.toFixed(1)}`}
                  unit="Mbps"
                  color="#42A5F5"
                />
              </Box>
            )}
            {data.speed_loss_percent != null && (
              <Box flex={1}>
                <MetricCard
                  label="Speed Overhead"
                  value={`${data.speed_loss_percent?.toFixed(1)}%`}
                  unit="speed reduction"
                  color={lossColor}
                  subtitle={`${data.vpn_overhead_mbps?.toFixed(1)} Mbps lost`}
                />
              </Box>
            )}
          </Stack>

          {data.speed_loss_percent != null && (
            <Paper sx={{ p: 2.5, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>VPN Overhead</Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(data.speed_loss_percent, 100)}
                sx={{
                  height: 12, borderRadius: 6, mb: 1,
                  bgcolor: 'rgba(255,255,255,0.06)',
                  '& .MuiLinearProgress-bar': { bgcolor: lossColor, borderRadius: 6 },
                }}
              />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.disabled">0% (No overhead)</Typography>
                <Typography variant="caption" color="text.disabled">50%+</Typography>
              </Stack>
            </Paper>
          )}

          <Alert severity={lossPercent == null ? 'info' : lossPercent < 10 ? 'success' : lossPercent < 25 ? 'warning' : 'error'}>
            <Typography variant="body2">
              <strong>Recommendation:</strong> {data.recommendation}
            </Typography>
          </Alert>
        </Stack>
      )}

      {!data && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
          <VpnLockIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary" gutterBottom>Click "Run Test" to measure VPN speed impact</Typography>
          <Typography variant="caption" color="text.disabled">
            Optionally enter your VPN interface name for a full comparison
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

// ── Settings Tab ───────────────────────────────────────────────────────────────
function SettingsTab({ testHost, setTestHost }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const PRESETS = ['8.8.8.8', '1.1.1.1', '208.67.222.222', 'google.com'];

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Test Configuration</Typography>
      <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.1)' }}>
        <TextField
          label="Test Host"
          value={testHost}
          onChange={(e) => setTestHost(e.target.value)}
          fullWidth
          helperText="IP address or hostname used for packet loss, jitter, and MTU tests"
          sx={{ mb: 2 }}
        />
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>Quick presets:</Typography>
        <Stack direction="row" gap={1} flexWrap="wrap">
          {PRESETS.map((h) => (
            <Chip
              key={h}
              label={h}
              onClick={() => setTestHost(h)}
              variant={testHost === h ? 'filled' : 'outlined'}
              color="primary"
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
const TABS = [
  { label: 'Packet Loss', Icon: NetworkCheckIcon },
  { label: 'Jitter',      Icon: SpeedIcon },
  { label: 'Bufferbloat', Icon: RouterIcon },
  { label: 'MTU',         Icon: SettingsIcon },
  { label: 'DNS Leak',    Icon: DnsIcon },
  { label: 'VPN Speed',   Icon: VpnLockIcon },
  { label: 'Settings',    Icon: SettingsIcon },
];

export default function AdvancedDiagnosticsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeTab, setActiveTab]       = useState(0);
  const [loading, setLoading]           = useState(false);
  const [packetLossData, setPacketLoss] = useState(null);
  const [jitterData, setJitter]         = useState(null);
  const [bufferbloatData, setBloat]     = useState(null);
  const [mtuData, setMtu]               = useState(null);
  const [dnsLeakData, setDns]           = useState(null);
  const [vpnData, setVpn]               = useState(null);
  const [error, setError]               = useState(null);
  const [testHost, setTestHost]         = useState('8.8.8.8');

  const runAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdvancedDiagnostics();
      const d = res.data;
      if (d.packet_loss)  setPacketLoss(d.packet_loss);
      if (d.jitter)       setJitter(d.jitter);
      if (d.bufferbloat)  setBloat(d.bufferbloat);
      if (d.mtu)          setMtu(d.mtu);
      if (d.dns_leak)     setDns(d.dns_leak);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to run diagnostics');
    } finally {
      setLoading(false);
    }
  };

  const runSingle = async (type, arg) => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (type === 'packet_loss') { res = await getPacketLoss(testHost, 20); setPacketLoss(res.data); }
      else if (type === 'jitter') { res = await getJitter(testHost, 30);     setJitter(res.data); }
      else if (type === 'bufferbloat') { res = await getBufferbloat();        setBloat(res.data); }
      else if (type === 'mtu')    { res = await getMTU(testHost);             setMtu(res.data); }
      else if (type === 'dns')    { res = await getDNSLeak();                 setDns(res.data); }
      else if (type === 'vpn')    { res = await getVPNSpeedComparison(arg);   setVpn(res.data); }
    } catch (e) {
      setError(e?.response?.data?.detail || `Test failed`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1100, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader loading={loading} onRunAll={runAll} />
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar */}
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
        {activeTab === 0 && <PacketLossTab  data={packetLossData}  loading={loading} onRun={() => runSingle('packet_loss')} />}
        {activeTab === 1 && <JitterTab      data={jitterData}      loading={loading} onRun={() => runSingle('jitter')} />}
        {activeTab === 2 && <BufferbloatTab data={bufferbloatData} loading={loading} onRun={() => runSingle('bufferbloat')} />}
        {activeTab === 3 && <MTUTab         data={mtuData}         loading={loading} onRun={() => runSingle('mtu')} />}
        {activeTab === 4 && <DNSLeakTab     data={dnsLeakData}     loading={loading} onRun={() => runSingle('dns')} />}
        {activeTab === 5 && <VPNSpeedTab    data={vpnData}         loading={loading} onRun={(iface) => runSingle('vpn', iface)} />}
        {activeTab === 6 && <SettingsTab    testHost={testHost}    setTestHost={setTestHost} />}
      </motion.div>
    </Box>
  );
}
