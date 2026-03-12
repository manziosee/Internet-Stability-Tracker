import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Paper, Typography, CircularProgress, Chip, Alert, Card, CardContent,
  useTheme, LinearProgress, Button, Stack, Divider, Accordion,
  AccordionSummary, AccordionDetails, Tooltip, Skeleton,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import VideocamIcon from '@mui/icons-material/Videocam';
import RouterIcon from '@mui/icons-material/Router';
import ChecklistIcon from '@mui/icons-material/Checklist';
import PublicIcon from '@mui/icons-material/Public';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SpeedIcon from '@mui/icons-material/Speed';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import {
  getGamingMetrics,
  getVideoCallQuality,
  getRouterHealth,
  getActivityRecommendations,
  getIsItJustMe
} from '../services/api';

// ── Colours & helpers ─────────────────────────────────────────────────────────
const GOLD = '#f0c24b';

const gradeColor = (g) => {
  if (!g || g === 'N/A') return '#9E9E9E';
  if (g === 'A+' || g === 'A') return '#43A047';
  if (g === 'B') return '#66BB6A';
  if (g === 'C') return '#FFA726';
  if (g === 'D') return '#EF5350';
  return '#B71C1C';
};

const statusColor = {
  excellent: '#43A047',
  good: '#66BB6A',
  fair: '#FFA726',
  poor: '#EF5350',
};

function CardSkeleton() {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Skeleton variant="rectangular" height={20} width="60%" sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={80} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={16} width="80%" />
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, color, title, subtitle }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
      <Icon sx={{ fontSize: 26, color }} />
      <Box>
        <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.2 }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </Box>
    </Box>
  );
}

// ── Gaming Mode ───────────────────────────────────────────────────────────────
function GamingCard({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <CardSkeleton />;

  const hasData = data && !data.error && data.grade !== 'N/A';
  const score = Number(data?.gaming_score) || 0;
  const gc = gradeColor(data?.grade);

  return (
    <Card sx={{ height: '100%', background: isDark ? '#0a0a0a' : '#fff', border: `1px solid ${gc}33` }}>
      <CardContent>
        <SectionHeader icon={SportsEsportsIcon} color="#AB47BC" title="🎮 Gaming Mode"
          subtitle={hasData ? `${data.data_points} readings · last ${data.hours_analyzed}h` : 'Run a speed test first'} />

        {hasData ? (
          <Stack spacing={2}>
            {/* Score dial + metrics */}
            <Stack direction="row" alignItems="center" spacing={3}>
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <CircularProgress variant="determinate" value={100} size={90} thickness={4}
                  sx={{ color: isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0', position: 'absolute' }} />
                <CircularProgress variant="determinate" value={Math.min(score, 100)} size={90} thickness={4}
                  sx={{ color: gc }} />
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="h5" fontWeight={900} sx={{ color: gc, lineHeight: 1 }}>{data.grade}</Typography>
                  <Typography variant="caption" color="text.secondary">{score.toFixed(0)}/100</Typography>
                </Box>
              </Box>
              <Stack spacing={0.5}>
                <MetricRow label="Ping" value={`${data.avg_ping}ms`}
                  subtext={`${data.min_ping}–${data.max_ping}ms range`}
                  color={data.avg_ping < 50 ? '#43A047' : data.avg_ping < 100 ? '#FFA726' : '#EF5350'} />
                <MetricRow label="Jitter" value={`${data.jitter}ms`}
                  color={data.jitter < 5 ? '#43A047' : data.jitter < 15 ? '#FFA726' : '#EF5350'} />
                <MetricRow label="Packet Loss" value={`${data.packet_loss}%`}
                  color={data.packet_loss === 0 ? '#43A047' : data.packet_loss < 2 ? '#FFA726' : '#EF5350'} />
              </Stack>
            </Stack>

            {/* Recommended games */}
            {data.recommended_for?.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing={0.5}>
                  ✅ Recommended Games
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {data.recommended_for.map((g) => (
                    <Chip key={g} label={g} size="small"
                      sx={{ bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047', fontSize: '0.7rem' }} />
                  ))}
                </Box>
              </Box>
            )}

            {/* Not recommended accordion */}
            {data.not_recommended?.length > 0 && (
              <Accordion disableGutters elevation={0}
                sx={{ bgcolor: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={{ minHeight: 36, py: 0 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    ❌ Not recommended ({data.not_recommended.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Stack spacing={0.5}>
                    {data.not_recommended.map((g) => (
                      <Box key={g.name}>
                        <Typography variant="caption" fontWeight={700}>{g.name}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.68rem' }}>
                          {g.reason}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Analysis summary */}
            <Alert severity={score >= 80 ? 'success' : score >= 60 ? 'info' : score >= 40 ? 'warning' : 'error'}
              sx={{ py: 0.5, fontSize: '0.78rem' }}>
              {score >= 80 ? 'Excellent connection — suitable for competitive gaming.' :
               score >= 60 ? 'Good for most games. Competitive FPS may experience occasional lag.' :
               score >= 40 ? 'Fair — casual gaming OK. Reduce background traffic for better results.' :
               'Poor gaming connection. Try wired Ethernet or restart your router.'}
            </Alert>
          </Stack>
        ) : (
          <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
            {data?.error || 'Run a speed test to see your gaming score'}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value, subtext, color }) {
  return (
    <Box>
      <Stack direction="row" spacing={0.5} alignItems="baseline">
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70 }}>{label}:</Typography>
        <Typography variant="body2" fontWeight={700} sx={{ color }}>{value}</Typography>
      </Stack>
      {subtext && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', ml: '70px' }}>{subtext}</Typography>}
    </Box>
  );
}

// ── Video Call Quality ────────────────────────────────────────────────────────
const PLATFORM_META = {
  zoom:         { label: 'Zoom',        color: '#2D8CFF', emoji: '📘' },
  teams:        { label: 'MS Teams',    color: '#6264A7', emoji: '🟣' },
  google_meet:  { label: 'Google Meet', color: '#00897B', emoji: '🟢' },
};

function VideoCallCard({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <CardSkeleton />;

  const hasData = data && !data.error;

  return (
    <Card sx={{ height: '100%', background: isDark ? '#0a0a0a' : '#fff' }}>
      <CardContent>
        <SectionHeader icon={VideocamIcon} color="#2196F3" title="📹 Video Calls"
          subtitle={hasData ? `${data.current_speed?.download} ↓ / ${data.current_speed?.upload} ↑ Mbps · ${data.current_speed?.ping}ms ping` : 'Run a speed test first'} />

        {hasData ? (
          <Stack spacing={2}>
            {/* Platform cards */}
            <Stack spacing={1}>
              {Object.entries(data.platforms).map(([key, info]) => {
                const meta = PLATFORM_META[key] || { label: key, color: '#9E9E9E', emoji: '📹' };
                const qualityColor = info.quality === 'HD 1080p' ? '#43A047' : info.quality === 'HD 720p' ? '#FFA726' : '#EF5350';
                return (
                  <Box key={key} sx={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#f7f7f7',
                    border: `1px solid ${meta.color}30`,
                  }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontSize: 18 }}>{meta.emoji}</Typography>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>{meta.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Ping: {info.ping}ms · Status: {info.status}
                        </Typography>
                      </Box>
                    </Stack>
                    <Box textAlign="right">
                      <Chip label={info.quality} size="small"
                        sx={{ bgcolor: `${qualityColor}18`, color: qualityColor, fontWeight: 700, fontSize: '0.68rem' }} />
                      <Typography variant="caption" color="text.secondary" display="block">
                        {info.participants}+ participants
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Stack>

            {/* Recommendations */}
            {data.recommendations?.length > 0 && (
              <Stack spacing={0.5}>
                {data.recommendations.map((rec, i) => (
                  <Typography key={i} variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                    {rec}
                  </Typography>
                ))}
              </Stack>
            )}

            {/* Overall badge */}
            <Chip
              label={`Overall: ${(data.overall_status || 'unknown').toUpperCase()}`}
              size="small"
              sx={{
                alignSelf: 'flex-start',
                bgcolor: `${statusColor[data.overall_status] || '#9E9E9E'}18`,
                color: statusColor[data.overall_status] || '#9E9E9E',
                fontWeight: 700,
              }}
            />
          </Stack>
        ) : (
          <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
            {data?.error || 'Run a speed test to see video call quality'}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ── Router Health ─────────────────────────────────────────────────────────────
function RouterHealthCard({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <CardSkeleton />;

  const hasData = data && !data.error;
  const needsReboot = data?.needs_reboot;
  const confidence = data?.confidence ?? 0;
  const statusCol = needsReboot ? '#FF9800' : '#43A047';

  return (
    <Card sx={{ height: '100%', background: isDark ? '#0a0a0a' : '#fff', border: `1px solid ${statusCol}33` }}>
      <CardContent>
        <SectionHeader icon={RouterIcon} color="#FF9800" title="🚨 Router Health"
          subtitle={hasData ? `Last reboot: ${data.last_reboot_estimate}` : undefined} />

        {hasData ? (
          <Stack spacing={2}>
            {/* Status badge */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {needsReboot
                ? <WarningIcon sx={{ color: '#FF9800', fontSize: 32 }} />
                : <CheckCircleIcon sx={{ color: '#43A047', fontSize: 32 }} />}
              <Box>
                <Typography variant="h6" fontWeight={800} sx={{ color: statusCol }}>
                  {needsReboot ? 'Reboot Recommended' : 'Router OK'}
                </Typography>
                <Typography variant="caption" color="text.secondary">{confidence}% confidence</Typography>
              </Box>
            </Box>

            {/* Confidence bar */}
            <Box>
              <LinearProgress variant="determinate" value={confidence}
                sx={{
                  height: 8, borderRadius: 4,
                  bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
                  '& .MuiLinearProgress-bar': { bgcolor: statusCol, borderRadius: 4 },
                }} />
            </Box>

            {/* Metrics grid */}
            {data.metrics && (
              <Box sx={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: 1, p: 1.5, borderRadius: 1.5,
                bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#f7f7f7',
              }}>
                <MetricBox label="Speed Δ"
                  value={`${data.metrics.speed_change_pct > 0 ? '+' : ''}${data.metrics.speed_change_pct}%`}
                  color={data.metrics.speed_change_pct < -20 ? '#EF5350' : data.metrics.speed_change_pct < 0 ? '#FFA726' : '#43A047'} />
                <MetricBox label="Ping Δ"
                  value={`${data.metrics.ping_change_ms > 0 ? '+' : ''}${data.metrics.ping_change_ms}ms`}
                  color={data.metrics.ping_change_ms > 50 ? '#EF5350' : data.metrics.ping_change_ms > 20 ? '#FFA726' : '#43A047'} />
                <MetricBox label="Drops"
                  value={data.metrics.disconnections}
                  color={data.metrics.disconnections >= 3 ? '#EF5350' : data.metrics.disconnections > 0 ? '#FFA726' : '#43A047'} />
              </Box>
            )}

            {/* Reasons */}
            <Stack spacing={0.5}>
              {data.reasons.map((r, i) => (
                <Typography key={i} variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                  • {r}
                </Typography>
              ))}
            </Stack>

            {/* Recommendation */}
            <Alert severity={needsReboot ? 'warning' : 'success'} sx={{ py: 0.5, fontSize: '0.78rem' }}>
              {data.recommendation}
            </Alert>
          </Stack>
        ) : (
          <Box>
            <Alert severity="info" sx={{ fontSize: '0.85rem', mb: 1.5 }}>
              {data?.error || 'Need at least 5 measurements in 24h for router analysis'}
            </Alert>
            <Typography variant="caption" color="text.secondary">
              Run multiple speed tests throughout the day to enable router health monitoring.
              The system needs at least 5 measurements to detect performance trends and degradation patterns.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBox({ label, value, color }) {
  return (
    <Box textAlign="center">
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body2" fontWeight={700} sx={{ color }}>{value}</Typography>
    </Box>
  );
}

// ── What Can I Do? ────────────────────────────────────────────────────────────
const CATEGORY_LABELS = {
  streaming:   { label: 'Streaming',    color: '#E91E63' },
  video_calls: { label: 'Video Calls',  color: '#2196F3' },
  gaming:      { label: 'Gaming',       color: '#9C27B0' },
  downloads:   { label: 'Downloads',    color: '#FF9800' },
  browsing:    { label: 'Browsing',     color: '#4CAF50' },
};

function ActivityCard({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <CardSkeleton />;

  const hasData = data && !data.error;

  return (
    <Card sx={{ height: '100%', background: isDark ? '#0a0a0a' : '#fff' }}>
      <CardContent>
        <SectionHeader icon={ChecklistIcon} color="#4CAF50" title="📊 What Can I Do?"
          subtitle={hasData
            ? `${data.current_speed} Mbps · ${data.current_ping}ms · ${data.total_recommended}/${data.total_activities} activities OK`
            : 'Run a speed test first'} />

        {hasData ? (
          <Stack spacing={2}>
            {/* Speed summary */}
            <Stack direction="row" spacing={1.5} alignItems="center">
              <SpeedIcon sx={{ color: GOLD, fontSize: 18 }} />
              <Typography variant="body2" fontWeight={700}>
                {data.current_speed} Mbps download · {data.current_ping}ms latency
              </Typography>
            </Stack>

            {/* Best activity highlight */}
            {data.best_activity && (
              <Box sx={{
                p: 1.5, borderRadius: 1.5, border: `1px solid rgba(67,160,71,0.3)`,
                bgcolor: 'rgba(67,160,71,0.06)',
              }}>
                <Typography variant="caption" color="text.secondary" display="block">Best right now:</Typography>
                <Typography variant="body2" fontWeight={800} sx={{ color: '#43A047' }}>
                  {data.best_activity}
                </Typography>
              </Box>
            )}

            <Divider />

            {/* Recommended — grouped by category */}
            {Object.entries(data.by_category || {}).map(([cat, acts]) => {
              const meta = CATEGORY_LABELS[cat] || { label: cat, color: '#9E9E9E' };
              return (
                <Box key={cat}>
                  <Typography variant="caption" fontWeight={700} sx={{ color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {meta.label}
                  </Typography>
                  <Stack spacing={0.3} sx={{ mt: 0.5 }}>
                    {acts.map((a, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                        <CheckCircleIcon sx={{ fontSize: 13, color: '#43A047', flexShrink: 0 }} />
                        <Typography variant="caption">{a.icon} {a.name}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              );
            })}

            {/* Not recommended accordion */}
            {data.not_recommended?.length > 0 && (
              <Accordion disableGutters elevation={0}
                sx={{ bgcolor: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={{ minHeight: 36, py: 0 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    ❌ Not available ({data.not_recommended.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Stack spacing={0.5}>
                    {data.not_recommended.map((a, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.7 }}>
                        <CancelIcon sx={{ fontSize: 13, color: '#EF5350', mt: 0.2, flexShrink: 0 }} />
                        <Box>
                          <Typography variant="caption" fontWeight={600}>{a.icon} {a.name}</Typography>
                          {a.reason && (
                            <Typography variant="caption" color="text.disabled" display="block" sx={{ fontSize: '0.68rem' }}>
                              {a.reason}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}
          </Stack>
        ) : (
          <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
            {data?.error || 'Run a speed test to see activity recommendations'}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ── Is It Just Me? ────────────────────────────────────────────────────────────
const SERVICE_ICONS = { google: '🔍', cloudflare: '🟠', aws: '☁️' };

function IsItJustMeCard({ data, loading }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (loading) return <CardSkeleton />;

  const hasData = data && !data.error;

  return (
    <Card sx={{ background: isDark ? '#0a0a0a' : '#fff' }}>
      <CardContent>
        <SectionHeader icon={PublicIcon} color="#9C27B0" title="🌍 Is It Just Me?"
          subtitle={hasData && data.checked_at
            ? `Checked at ${new Date(data.checked_at).toLocaleTimeString()}`
            : 'Real-time global outage check'} />

        {hasData ? (
          <Grid container spacing={2}>
            {/* Verdict panel */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{
                p: 2.5, textAlign: 'center', height: '100%',
                bgcolor: data.is_just_you ? 'rgba(255,152,0,0.08)' : 'rgba(156,39,176,0.08)',
                border: `2px solid ${data.is_just_you ? 'rgba(255,152,0,0.3)' : 'rgba(156,39,176,0.3)'}`,
                borderRadius: 2,
              }}>
                <Typography sx={{ fontSize: 48, lineHeight: 1, mb: 1 }}>
                  {data.is_just_you ? '🏠' : '🌍'}
                </Typography>
                <Typography variant="h6" fontWeight={800}>{data.verdict}</Typography>
                <Chip
                  label={data.my_status === 'outage' ? '⚠️ Outage Detected' : '✅ Connection OK'}
                  size="small"
                  sx={{
                    mt: 1,
                    bgcolor: data.my_status === 'outage' ? 'rgba(239,83,80,0.15)' : 'rgba(67,160,71,0.15)',
                    color: data.my_status === 'outage' ? '#EF5350' : '#43A047',
                    fontWeight: 700,
                  }}
                />
              </Paper>
            </Grid>

            {/* Details panel */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={2} height="100%">
                {/* ISP stats */}
                <Box sx={{
                  p: 1.5, borderRadius: 1.5,
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#f7f7f7',
                }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
                    ISP Analysis
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ mt: 0.5 }} flexWrap="wrap">
                    <Box>
                      <Typography variant="caption" color="text.secondary">Your ISP</Typography>
                      <Typography variant="body2" fontWeight={700}>{data.isp || 'Unknown'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Affected Users</Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {data.affected_users} / {data.total_users_checked}
                        {data.total_users_checked > 0
                          ? ` (${data.outage_percentage}%)`
                          : ' — you\'re the first to check!'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Measurements Compared</Typography>
                      <Typography variant="body2" fontWeight={700}>{data.total_measurements}</Typography>
                    </Box>
                  </Stack>
                  {data.total_users_checked === 0 && (
                    <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                      No other users on your ISP in the last 30 minutes. The check is based on external service reachability.
                    </Typography>
                  )}
                </Box>

                {/* External services */}
                <Box>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
                    External Services
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} flexWrap="wrap">
                    {Object.entries(data.external_services || {}).map(([svc, ok]) => (
                      <Tooltip key={svc} title={ok ? `${svc} is reachable` : `${svc} is unreachable`}>
                        <Chip
                          label={`${SERVICE_ICONS[svc] || '🌐'} ${svc}`}
                          size="small"
                          icon={ok ? <CheckCircleIcon /> : <CancelIcon />}
                          sx={{
                            bgcolor: ok ? 'rgba(67,160,71,0.12)' : 'rgba(239,83,80,0.12)',
                            color: ok ? '#43A047' : '#EF5350',
                            fontWeight: 600,
                            '& .MuiChip-icon': { fontSize: 14 },
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Stack>
                </Box>

                {/* Recommendation */}
                <Alert
                  severity={data.is_just_you ? 'warning' : !Object.values(data.external_services || {}).some(Boolean) ? 'error' : 'info'}
                  sx={{ fontSize: '0.82rem', mt: 'auto' }}
                  icon={<SignalCellularAltIcon />}
                >
                  {data.recommendation}
                </Alert>
              </Stack>
            </Grid>
          </Grid>
        ) : (
          <Alert severity="info">
            {data?.error || 'Run a speed test to check if the issue is local or widespread'}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function CoolFeaturesPage() {
  const [gaming, setGaming]         = useState(null);
  const [video, setVideo]           = useState(null);
  const [router, setRouter]         = useState(null);
  const [activities, setActivities] = useState(null);
  const [isItJustMe, setIsItJustMe] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [g, v, r, a, i] = await Promise.all([
        getGamingMetrics(1).catch(() => null),
        getVideoCallQuality().catch(() => null),
        getRouterHealth().catch(() => null),
        getActivityRecommendations().catch(() => null),
        getIsItJustMe().catch(() => null),
      ]);
      setGaming(g?.data ?? null);
      setVideo(v?.data ?? null);
      setRouter(r?.data ?? null);
      setActivities(a?.data ?? null);
      setIsItJustMe(i?.data ?? null);
    } catch (err) {
      console.error('Failed to fetch cool features:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(false), 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>
              🔥 Cool Features
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time insights about your connection — auto-refreshes every 30 seconds
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={() => fetchAll(true)}
            disabled={loading || refreshing}
            sx={{ borderColor: `rgba(240,194,75,0.4)`, color: GOLD,
              '&:hover': { borderColor: GOLD, bgcolor: 'rgba(240,194,75,0.06)' } }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh All'}
          </Button>
        </Box>
      </motion.div>

      <Grid container spacing={3}>
        {/* Gaming */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <GamingCard data={gaming} loading={loading} />
          </motion.div>
        </Grid>

        {/* Video Calls */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <VideoCallCard data={video} loading={loading} />
          </motion.div>
        </Grid>

        {/* Router Health */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <RouterHealthCard data={router} loading={loading} />
          </motion.div>
        </Grid>

        {/* What Can I Do? */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <ActivityCard data={activities} loading={loading} />
          </motion.div>
        </Grid>

        {/* Is It Just Me — full width */}
        <Grid size={{ xs: 12 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <IsItJustMeCard data={isItJustMe} loading={loading} />
          </motion.div>
        </Grid>
      </Grid>
    </Box>
  );
}

export default CoolFeaturesPage;
