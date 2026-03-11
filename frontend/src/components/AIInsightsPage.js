import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Typography, Paper, Chip, CircularProgress, Grid,
  ToggleButtonGroup, ToggleButton, LinearProgress, useTheme,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { getAIInsights } from '../services/api';

const SEVERITY_CONFIG = {
  error:   { color: '#EF5350', bg: 'rgba(239,83,80,0.08)',  border: 'rgba(239,83,80,0.2)',  Icon: ErrorOutlineIcon },
  warning: { color: '#FFA726', bg: 'rgba(255,167,38,0.08)', border: 'rgba(255,167,38,0.2)', Icon: WarningAmberIcon },
  info:    { color: '#42A5F5', bg: 'rgba(66,165,245,0.08)', border: 'rgba(66,165,245,0.2)', Icon: InfoOutlinedIcon },
};

function HourBar({ hour, value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const color = pct > 70 ? '#EF5350' : pct > 40 ? '#FFA726' : '#43A047';
  const label = `${String(hour).padStart(2, '0')}:00`;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 42, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {label}
      </Typography>
      <LinearProgress variant="determinate" value={pct}
        sx={{ flex: 1, height: 10, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: 5 } }} />
      <Typography variant="caption" fontWeight={700} sx={{ color, minWidth: 50, textAlign: 'right' }}>
        {value} Mbps
      </Typography>
    </Box>
  );
}

export default function AIInsightsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(168);

  useEffect(() => {
    setLoading(true);
    getAIInsights(hours)
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hours]);

  const hourlyEntries = data?.hourly_averages
    ? Object.entries(data.hourly_averages).map(([h, v]) => ({ hour: parseInt(h), value: v })).sort((a, b) => a.hour - b.hour)
    : [];
  const maxHourly = hourlyEntries.length > 0 ? Math.max(...hourlyEntries.map((e) => e.value)) : 1;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1100, mx: 'auto' }}>
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
              <AutoAwesomeIcon sx={{ color: '#f0c24b', fontSize: 28 }} />
              <Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>AI Network Insights</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  Statistical pattern analysis · congestion detection · speed forecasting
                </Typography>
              </Box>
            </Box>
            <ToggleButtonGroup value={hours} exclusive onChange={(_, v) => v && setHours(v)} size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.6)', border: 0, px: 2, '&.Mui-selected': { bgcolor: '#f0c24b', color: '#000', fontWeight: 800 } } }}>
              {[24, 72, 168].map((h) => <ToggleButton key={h} value={h}>{h === 24 ? '24h' : h === 72 ? '3d' : '7d'}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
        </Paper>
      </motion.div>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress sx={{ color: '#f0c24b', mb: 2 }} />
            <Typography color="text.secondary">Analyzing network patterns…</Typography>
          </Box>
        </Box>
      ) : !data || data.trend === 'insufficient_data' ? (
        <Paper sx={{ p: 6, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
          <AutoAwesomeIcon sx={{ fontSize: 52, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" fontWeight={700} color="text.secondary" gutterBottom>Not Enough Data Yet</Typography>
          <Typography variant="body2" color="text.disabled">
            AI Insights need at least 3 measurements to detect patterns.
            Currently have {data?.data_points ?? 0} data points.
          </Typography>
          <Typography variant="caption" color="text.disabled" display="block" mt={1}>
            Run a few speed tests to start generating insights.
          </Typography>
        </Paper>
      ) : (
        <Box>
          {/* Summary row */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              {
                label: 'Speed Trend',
                value: data.trend === 'improving' ? `+${data.trend_pct}%` : data.trend === 'degrading' ? `${data.trend_pct}%` : 'Stable',
                color: data.trend === 'improving' ? '#43A047' : data.trend === 'degrading' ? '#EF5350' : '#94A3B8',
                Icon: data.trend === 'improving' ? TrendingUpIcon : data.trend === 'degrading' ? TrendingDownIcon : TrendingFlatIcon,
              },
              {
                label: 'Avg Download',
                value: data.overall_avg_download ? `${data.overall_avg_download} Mbps` : 'N/A',
                color: '#f0c24b',
                Icon: TrendingFlatIcon,
              },
              {
                label: 'Data Points',
                value: data.data_points,
                color: '#42A5F5',
                Icon: InfoOutlinedIcon,
              },
              {
                label: 'Insights Found',
                value: data.insights.length,
                color: data.insights.length > 0 ? '#FFA726' : '#43A047',
                Icon: AutoAwesomeIcon,
              },
            ].map(({ label, value, color, Icon }, i) => (
              <Grid size={{ xs: 6, md: 3 }} key={label}>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Paper sx={{ p: 2, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: `1px solid ${color}25` }}>
                    <Icon sx={{ fontSize: 24, color, mb: 0.5 }} />
                    <Typography variant="h6" fontWeight={900} sx={{ color }}>{value}</Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
                  </Paper>
                </motion.div>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={3}>
            {/* Insights list */}
            <Grid size={{ xs: 12, md: data.insights.length > 0 ? 7 : 12 }}>
              {data.insights.length > 0 ? (
                <Paper sx={{ p: 3, height: '100%', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AutoAwesomeIcon sx={{ color: '#f0c24b', fontSize: 20 }} />
                    Detected Patterns
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {data.insights.map((insight, i) => {
                      const cfg = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.info;
                      const InsightIcon = cfg.Icon;
                      return (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                          <Box sx={{ p: 2, borderRadius: 2, bgcolor: cfg.bg, border: `1px solid ${cfg.border}` }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <InsightIcon sx={{ fontSize: 16, color: cfg.color }} />
                              <Typography variant="subtitle2" fontWeight={800} sx={{ color: cfg.color }}>{insight.title}</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, fontSize: 13 }}>
                              {insight.message}
                            </Typography>
                            {insight.type === 'congestion' && insight.data?.hours?.length > 0 && (
                              <Box sx={{ mt: 1, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                                {insight.data.hours.map((h) => (
                                  <Chip key={h} label={`${String(h).padStart(2, '0')}:00`}
                                    size="small" icon={<AccessTimeIcon style={{ fontSize: 12 }} />}
                                    sx={{ fontWeight: 700, fontSize: 10, bgcolor: 'rgba(255,167,38,0.12)', color: '#FFA726' }} />
                                ))}
                              </Box>
                            )}
                            {insight.type === 'optimal_time' && insight.data?.hours?.length > 0 && (
                              <Box sx={{ mt: 1, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                                {insight.data.hours.map((h) => (
                                  <Chip key={h} label={`${String(h).padStart(2, '0')}:00`}
                                    size="small" icon={<AccessTimeIcon style={{ fontSize: 12 }} />}
                                    sx={{ fontWeight: 700, fontSize: 10, bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047' }} />
                                ))}
                              </Box>
                            )}
                          </Box>
                        </motion.div>
                      );
                    })}
                  </Box>
                </Paper>
              ) : (
                <Paper sx={{ p: 4, textAlign: 'center', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
                  <AutoAwesomeIcon sx={{ fontSize: 40, color: '#43A047', mb: 1 }} />
                  <Typography fontWeight={700} color="text.secondary">No Anomalies Detected</Typography>
                  <Typography variant="caption" color="text.disabled">Your connection appears stable over this period.</Typography>
                </Paper>
              )}
            </Grid>

            {/* Hourly speed chart */}
            {hourlyEntries.length > 0 && (
              <Grid size={{ xs: 12, md: 5 }}>
                <Paper sx={{ p: 3, height: '100%', background: isDark ? '#080808' : '#fff', border: '1px solid rgba(240,194,75,0.18)' }}>
                  <Typography variant="h6" fontWeight={700} gutterBottom>Hourly Speed Profile</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                    Average download by hour of day · green = fast, red = congested
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {hourlyEntries.map(({ hour, value }) => (
                      <HourBar key={hour} hour={hour} value={value} max={maxHourly} />
                    ))}
                  </Box>

                  {/* Best/worst highlights */}
                  <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {data.best_hours.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>Best hours</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {data.best_hours.map((h) => (
                            <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} size="small"
                              sx={{ fontWeight: 700, fontSize: 10, bgcolor: 'rgba(67,160,71,0.12)', color: '#43A047' }} />
                          ))}
                        </Box>
                      </Box>
                    )}
                    {data.peak_congestion_hours.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>Peak congestion</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {data.peak_congestion_hours.slice(0, 3).map((h) => (
                            <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} size="small"
                              sx={{ fontWeight: 700, fontSize: 10, bgcolor: 'rgba(239,83,80,0.12)', color: '#EF5350' }} />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Paper>
              </Grid>
            )}
          </Grid>
        </Box>
      )}
    </Box>
  );
}
