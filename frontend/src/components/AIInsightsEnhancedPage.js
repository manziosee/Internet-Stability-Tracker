import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, Alert, Chip,
  Card, CardContent, TextField, List, ListItem, ListItemIcon,
  ListItemText, LinearProgress, Accordion, AccordionSummary,
  AccordionDetails, IconButton, InputAdornment, Stack, useTheme,
  Skeleton, Divider, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import BuildIcon from '@mui/icons-material/Build';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BugReportIcon from '@mui/icons-material/BugReport';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getRootCause, getPredictiveMaintenance, getAnomaliesAdvanced, askNaturalQuery,
} from '../services/api';

const GOLD = '#f0c24b';

function PageHeader({ loading, onRefresh }) {
  return (
    <Paper sx={{
      mb: 3, p: { xs: 2.5, md: 3.5 },
      background: 'linear-gradient(135deg, #000 0%, #0a0800 55%, #111000 100%)',
      border: '1px solid rgba(240,194,75,0.35)',
      boxShadow: '0 8px 48px rgba(240,194,75,0.1)',
    }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <PsychologyIcon sx={{ color: GOLD, fontSize: 28 }} />
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>AI-Powered Network Insights</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              Root cause · Predictive maintenance · Anomaly detection · Natural language chatbot
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
          {loading ? 'Analyzing…' : 'Refresh'}
        </Button>
      </Stack>
    </Paper>
  );
}

// ── Root Cause Analysis ────────────────────────────────────────────────────────
function RootCausePanel({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{[1,2,3].map(i => <Skeleton key={i} height={60} sx={{ borderRadius: 2 }} />)}</Box>;

  return (
    <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.15)' }}>
      <Stack direction="row" gap={1} alignItems="center" mb={2}>
        <BugReportIcon sx={{ color: GOLD, fontSize: 22 }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>Root Cause Analysis</Typography>
          <Typography variant="caption" color="text.secondary">Why is my speed slow?</Typography>
        </Box>
      </Stack>

      {data?.error && <Alert severity="info">{data.error}</Alert>}

      {data && !data.error && (
        <>
          {data.primary_cause && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom fontWeight={700}>Primary Issue</Typography>
              <Typography variant="body2">{data.primary_cause}</Typography>
            </Alert>
          )}

          {data.root_causes?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Contributing Factors</Typography>
              <Stack spacing={1}>
                {data.root_causes.map((cause, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <Box sx={{ p: 1.5, borderRadius: 2,
                      bgcolor: cause.confidence >= 80 ? 'rgba(239,83,80,0.07)' : cause.confidence >= 60 ? 'rgba(255,167,38,0.07)' : 'rgba(66,165,245,0.07)',
                      border: `1px solid ${cause.confidence >= 80 ? 'rgba(239,83,80,0.2)' : cause.confidence >= 60 ? 'rgba(255,167,38,0.2)' : 'rgba(66,165,245,0.2)'}`,
                    }}>
                      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                        {cause.confidence >= 80 ? <ErrorIcon sx={{ fontSize: 16, color: '#EF5350' }} />
                          : cause.confidence >= 60 ? <WarningAmberIcon sx={{ fontSize: 16, color: '#FFA726' }} />
                          : <LightbulbIcon sx={{ fontSize: 16, color: '#42A5F5' }} />}
                        <Typography variant="body2" fontWeight={700}>{cause.cause}</Typography>
                        <Chip label={`${cause.confidence}%`} size="small" sx={{ ml: 'auto', fontWeight: 700, fontSize: 10,
                          bgcolor: cause.confidence >= 80 ? 'rgba(239,83,80,0.15)' : cause.confidence >= 60 ? 'rgba(255,167,38,0.15)' : 'rgba(66,165,245,0.15)',
                          color: cause.confidence >= 80 ? '#EF5350' : cause.confidence >= 60 ? '#FFA726' : '#42A5F5' }} />
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={cause.confidence}
                        sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.06)',
                          '& .MuiLinearProgress-bar': {
                            bgcolor: cause.confidence >= 80 ? '#EF5350' : cause.confidence >= 60 ? '#FFA726' : '#42A5F5',
                          },
                        }}
                      />
                    </Box>
                  </motion.div>
                ))}
              </Stack>
            </Box>
          )}

          {data.recommendations?.length > 0 && (
            <Accordion sx={{ background: isDark ? 'rgba(240,194,75,0.04)' : 'rgba(240,194,75,0.06)', border: '1px solid rgba(240,194,75,0.15)' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" gap={1} alignItems="center">
                  <CheckCircleIcon sx={{ fontSize: 16, color: '#43A047' }} />
                  <Typography variant="subtitle2" fontWeight={700}>
                    Recommended Actions ({data.recommendations.length})
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <List dense disablePadding>
                  {data.recommendations.map((rec, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CheckCircleIcon sx={{ fontSize: 16, color: '#43A047' }} />
                      </ListItemIcon>
                      <ListItemText primary={<Typography variant="body2">{rec}</Typography>} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          <Stack direction="row" gap={1} mt={2} flexWrap="wrap">
            <Chip label={`${data.measurements_analyzed} measurements`} size="small" variant="outlined" />
            <Chip label={`${data.analysis_period_hours}h period`} size="small" variant="outlined" />
          </Stack>
        </>
      )}
    </Paper>
  );
}

// ── Predictive Maintenance ─────────────────────────────────────────────────────
function PredictivePanel({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Skeleton height={280} sx={{ borderRadius: 2 }} />;

  const needsMaintenance = data?.needs_maintenance;
  const borderColor = needsMaintenance ? 'rgba(239,83,80,0.3)' : 'rgba(67,160,71,0.3)';
  const accentColor = needsMaintenance ? '#EF5350' : '#43A047';

  return (
    <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: `1px solid ${borderColor}`, height: '100%' }}>
      <Stack direction="row" gap={1} alignItems="center" mb={2}>
        <BuildIcon sx={{ color: GOLD, fontSize: 22 }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>Predictive Maintenance</Typography>
          <Typography variant="caption" color="text.secondary">Router needs reboot? Degradation detected?</Typography>
        </Box>
      </Stack>

      {data?.error && <Alert severity="info">{data.error}</Alert>}

      {data && !data.error && (
        <>
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: `${accentColor}12`, border: `1px solid ${accentColor}30`, mb: 2 }}>
            <Typography variant="h5" fontWeight={900} sx={{ color: accentColor }}>
              {needsMaintenance ? '⚠️ Action Needed' : '✅ All Good'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {data.recommendation}
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} mb={2}>
            <Box flex={1} sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Confidence</Typography>
              <Typography variant="h5" fontWeight={900} sx={{ color: GOLD }}>{data.confidence_percent}%</Typography>
            </Box>
            <Box flex={1} sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Days Until Maint.</Typography>
              <Typography variant="h5" fontWeight={900} sx={{ color: GOLD }}>{data.days_until_maintenance ?? '—'}</Typography>
            </Box>
          </Stack>

          <Box sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              {(data.degradation_rate_percent ?? 0) > 0 ? (
                <TrendingDownIcon sx={{ color: '#EF5350', fontSize: 18 }} />
              ) : (
                <TrendingUpIcon sx={{ color: '#43A047', fontSize: 18 }} />
              )}
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Degradation Rate: <strong style={{ color: (data.degradation_rate_percent ?? 0) > 0 ? '#EF5350' : '#43A047' }}>
                  {Math.abs(data.degradation_rate_percent ?? 0)}%
                </strong>
              </Typography>
            </Stack>
          </Box>

          {data.actions?.length > 0 && (
            <Accordion sx={{ background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid rgba(240,194,75,0.1)' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2" fontWeight={700}>Maintenance Actions</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense disablePadding>
                  {data.actions.map((action, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <BuildIcon sx={{ fontSize: 14, color: GOLD }} />
                      </ListItemIcon>
                      <ListItemText primary={<Typography variant="body2">{action}</Typography>} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}
        </>
      )}
    </Paper>
  );
}

// ── Anomaly Detection ──────────────────────────────────────────────────────────
function AnomalyPanel({ data, loading, sensitivity, onSensitivityChange }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <Skeleton height={280} sx={{ borderRadius: 2 }} />;

  const count = data?.anomalies_detected ?? 0;

  return (
    <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.15)', height: '100%' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Stack direction="row" gap={1} alignItems="center">
          <WarningAmberIcon sx={{ color: GOLD, fontSize: 22 }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>Anomaly Detection</Typography>
            <Typography variant="caption" color="text.secondary">Unusual patterns in your connection</Typography>
          </Box>
        </Stack>
        <ToggleButtonGroup value={sensitivity} exclusive size="small" onChange={(_, v) => v && onSensitivityChange(v)}>
          {[{ val: 1.5, label: 'High' }, { val: 2.0, label: 'Med' }, { val: 3.0, label: 'Low' }].map(({ val, label }) => (
            <ToggleButton key={val} value={val} sx={{ px: 1.2, fontSize: 10, fontWeight: 700,
              '&.Mui-selected': { bgcolor: GOLD, color: '#000' } }}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {data?.error && <Alert severity="info">{data.error}</Alert>}

      {data && !data.error && (
        <>
          <Box sx={{ textAlign: 'center', py: 2, mb: 2, borderRadius: 2,
            bgcolor: count > 0 ? 'rgba(239,83,80,0.08)' : 'rgba(67,160,71,0.08)',
            border: `1px solid ${count > 0 ? 'rgba(239,83,80,0.25)' : 'rgba(67,160,71,0.25)'}`,
          }}>
            <Typography variant="h2" fontWeight={900} sx={{ color: count > 0 ? '#EF5350' : '#43A047' }}>
              {count}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {count === 0 ? 'No anomalies — connection is stable' : `anomal${count === 1 ? 'y' : 'ies'} detected`}
            </Typography>
            {data.baseline_speed_mbps && (
              <Typography variant="caption" color="text.disabled">
                Baseline: {data.baseline_speed_mbps} Mbps
              </Typography>
            )}
          </Box>

          {data.anomalies?.length > 0 && (
            <Box sx={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {data.anomalies.slice(0, 10).map((a, i) => (
                <Box key={i} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderRadius: 1.5,
                  bgcolor: a.severity === 'high' ? 'rgba(239,83,80,0.07)' : 'rgba(255,167,38,0.07)',
                  border: `1px solid ${a.severity === 'high' ? 'rgba(239,83,80,0.2)' : 'rgba(255,167,38,0.2)'}`,
                }}>
                  {a.severity === 'high'
                    ? <ErrorIcon sx={{ fontSize: 15, color: '#EF5350', flexShrink: 0 }} />
                    : <WarningAmberIcon sx={{ fontSize: 15, color: '#FFA726', flexShrink: 0 }} />}
                  <Typography variant="body2" fontWeight={700} sx={{ minWidth: 80 }}>
                    {a.type === 'spike' ? '↑' : '↓'} {a.value} Mbps
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {new Date(a.timestamp).toLocaleString()}
                  </Typography>
                  <Chip label={`z=${a.deviation}`} size="small" sx={{ fontSize: 9, fontWeight: 700,
                    bgcolor: a.severity === 'high' ? 'rgba(239,83,80,0.12)' : 'rgba(255,167,38,0.12)',
                    color: a.severity === 'high' ? '#EF5350' : '#FFA726' }} />
                </Box>
              ))}
            </Box>
          )}

          {data.patterns?.length > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom fontWeight={700}>Patterns</Typography>
              {data.patterns.map((p, i) => (
                <Typography key={i} variant="body2">• {p}</Typography>
              ))}
            </Alert>
          )}
        </>
      )}
    </Paper>
  );
}

// ── AI Chatbot ─────────────────────────────────────────────────────────────────
const SUGGESTED = [
  "Why was my speed bad yesterday?",
  "What was my average speed last week?",
  "When is the best time to download?",
  "Show me yesterday's performance",
  "Is my connection degrading?",
];

function ChatBubble({ message }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, x: isUser ? 8 : -8 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1.5, gap: 1 }}>
        {!isUser && (
          <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'rgba(240,194,75,0.15)',
            border: '1px solid rgba(240,194,75,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.5 }}>
            <SmartToyIcon sx={{ fontSize: 15, color: GOLD }} />
          </Box>
        )}
        <Paper sx={{
          p: 1.5, maxWidth: '75%',
          background: isUser
            ? 'linear-gradient(135deg, #f6d978, #f0c24b)'
            : (isDark ? '#111' : '#f8f8f8'),
          color: isUser ? '#000' : 'inherit',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          border: isUser ? 'none' : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        }}>
          <Typography variant="body2" sx={{ fontWeight: isUser ? 600 : 400, lineHeight: 1.55 }}>
            {message.content}
          </Typography>
          {message.data?.avg_speed_mbps && (
            <Stack direction="row" gap={0.5} mt={1} flexWrap="wrap">
              <Chip label={`↓ ${message.data.avg_speed_mbps} Mbps`} size="small" sx={{ fontWeight: 700, fontSize: 10, bgcolor: 'rgba(67,160,71,0.15)', color: '#43A047' }} />
              {message.data.avg_ping_ms && (
                <Chip label={`${message.data.avg_ping_ms} ms ping`} size="small" sx={{ fontWeight: 700, fontSize: 10, bgcolor: `rgba(240,194,75,0.15)`, color: GOLD }} />
              )}
            </Stack>
          )}
          {message.data?.best_hours?.length > 0 && (
            <Stack direction="row" gap={0.5} mt={1} flexWrap="wrap">
              {message.data.best_hours.slice(0, 4).map((h, i) => (
                <Chip key={i} label={`${h.hour}:00 · ${h.avg_speed_mbps} Mbps`} size="small"
                  sx={{ fontWeight: 700, fontSize: 10, bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047' }} />
              ))}
            </Stack>
          )}
        </Paper>
        {isUser && (
          <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'rgba(240,194,75,0.2)',
            border: '1px solid rgba(240,194,75,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.5 }}>
            <PersonIcon sx={{ fontSize: 15, color: GOLD }} />
          </Box>
        )}
      </Box>
    </motion.div>
  );
}

function ChatbotPanel() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [chatLoading, setLoading] = useState(false);
  const messagesEndRef             = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (question) => {
    const q = question || input;
    if (!q?.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await askNaturalQuery(q);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: res.data.answer || "I couldn't find an answer to that question.",
        data: res.data,
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.15)' }}>
      <Stack direction="row" gap={1} alignItems="center" mb={2}>
        <ChatIcon sx={{ color: GOLD, fontSize: 22 }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>AI Troubleshooting Assistant</Typography>
          <Typography variant="caption" color="text.secondary">Ask anything about your network performance</Typography>
        </Box>
      </Stack>

      {/* Suggested questions */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.disabled" fontWeight={600} display="block" mb={1}>
          Suggested questions:
        </Typography>
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {SUGGESTED.map((q, i) => (
            <Chip
              key={i}
              label={q}
              size="small"
              onClick={() => send(q)}
              disabled={chatLoading}
              variant="outlined"
              sx={{
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                borderColor: 'rgba(240,194,75,0.3)', color: 'text.secondary',
                '&:hover': { borderColor: GOLD, color: GOLD, bgcolor: 'rgba(240,194,75,0.06)' },
              }}
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Chat window */}
      <Box sx={{
        height: 380, overflowY: 'auto', mb: 2, p: 1.5,
        bgcolor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.02)',
        borderRadius: 2, border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'}`,
      }}>
        {messages.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
            <AutoAwesomeIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.disabled">Start a conversation by asking a question above</Typography>
          </Box>
        ) : (
          <>
            {messages.map((msg, i) => <ChatBubble key={i} message={msg} />)}
            {chatLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 4 }}>
                <Box sx={{ display: 'flex', gap: 0.4 }}>
                  {[0, 0.15, 0.3].map((d) => (
                    <motion.div key={d} animate={{ y: [-3, 0, -3] }} transition={{ duration: 0.6, delay: d, repeat: Infinity }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: GOLD }} />
                    </motion.div>
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary">Analyzing…</Typography>
              </Box>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); send(); }}>
        <TextField
          fullWidth
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your network performance…"
          disabled={chatLoading}
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(240,194,75,0.4)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: GOLD },
            },
          }}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton type="submit" disabled={chatLoading || !input.trim()} size="small"
                    sx={{ color: GOLD, '&:disabled': { color: 'text.disabled' } }}>
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </form>
    </Paper>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AIInsightsEnhancedPage() {
  const [loading,       setLoading]     = useState(false);
  const [rootCause,     setRootCause]   = useState(null);
  const [maintenance,   setMaintenance] = useState(null);
  const [anomalies,     setAnomalies]   = useState(null);
  const [error,         setError]       = useState(null);
  const [sensitivity,   setSensitivity] = useState(2.0);

  const loadAll = async (sens = sensitivity) => {
    setLoading(true);
    setError(null);
    try {
      const [rc, maint, anom] = await Promise.all([
        getRootCause(48),
        getPredictiveMaintenance(),
        getAnomaliesAdvanced(sens),
      ]);
      setRootCause(rc.data);
      setMaintenance(maint.data);
      setAnomalies(anom.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load AI insights');
    } finally {
      setLoading(false);
    }
  };

  const handleSensitivity = async (v) => {
    setSensitivity(v);
    try {
      const res = await getAnomaliesAdvanced(v);
      setAnomalies(res.data);
    } catch {}
  };

  useEffect(() => { loadAll(); }, []);

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1100, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader loading={loading} onRefresh={() => loadAll()} />
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <Stack spacing={3}>
        {/* Root Cause — full width */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <RootCausePanel data={rootCause} loading={loading} />
        </motion.div>

        {/* Predictive + Anomaly — side by side */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Box flex={1}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <PredictivePanel data={maintenance} loading={loading} />
            </motion.div>
          </Box>
          <Box flex={1}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <AnomalyPanel data={anomalies} loading={loading} sensitivity={sensitivity} onSensitivityChange={handleSensitivity} />
            </motion.div>
          </Box>
        </Stack>

        {/* Chatbot — full width */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <ChatbotPanel />
        </motion.div>
      </Stack>
    </Box>
  );
}
