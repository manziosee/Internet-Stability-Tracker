import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, Chip, LinearProgress,
  Alert, AlertTitle, Divider, List, ListItem, ListItemIcon,
  ListItemText, Tooltip, IconButton, Collapse, Tab, Tabs,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import PublicIcon from '@mui/icons-material/Public';
import SpeedIcon from '@mui/icons-material/Speed';
import PeopleIcon from '@mui/icons-material/People';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HistoryIcon from '@mui/icons-material/History';
import { getInternetCrisis, getCrisisHistory, getCrisisCommunityImpact } from '../services/api';

// ── Severity config ──────────────────────────────────────────────────────────
const SEV = {
  outage:   { color: '#d32f2f', bg: '#ffebee', label: 'OUTAGE',   icon: <WifiOffIcon />,      chip: 'error'   },
  critical: { color: '#e64a19', bg: '#fbe9e7', label: 'CRITICAL', icon: <ErrorIcon />,        chip: 'error'   },
  major:    { color: '#f57c00', bg: '#fff3e0', label: 'MAJOR',    icon: <WarningAmberIcon />, chip: 'warning' },
  minor:    { color: '#f9a825', bg: '#fffde7', label: 'MINOR',    icon: <WarningAmberIcon />, chip: 'warning' },
  none:     { color: '#388e3c', bg: '#e8f5e9', label: 'NORMAL',   icon: <CheckCircleIcon />,  chip: 'success' },
  unknown:  { color: '#757575', bg: '#f5f5f5', label: 'UNKNOWN',  icon: <InfoIcon />,         chip: 'default' },
};
const sev = (s) => SEV[s] || SEV.unknown;

// ── Tips per severity ────────────────────────────────────────────────────────
const TIPS = {
  outage: [
    { icon: '📱', tip: "Switch to mobile data (4G/5G) as a temporary hotspot." },
    { icon: '🔄', tip: 'Reboot your router: unplug for 30 seconds, then plug back in.' },
    { icon: '📞', tip: "Call your ISP support line — report the outage and ask for an ETA." },
    { icon: '💾', tip: 'Work offline where possible: save documents locally, use cached apps.' },
    { icon: '🏢', tip: 'Check if nearby cafés or libraries have working WiFi.' },
    { icon: '⏰', tip: 'Log the outage start time for your SLA complaint.' },
  ],
  critical: [
    { icon: '🔌', tip: 'Check all cables — a loose ethernet or coax cable is a common cause.' },
    { icon: '🌡️', tip: 'Check if your router is overheating — ensure ventilation.' },
    { icon: '📶', tip: 'Try a wired connection to isolate the WiFi vs cable issue.' },
    { icon: '🔄', tip: 'Restart modem then router in sequence (modem first, wait 1 min).' },
  ],
  major: [
    { icon: '🕐', tip: 'Schedule large uploads/downloads for off-peak hours (11 PM – 6 AM).' },
    { icon: '📹', tip: 'For video calls, reduce outgoing video to 360p or audio-only.' },
    { icon: '🔍', tip: 'Check the Throttle Detector — your ISP may be throttling.' },
    { icon: '📝', tip: 'Log downtime duration for your ISP contract compliance report.' },
  ],
  minor: [
    { icon: '🔄', tip: 'A quick router reboot often resolves minor fluctuations.' },
    { icon: '📡', tip: 'Move closer to your router or switch to the 5 GHz band.' },
    { icon: '🧹', tip: 'Close background apps consuming bandwidth (cloud sync, updates).' },
    { icon: '📈', tip: 'Monitor for a few hours — it may resolve with off-peak traffic.' },
  ],
  none: [
    { icon: '✅', tip: 'Your connection is healthy. Keep monitoring to catch issues early.' },
    { icon: '📅', tip: 'Schedule weekly speed tests to track trends over time.' },
    { icon: '🔔', tip: 'Set up Smart Alerts to be notified of outages immediately.' },
    { icon: '📄', tip: "Use the ISP Contract Tracker to ensure you get what you pay for." },
  ],
};

// ── Educational context ──────────────────────────────────────────────────────
const CONTEXT = [
  { title: 'What is an Internet Crisis?',
    body: 'Ranges from a router reboot needed by you alone, to regional ISP outages affecting thousands, to global infrastructure failures knocking out major cloud platforms simultaneously.' },
  { title: 'Submarine Cable Cuts',
    body: '~95% of international data travels through undersea cables. A single cut can affect entire continents. The 2022 Tonga eruption cut the nation\'s only cable, leaving it offline for weeks.' },
  { title: 'BGP Route Hijacking',
    body: 'The Border Gateway Protocol routes packets globally. A misconfigured router can redirect massive traffic — in 2010, China Telecom briefly rerouted 15% of global internet traffic for 18 minutes.' },
  { title: 'Internet Shutdowns',
    body: 'AccessNow recorded 187 shutdowns in 35 countries in 2022. Governments shut internet during protests and elections, affecting millions of people\'s access to information.' },
  { title: 'DNS as a Single Point of Failure',
    body: 'In 2016, a DDoS on Dyn DNS took offline Twitter, Netflix, Reddit and Amazon for hours. If DNS fails, most of the web appears broken even when servers are running.' },
  { title: 'CDN Outages',
    body: 'In 2021, a Fastly CDN misconfiguration took down the Guardian, Financial Times, Reddit and GOV.UK for ~1 hour. CDNs handle enormous fractions of global web traffic.' },
];

// ── Components ────────────────────────────────────────────────────────────────

function SeverityBanner({ severity, message }) {
  const c = sev(severity);
  return (
    <Paper sx={{ p: 3, bgcolor: c.bg, borderLeft: `6px solid ${c.color}`, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ color: c.color, fontSize: 40, display: 'flex' }}>{c.icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700} sx={{ color: c.color }}>
            Internet Status: {c.label}
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={0.5}>{message}</Typography>
        </Box>
        <Chip label={c.label} color={c.chip} sx={{ fontWeight: 700, fontSize: '0.9rem' }} />
      </Box>
    </Paper>
  );
}

function StatBox({ label, value, unit = '', color }) {
  return (
    <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Typography variant="h5" fontWeight={800} color={color || 'text.primary'}>
        {value != null ? value : '—'}<Typography component="span" variant="body2" color="text.secondary"> {unit}</Typography>
      </Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

function LocalPanel({ local }) {
  const c = sev(local?.status);
  if (!local) return null;
  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SpeedIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>Your Connection</Typography>
        <Chip label={c.label} color={c.chip} size="small" sx={{ ml: 'auto' }} />
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>{local.message}</Typography>

      {local.current_download_mbps != null && (
        <>
          <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption">Download vs Baseline</Typography>
              <Typography variant="caption" fontWeight={700}>
                {local.current_download_mbps} / {local.baseline_download_mbps} Mbps
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, local.pct_of_baseline || 0)}
              color={local.pct_of_baseline >= 80 ? 'success' : local.pct_of_baseline >= 50 ? 'warning' : 'error'}
              sx={{ height: 10, borderRadius: 4 }}
            />
            <Typography variant="caption" color="text.secondary">{local.pct_of_baseline}% of your normal speed</Typography>
          </Box>

          <Grid container spacing={1} sx={{ mt: 0.5 }}>
            <Grid size={6}><StatBox label="Download" value={local.current_download_mbps} unit="Mbps" color="primary.main" /></Grid>
            <Grid size={6}><StatBox label="Upload" value={local.current_upload_mbps} unit="Mbps" /></Grid>
            <Grid size={6}><StatBox label="Avg Ping" value={local.avg_ping_ms} unit="ms"
              color={local.avg_ping_ms > 150 ? 'error.main' : local.avg_ping_ms > 80 ? 'warning.main' : 'success.main'} /></Grid>
            <Grid size={6}><StatBox label="Jitter" value={local.jitter_ms} unit="ms"
              color={local.jitter_ms > 20 ? 'warning.main' : 'success.main'} /></Grid>
          </Grid>

          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {local.isp && (
              <Typography variant="caption" color="text.secondary">ISP: <strong>{local.isp}</strong></Typography>
            )}
            {local.outage_events_in_sample > 0 && (
              <Chip label={`${local.outage_events_in_sample} outage event(s)`} color="error" size="small" />
            )}
            {local.community_reports_24h > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PeopleIcon fontSize="small" color="warning" />
                <Typography variant="caption">{local.community_reports_24h} community reports today</Typography>
              </Box>
            )}
            {local.last_test_at && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon fontSize="small" color="action" />
                <Typography variant="caption">Last test: {new Date(local.last_test_at).toLocaleTimeString()}</Typography>
              </Box>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
}

function GlobalPanel({ globalData }) {
  const [expanded, setExpanded] = useState(null);
  if (!globalData) return null;
  const c = sev(globalData.severity);
  const indColor = (ind) =>
    ind === 'none' ? 'success.main' : ind === 'minor' ? 'warning.main' :
    ind === 'major' || ind === 'critical' ? 'error.main' : 'text.disabled';

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <PublicIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>Global Infrastructure</Typography>
        <Chip label={c.label} color={c.chip} size="small" sx={{ ml: 'auto' }} />
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>{globalData.summary}</Typography>

      {/* Quick stats */}
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid size={4}><StatBox label="Providers" value={globalData.providers_checked} /></Grid>
        <Grid size={4}><StatBox label="Affected" value={globalData.affected_count}
          color={globalData.affected_count > 0 ? 'warning.main' : 'success.main'} /></Grid>
        <Grid size={4}><StatBox label="Incidents" value={globalData.total_incidents}
          color={globalData.total_incidents > 0 ? 'error.main' : 'success.main'} /></Grid>
      </Grid>

      <List dense disablePadding>
        {(globalData.services || []).map((s, i) => (
          <React.Fragment key={s.name}>
            <ListItem disableGutters
              secondaryAction={s.incidents?.length > 0 && (
                <IconButton size="small" onClick={() => setExpanded(expanded === i ? null : i)}>
                  {expanded === i ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              )}>
              <ListItemIcon sx={{ minWidth: 28, fontSize: '1.1rem' }}>{s.icon}</ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                    {s.active_incidents > 0 && (
                      <Chip label={`${s.active_incidents} incident${s.active_incidents > 1 ? 's' : ''}`}
                        size="small" color="warning" sx={{ height: 16, fontSize: '0.6rem' }} />
                    )}
                  </Box>
                }
                secondary={
                  <Typography variant="caption" sx={{ color: indColor(s.indicator) }}>
                    {s.status_text || s.indicator}
                    {s.error ? ' (unreachable)' : ''}
                  </Typography>
                }
              />
            </ListItem>
            {s.incidents?.length > 0 && (
              <Collapse in={expanded === i}>
                {s.incidents.map((inc, j) => (
                  <Alert key={j} severity="warning" sx={{ mb: 0.5, py: 0.5, mx: 1 }}>
                    <AlertTitle sx={{ fontSize: '0.8rem' }}>{inc.name}</AlertTitle>
                    <Typography variant="caption">
                      {inc.status} · Impact: {inc.impact}
                      {inc.updated_at && ` · Updated: ${new Date(inc.updated_at).toLocaleString()}`}
                    </Typography>
                  </Alert>
                ))}
              </Collapse>
            )}
            {i < (globalData.services?.length || 0) - 1 && <Divider component="li" />}
          </React.Fragment>
        ))}
      </List>

      {/* IODA status */}
      {globalData.ioda && (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="caption" fontWeight={700}>🔬 {globalData.ioda.source}</Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            {globalData.ioda.available ? globalData.ioda.description : 'Currently unreachable'}
          </Typography>
        </Box>
      )}

      {globalData.checked_at && (
        <Typography variant="caption" color="text.disabled" display="block" mt={1}>
          Checked: {new Date(globalData.checked_at).toLocaleTimeString()} · refreshes every 5 min
        </Typography>
      )}
    </Paper>
  );
}

function HistoryPanel({ clientId }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCrisisHistory(7).then(r => setHistory(r.data)).catch(() => setHistory(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LinearProgress />;
  if (!history?.events?.length) return (
    <Paper sx={{ p: 3, textAlign: 'center' }}>
      <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
      <Typography color="text.secondary">No crisis events recorded in the last 7 days.</Typography>
    </Paper>
  );

  const sevColor = (s) => SEV[s]?.color || '#757575';

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <HistoryIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>Crisis History (7 days)</Typography>
        <Chip label={`${history.events.length} event${history.events.length !== 1 ? 's' : ''}`}
          size="small" sx={{ ml: 'auto' }} />
      </Box>
      <List dense disablePadding>
        {history.events.slice(0, 20).map((e, i) => (
          <React.Fragment key={i}>
            <ListItem disableGutters>
              <ListItemIcon sx={{ minWidth: 12 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%',
                  bgcolor: sevColor(e.combined_severity), mt: 0.5 }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip label={e.combined_severity.toUpperCase()} size="small"
                      sx={{ bgcolor: sevColor(e.combined_severity), color: '#fff',
                        fontSize: '0.6rem', height: 18 }} />
                    {e.local_download_mbps && (
                      <Typography variant="caption">
                        {e.local_download_mbps} Mbps ({e.pct_of_baseline}% of baseline)
                      </Typography>
                    )}
                    {e.affected_services?.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        · {e.affected_services.join(', ')}
                      </Typography>
                    )}
                  </Box>
                }
                secondary={new Date(e.timestamp).toLocaleString()}
              />
            </ListItem>
            {i < history.events.length - 1 && <Divider component="li" />}
          </React.Fragment>
        ))}
      </List>
    </Paper>
  );
}

function CommunityPanel() {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCrisisCommunityImpact(24).then(r => setImpact(r.data)).catch(() => setImpact(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LinearProgress />;
  if (!impact) return null;

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <PeopleIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>Community Impact (24h)</Typography>
      </Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={4}><StatBox label="Reports" value={impact.community_reports}
          color={impact.community_reports > 0 ? 'warning.main' : 'success.main'} /></Grid>
        <Grid size={4}><StatBox label="Outage Events" value={impact.outage_events}
          color={impact.outage_events > 0 ? 'error.main' : 'success.main'} /></Grid>
        <Grid size={4}><StatBox label="Unresolved" value={impact.unresolved_outages}
          color={impact.unresolved_outages > 0 ? 'error.main' : 'success.main'} /></Grid>
      </Grid>
      {impact.top_affected_isps?.length > 0 && (
        <>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>Most Reported ISPs</Typography>
          {impact.top_affected_isps.map((item, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="body2" sx={{ minWidth: 140 }}>{item.isp}</Typography>
              <LinearProgress variant="determinate"
                value={Math.min(100, (item.reports / (impact.top_affected_isps[0]?.reports || 1)) * 100)}
                sx={{ flex: 1, height: 8, borderRadius: 4 }} color="warning" />
              <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right' }}>{item.reports}</Typography>
            </Box>
          ))}
        </>
      )}
      {impact.issue_breakdown?.length > 0 && (
        <>
          <Typography variant="subtitle2" fontWeight={700} mt={2} mb={1}>Issue Types</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {impact.issue_breakdown.map((item, i) => (
              <Chip key={i} label={`${item.type} (${item.count})`} size="small" variant="outlined" />
            ))}
          </Box>
        </>
      )}
    </Paper>
  );
}

function TipsPanel({ severity, local }) {
  const tips = TIPS[severity] || TIPS.none;
  const c = sev(severity);
  const contextLine = (() => {
    if (!local?.current_download_mbps) return null;
    const parts = [];
    if (severity !== 'none' && local.pct_of_baseline != null)
      parts.push(`your speed is at ${local.pct_of_baseline}% of your normal ${local.baseline_download_mbps} Mbps`);
    if (local.avg_ping_ms > 150) parts.push(`ping is elevated at ${local.avg_ping_ms} ms`);
    if (local.jitter_ms > 20) parts.push(`jitter is high at ${local.jitter_ms} ms`);
    return parts.length ? parts.join('; ') + '.' : null;
  })();

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <LightbulbIcon sx={{ color: c.color }} />
        <Typography variant="h6" fontWeight={700}>What To Do</Typography>
        <Chip label={c.label} color={c.chip} size="small" sx={{ ml: 'auto' }} />
      </Box>
      {contextLine && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
          Based on your data: {contextLine}
        </Typography>
      )}
      <Grid container spacing={1.5}>
        {tips.map((t, i) => (
          <Grid size={{ xs: 12, sm: 6 }} key={i}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start',
              p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography fontSize="1.4rem" lineHeight={1}>{t.icon}</Typography>
              <Typography variant="body2">{t.tip}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}

function ContextPanel() {
  const [open, setOpen] = useState(null);
  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <InfoIcon color="info" />
        <Typography variant="h6" fontWeight={700}>Understanding Internet Crises</Typography>
      </Box>
      <Grid container spacing={1.5}>
        {CONTEXT.map((item, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
            <Paper variant="outlined" sx={{ p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => setOpen(open === i ? null : i)}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" fontWeight={700}>{item.title}</Typography>
                {open === i ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </Box>
              <Collapse in={open === i}>
                <Typography variant="body2" color="text.secondary" mt={1}>{item.body}</Typography>
              </Collapse>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InternetCrisisPage() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [tab, setTab]               = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInternetCrisis();
      setData(res.data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not fetch crisis status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, [load]);

  const severity = data?.combined_severity || 'unknown';

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Internet Crisis Monitor</Typography>
          <Typography variant="body2" color="text.secondary">
            Local detection + live status from{' '}
            {data?.global?.services?.length
              ? data.global.services.map(s => s.name).join(', ')
              : 'Cloudflare, GitHub, Discord, Reddit, Atlassian, Stripe, Twilio'}
          </Typography>
          {lastRefresh && (
            <Typography variant="caption" color="text.disabled">
              Last refreshed: {lastRefresh.toLocaleTimeString()} · auto-refreshes every 5 min
            </Typography>
          )}
        </Box>
        <Tooltip title="Refresh now">
          <span>
            <IconButton onClick={load} disabled={loading}><RefreshIcon /></IconButton>
          </span>
        </Tooltip>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}><AlertTitle>Error</AlertTitle>{error}</Alert>}

      {data && <SeverityBanner severity={severity} message={data.alert_message || ''} />}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }} variant="scrollable">
        <Tab label="Live Status" icon={<PublicIcon />} iconPosition="start" />
        <Tab label="Crisis History" icon={<HistoryIcon />} iconPosition="start" />
        <Tab label="Community Impact" icon={<PeopleIcon />} iconPosition="start" />
        <Tab label="Education" icon={<InfoIcon />} iconPosition="start" />
      </Tabs>

      {tab === 0 && data && (
        <Box>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}><LocalPanel local={data.local} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><GlobalPanel globalData={data.global} /></Grid>
          </Grid>
          <TipsPanel severity={severity} local={data?.local} />
        </Box>
      )}

      {tab === 1 && <HistoryPanel />}
      {tab === 2 && <CommunityPanel />}
      {tab === 3 && <ContextPanel />}
    </Box>
  );
}
