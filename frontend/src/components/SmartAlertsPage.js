import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Switch, TextField, Alert,
  Chip, Stack, Divider, CircularProgress, Slider, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Accordion, AccordionSummary, AccordionDetails, Tooltip,
  useTheme,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import TelegramIcon from '@mui/icons-material/Telegram';
import DiscordIcon from '@mui/icons-material/Hub';
import SmsIcon from '@mui/icons-material/Sms';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SpeedIcon from '@mui/icons-material/Speed';
import RefreshIcon from '@mui/icons-material/Refresh';
import WebhookIcon from '@mui/icons-material/Webhook';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { motion } from 'framer-motion';
import {
  getAlertConfig, updateAlertConfig, testAlert,
  getAlertLog, listWebhooks, createWebhook, deleteWebhook, testWebhook,
} from '../services/api';

const GOLD = '#f0c24b';

// ── Severity chip ──────────────────────────────────────────────────────────
function SeverityChip({ severity }) {
  const map = {
    critical: { color: '#EF5350', label: 'Critical' },
    high:     { color: '#FF7043', label: 'High' },
    medium:   { color: '#FFA726', label: 'Medium' },
    low:      { color: '#42A5F5', label: 'Low' },
  };
  const { color, label } = map[severity] || map.low;
  return (
    <Chip
      label={label}
      size="small"
      sx={{ fontWeight: 700, fontSize: 10, bgcolor: `${color}18`, color, border: `1px solid ${color}30` }}
    />
  );
}

// ── Channel section wrapper ────────────────────────────────────────────────
function ChannelSection({ icon: Icon, title, color, enabled, onToggle, children }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Paper sx={{
      p: 3, mb: 2,
      background: isDark ? '#080808' : '#fff',
      border: `1px solid ${enabled ? `${color}40` : 'rgba(255,255,255,0.06)'}`,
      transition: 'border-color 0.2s',
    }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={enabled ? 2.5 : 0}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon sx={{ fontSize: 20, color }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {enabled ? 'Enabled' : 'Disabled'}
            </Typography>
          </Box>
        </Stack>
        <Switch
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': { color },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: color },
          }}
        />
      </Stack>
      {enabled && children}
    </Paper>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function SmartAlertsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Config state
  const [cfg, setCfg] = useState({
    telegram_enabled: false,
    telegram_chat_id: '',
    discord_enabled:  false,
    discord_webhook_url: '',
    sms_enabled:      false,
    phone_number:     '',
    min_download_speed: null,
    max_ping:         null,
    quiet_hours_enabled: false,
    quiet_hours_start: '23:00',
    quiet_hours_end:   '07:00',
  });

  const [saveLoading,  setSaveLoading]  = useState(false);
  const [testLoading,  setTestLoading]  = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);  // { type: 'success'|'error', text }
  const [testMsg, setTestMsg] = useState(null);

  // Alert log state
  const [alertLog,     setAlertLog]     = useState([]);
  const [logLoading,   setLogLoading]   = useState(false);

  // Webhook state
  const [webhooks,     setWebhooks]     = useState([]);
  const [whLoading,    setWhLoading]    = useState(false);
  const [newWhUrl,     setNewWhUrl]     = useState('');
  const [addingWh,     setAddingWh]     = useState(false);
  const [whMsg,        setWhMsg]        = useState(null);

  // ── Load config ────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      const res = await getAlertConfig();
      const d = res.data || {};
      if (d.enabled !== undefined) {
        setCfg({
          telegram_enabled:    d.telegram_enabled    ?? false,
          telegram_chat_id:    d.telegram_chat_id    ?? '',
          discord_enabled:     d.discord_enabled     ?? false,
          discord_webhook_url: d.discord_webhook_url ?? '',
          sms_enabled:         d.sms_enabled         ?? false,
          phone_number:        d.phone_number         ?? '',
          min_download_speed:  d.min_download_speed  ?? null,
          max_ping:            d.max_ping            ?? null,
          quiet_hours_enabled: d.quiet_hours_enabled ?? false,
          quiet_hours_start:   d.quiet_hours_start   ? d.quiet_hours_start.slice(0, 5) : '23:00',
          quiet_hours_end:     d.quiet_hours_end     ? d.quiet_hours_end.slice(0, 5)   : '07:00',
        });
      }
    } catch {}
    setConfigLoaded(true);
  }, []);

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await getAlertLog(50);
      setAlertLog(res.data || []);
    } catch {}
    setLogLoading(false);
  }, []);

  const loadWebhooks = useCallback(async () => {
    setWhLoading(true);
    try {
      const res = await listWebhooks();
      setWebhooks(res.data || []);
    } catch {}
    setWhLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
    loadLog();
    loadWebhooks();
  }, [loadConfig, loadLog, loadWebhooks]);

  // ── Save config ────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setSaveLoading(true);
    setSaveMsg(null);
    try {
      await updateAlertConfig(cfg);
      setSaveMsg({ type: 'success', text: 'Alert configuration saved successfully.' });
    } catch (e) {
      setSaveMsg({ type: 'error', text: e?.response?.data?.detail || 'Failed to save configuration.' });
    }
    setSaveLoading(false);
    setTimeout(() => setSaveMsg(null), 4000);
  };

  // ── Test alert ─────────────────────────────────────────────────────────
  const sendTestAlert = async () => {
    setTestLoading(true);
    setTestMsg(null);
    try {
      const res = await testAlert();
      setTestMsg(
        res.data?.success
          ? { type: 'success', text: 'Test alert sent! Check your configured channels.' }
          : { type: 'warning', text: 'Test sent but delivery may have failed. Check channel settings.' }
      );
      await loadLog();
    } catch (e) {
      setTestMsg({ type: 'error', text: e?.response?.data?.detail || 'Failed to send test alert.' });
    }
    setTestLoading(false);
    setTimeout(() => setTestMsg(null), 5000);
  };

  // ── Webhook actions ────────────────────────────────────────────────────
  const addWebhook = async () => {
    if (!newWhUrl.trim()) return;
    setAddingWh(true);
    try {
      await createWebhook({ url: newWhUrl.trim(), events: ['outage', 'speed_drop', 'recovery'] });
      setNewWhUrl('');
      setWhMsg({ type: 'success', text: 'Webhook registered.' });
      await loadWebhooks();
    } catch (e) {
      setWhMsg({ type: 'error', text: e?.response?.data?.detail || 'Failed to register webhook.' });
    }
    setAddingWh(false);
    setTimeout(() => setWhMsg(null), 3000);
  };

  const removeWebhook = async (id) => {
    try {
      await deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch {}
  };

  const pingWebhook = async (id) => {
    try {
      const res = await testWebhook(id);
      setWhMsg(
        res.data?.success
          ? { type: 'success', text: `Webhook test: HTTP ${res.data.status_code}` }
          : { type: 'error', text: res.data?.error || 'Webhook test failed' }
      );
    } catch (e) {
      setWhMsg({ type: 'error', text: 'Webhook test failed' });
    }
    setTimeout(() => setWhMsg(null), 3000);
  };

  const set = (key, val) => setCfg((p) => ({ ...p, [key]: val }));

  if (!configLoaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <CircularProgress sx={{ color: GOLD }} />
      </Box>
    );
  }

  const anyChannelEnabled = cfg.telegram_enabled || cfg.discord_enabled || cfg.sms_enabled;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 900, mx: 'auto' }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <Paper sx={{
          mb: 3, p: { xs: 2.5, md: 3.5 },
          background: 'linear-gradient(135deg, #000 0%, #0a0800 55%, #111000 100%)',
          border: '1px solid rgba(240,194,75,0.35)',
          boxShadow: '0 8px 48px rgba(240,194,75,0.1)',
        }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <NotificationsActiveIcon sx={{ color: GOLD, fontSize: 28 }} />
              <Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>Smart Alerts</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  Telegram · Discord · SMS · Webhooks · Quiet Hours
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" gap={1}>
              <Button
                variant="outlined"
                size="small"
                startIcon={testLoading ? <CircularProgress size={14} /> : <SendIcon />}
                onClick={sendTestAlert}
                disabled={testLoading || !anyChannelEnabled}
                sx={{ borderColor: `rgba(240,194,75,0.4)`, color: GOLD, '&:hover': { borderColor: GOLD } }}
              >
                Test Alert
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={saveLoading ? <CircularProgress size={14} sx={{ color: 'rgba(0,0,0,0.5)' }} /> : <SaveIcon />}
                onClick={saveConfig}
                disabled={saveLoading}
                sx={{
                  background: `linear-gradient(135deg, #f6d978, ${GOLD})`,
                  color: '#000', fontWeight: 800,
                  '&:disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
                }}
              >
                Save
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </motion.div>

      {saveMsg && <Alert severity={saveMsg.type} sx={{ mb: 2 }} onClose={() => setSaveMsg(null)}>{saveMsg.text}</Alert>}
      {testMsg && <Alert severity={testMsg.type} sx={{ mb: 2 }} onClose={() => setTestMsg(null)}>{testMsg.text}</Alert>}

      {/* ── Telegram ──────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <ChannelSection
          icon={TelegramIcon}
          title="Telegram Bot"
          color="#29b6f6"
          enabled={cfg.telegram_enabled}
          onToggle={(v) => set('telegram_enabled', v)}
        >
          <Stack spacing={2}>
            <TextField
              label="Chat ID"
              value={cfg.telegram_chat_id}
              onChange={(e) => set('telegram_chat_id', e.target.value)}
              size="small"
              placeholder="e.g. 123456789 or @yourchannel"
              helperText="Start a chat with @BotFather to create a bot, then get your chat ID from @userinfobot"
            />
            <Alert severity="info" sx={{ fontSize: '0.78rem' }}>
              Set <strong>TELEGRAM_BOT_TOKEN</strong> in your backend environment variables to enable Telegram delivery.
            </Alert>
          </Stack>
        </ChannelSection>
      </motion.div>

      {/* ── Discord ───────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
        <ChannelSection
          icon={DiscordIcon}
          title="Discord Webhook"
          color="#7289da"
          enabled={cfg.discord_enabled}
          onToggle={(v) => set('discord_enabled', v)}
        >
          <TextField
            label="Webhook URL"
            value={cfg.discord_webhook_url}
            onChange={(e) => set('discord_webhook_url', e.target.value)}
            size="small"
            fullWidth
            placeholder="https://discord.com/api/webhooks/…"
            helperText="Server Settings → Integrations → Webhooks → New Webhook → Copy URL"
          />
        </ChannelSection>
      </motion.div>

      {/* ── SMS ───────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}>
        <ChannelSection
          icon={SmsIcon}
          title="SMS via Twilio"
          color="#F22F46"
          enabled={cfg.sms_enabled}
          onToggle={(v) => set('sms_enabled', v)}
        >
          <Stack spacing={2}>
            <TextField
              label="Phone Number"
              value={cfg.phone_number}
              onChange={(e) => set('phone_number', e.target.value)}
              size="small"
              placeholder="+1234567890"
              helperText="International format. SMS is only sent for critical severity alerts."
            />
            <Alert severity="info" sx={{ fontSize: '0.78rem' }}>
              Set <strong>TWILIO_ACCOUNT_SID</strong>, <strong>TWILIO_AUTH_TOKEN</strong>, and <strong>TWILIO_FROM_NUMBER</strong> in backend env vars.
            </Alert>
          </Stack>
        </ChannelSection>
      </motion.div>

      {/* ── Thresholds ────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
        <Paper sx={{ p: 3, mb: 2, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.15)' }}>
          <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
            <SpeedIcon sx={{ color: GOLD, fontSize: 22 }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Alert Thresholds</Typography>
              <Typography variant="caption" color="text.secondary">Trigger alerts when performance drops below these values</Typography>
            </Box>
          </Stack>

          <Stack spacing={4}>
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Min Download Speed: <strong style={{ color: GOLD }}>{cfg.min_download_speed ?? 'Any'} Mbps</strong>
              </Typography>
              <Slider
                value={cfg.min_download_speed ?? 0}
                onChange={(_, v) => set('min_download_speed', v === 0 ? null : v)}
                min={0} max={100} step={5}
                marks={[{ value: 0, label: 'Off' }, { value: 25, label: '25' }, { value: 50, label: '50' }, { value: 100, label: '100 Mbps' }]}
                sx={{ color: GOLD, '& .MuiSlider-markLabel': { fontSize: 10 } }}
              />
              <Typography variant="caption" color="text.secondary">
                Alert when download speed drops below this threshold. Set to 0 to disable.
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Max Ping: <strong style={{ color: GOLD }}>{cfg.max_ping ?? 'Any'} ms</strong>
              </Typography>
              <Slider
                value={cfg.max_ping ?? 0}
                onChange={(_, v) => set('max_ping', v === 0 ? null : v)}
                min={0} max={300} step={10}
                marks={[{ value: 0, label: 'Off' }, { value: 100, label: '100' }, { value: 200, label: '200' }, { value: 300, label: '300 ms' }]}
                sx={{ color: '#42A5F5', '& .MuiSlider-markLabel': { fontSize: 10 } }}
              />
              <Typography variant="caption" color="text.secondary">
                Alert when ping exceeds this threshold. Set to 0 to disable.
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </motion.div>

      {/* ── Quiet Hours ───────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Paper sx={{ p: 3, mb: 2, background: isDark ? '#080808' : '#fff', border: `1px solid ${cfg.quiet_hours_enabled ? 'rgba(156,39,176,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={cfg.quiet_hours_enabled ? 2.5 : 0}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: 'rgba(156,39,176,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AccessTimeIcon sx={{ fontSize: 20, color: '#9c27b0' }} />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>Quiet Hours</Typography>
                <Typography variant="caption" color="text.secondary">
                  Suppress non-critical alerts during sleep hours
                </Typography>
              </Box>
            </Stack>
            <Switch
              checked={cfg.quiet_hours_enabled}
              onChange={(e) => set('quiet_hours_enabled', e.target.checked)}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: '#9c27b0' },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#9c27b0' },
              }}
            />
          </Stack>
          {cfg.quiet_hours_enabled && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Quiet Start"
                type="time"
                value={cfg.quiet_hours_start}
                onChange={(e) => set('quiet_hours_start', e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Alerts suppressed from this time…"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Quiet End"
                type="time"
                value={cfg.quiet_hours_end}
                onChange={(e) => set('quiet_hours_end', e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="…until this time (critical alerts always sent)"
                sx={{ flex: 1 }}
              />
            </Stack>
          )}
        </Paper>
      </motion.div>

      {/* ── Webhooks ──────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}>
        <Accordion
          sx={{ mb: 2, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.15)', borderRadius: '8px !important', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <WebhookIcon sx={{ color: GOLD, fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700}>Custom Webhooks</Typography>
              {webhooks.length > 0 && (
                <Chip label={webhooks.length} size="small" sx={{ bgcolor: `${GOLD}18`, color: GOLD, fontWeight: 700, fontSize: 10 }} />
              )}
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            {whMsg && <Alert severity={whMsg.type} sx={{ mb: 2, fontSize: '0.78rem' }} onClose={() => setWhMsg(null)}>{whMsg.text}</Alert>}

            <Typography variant="caption" color="text.secondary" display="block" mb={2}>
              Register URLs to receive JSON payloads on outage, speed drop, and recovery events.
              Max 5 webhooks per device.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mb={2}>
              <TextField
                size="small"
                fullWidth
                placeholder="https://your-service.com/webhook"
                value={newWhUrl}
                onChange={(e) => setNewWhUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addWebhook()}
              />
              <Button
                variant="contained"
                startIcon={addingWh ? <CircularProgress size={14} /> : <AddIcon />}
                onClick={addWebhook}
                disabled={addingWh || !newWhUrl.trim()}
                sx={{ background: `linear-gradient(135deg, #f6d978, ${GOLD})`, color: '#000', fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                Add
              </Button>
            </Stack>

            {whLoading
              ? <CircularProgress size={24} sx={{ color: GOLD }} />
              : webhooks.length === 0
                ? <Typography variant="caption" color="text.disabled">No webhooks registered yet.</Typography>
                : (
                  <Stack spacing={1}>
                    {webhooks.map((wh) => (
                      <Box key={wh.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {wh.url}
                        </Typography>
                        <Stack direction="row" gap={0.5}>
                          {(wh.events || []).map((ev) => (
                            <Chip key={ev} label={ev} size="small" sx={{ fontSize: 9, fontWeight: 700, bgcolor: `${GOLD}12`, color: GOLD }} />
                          ))}
                        </Stack>
                        <Tooltip title="Send test payload">
                          <IconButton size="small" onClick={() => pingWebhook(wh.id)} sx={{ color: GOLD }}>
                            <SendIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete webhook">
                          <IconButton size="small" onClick={() => removeWebhook(wh.id)} sx={{ color: '#EF5350' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </Stack>
                )
            }
          </AccordionDetails>
        </Accordion>
      </motion.div>

      {/* ── Alert Log ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
        <Accordion
          defaultExpanded
          sx={{ background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.15)', borderRadius: '8px !important', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" gap={1.5} flex={1}>
              <NotificationsActiveIcon sx={{ color: GOLD, fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700}>Alert History</Typography>
              <Chip label={alertLog.length} size="small" sx={{ bgcolor: `${GOLD}18`, color: GOLD, fontWeight: 700, fontSize: 10 }} />
              <IconButton
                component="span"
                size="small"
                onClick={(e) => { e.stopPropagation(); loadLog(); }}
                disabled={logLoading}
                sx={{ ml: 'auto', color: 'text.secondary' }}
              >
                {logLoading ? <CircularProgress size={14} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {alertLog.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.disabled">No alerts sent yet.</Typography>
                <Typography variant="caption" color="text.disabled">
                  Configure a channel above and click "Test Alert" to verify delivery.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Message</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Severity</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {alertLog.map((log) => (
                      <TableRow key={log.id} hover>
                        <TableCell sx={{ fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Chip label={log.alert_type} size="small" sx={{ fontSize: 9, fontWeight: 700, bgcolor: `${GOLD}12`, color: GOLD }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, maxWidth: 300 }}>
                          <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.message}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <SeverityChip severity={log.severity} />
                        </TableCell>
                        <TableCell>
                          {log.success
                            ? <CheckCircleIcon sx={{ fontSize: 16, color: '#43A047' }} />
                            : <ErrorIcon sx={{ fontSize: 16, color: '#EF5350' }} />
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </AccordionDetails>
        </Accordion>
      </motion.div>

      {/* ── Save reminder ─────────────────────────────────────────────── */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={saveLoading ? <CircularProgress size={16} sx={{ color: 'rgba(0,0,0,0.5)' }} /> : <SaveIcon />}
          onClick={saveConfig}
          disabled={saveLoading}
          sx={{
            background: `linear-gradient(135deg, #f6d978, ${GOLD})`,
            color: '#000', fontWeight: 800, px: 4, borderRadius: 3,
            boxShadow: '0 4px 16px rgba(240,194,75,0.3)',
            '&:disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
          }}
        >
          {saveLoading ? 'Saving…' : 'Save Configuration'}
        </Button>
      </Box>
    </Box>
  );
}
