import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Paper, Typography, Grid, CircularProgress, Chip, Alert,
  ToggleButtonGroup, ToggleButton, Card, CardContent,
  useTheme
} from '@mui/material';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { getGamingMetrics } from '../services/api';

function GamingModePage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(1);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  const fetchData = async () => {
    try {
      const res = await getGamingMetrics(timeRange);
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch gaming metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data || data.error) {
    return (
      <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1200, mx: 'auto' }}>
        <Alert severity="info">
          {data?.error || 'No gaming data available. Run a speed test first!'}
        </Alert>
      </Box>
    );
  }

  const gradeColor = 
    data.grade === 'A+' || data.grade === 'A' ? '#43A047' :
    data.grade === 'B' ? '#66BB6A' :
    data.grade === 'C' ? '#FFA726' :
    data.grade === 'D' ? '#FF7043' : '#EF5350';

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ 
              bgcolor: 'rgba(156,39,176,0.15)', 
              borderRadius: 2, 
              p: 1.5, 
              border: '1px solid rgba(156,39,176,0.3)' 
            }}>
              <SportsEsportsIcon sx={{ fontSize: 32, color: '#AB47BC' }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>
                🎮 Gaming Mode
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Latency, jitter, and gaming quality analysis
              </Typography>
            </Box>
          </Box>

          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(_, v) => v && setTimeRange(v)}
            size="small"
          >
            {[1, 3, 6, 12, 24].map((h) => (
              <ToggleButton key={h} value={h}>{h}h</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </motion.div>

      {/* Gaming Score Card */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
        <Paper sx={{ 
          p: 4, 
          mb: 3, 
          background: `linear-gradient(135deg, ${gradeColor}15 0%, ${gradeColor}05 100%)`,
          border: `2px solid ${gradeColor}40`,
          textAlign: 'center'
        }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Gaming Quality Score
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, my: 2 }}>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress
                variant="determinate"
                value={100}
                size={120}
                thickness={4}
                sx={{ color: isDark ? 'rgba(255,255,255,0.1)' : '#f0f0f0', position: 'absolute' }}
              />
              <CircularProgress
                variant="determinate"
                value={data.gaming_score}
                size={120}
                thickness={4}
                sx={{ color: gradeColor }}
              />
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <Typography variant="h3" fontWeight={900} sx={{ color: gradeColor }}>
                  {data.gaming_score}
                </Typography>
                <Typography variant="caption" color="text.secondary">/ 100</Typography>
              </Box>
            </Box>
            <Box sx={{ textAlign: 'left' }}>
              <Chip 
                label={`Grade ${data.grade}`} 
                sx={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 900, 
                  height: 50, 
                  px: 2,
                  bgcolor: `${gradeColor}20`,
                  color: gradeColor,
                  border: `2px solid ${gradeColor}`,
                }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Based on {data.data_points} measurements
              </Typography>
            </Box>
          </Box>
        </Paper>
      </motion.div>

      {/* Metrics Grid */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { label: 'Average Ping', value: `${data.avg_ping}ms`, ideal: '<50ms', status: data.avg_ping < 50 ? 'excellent' : data.avg_ping < 100 ? 'good' : 'poor' },
          { label: 'Jitter', value: `${data.jitter}ms`, ideal: '<10ms', status: data.jitter < 10 ? 'excellent' : data.jitter < 20 ? 'good' : 'poor' },
          { label: 'Packet Loss', value: `${data.packet_loss}%`, ideal: '0%', status: data.packet_loss === 0 ? 'excellent' : data.packet_loss < 1 ? 'good' : 'poor' },
          { label: 'Min Ping', value: `${data.min_ping}ms`, ideal: 'Lower is better', status: 'info' },
          { label: 'Max Ping', value: `${data.max_ping}ms`, ideal: 'Consistency matters', status: 'info' },
        ].map((metric, i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight={700}>
                    {metric.label}
                  </Typography>
                  <Typography variant="h4" fontWeight={900} sx={{ my: 1 }}>
                    {metric.value}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {metric.status === 'excellent' && <CheckCircleIcon sx={{ fontSize: 16, color: '#43A047' }} />}
                    {metric.status === 'poor' && <CancelIcon sx={{ fontSize: 16, color: '#EF5350' }} />}
                    <Typography variant="caption" color="text.secondary">
                      Ideal: {metric.ideal}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </motion.div>
          </Grid>
        ))}
      </Grid>

      {/* Game Recommendations */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CheckCircleIcon sx={{ color: '#43A047' }} />
                <Typography variant="h6" fontWeight={700}>
                  ✅ Recommended Games
                </Typography>
              </Box>
              {data.recommended_for.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {data.recommended_for.map((game, i) => (
                    <Chip
                      key={i}
                      label={game}
                      sx={{ 
                        justifyContent: 'flex-start',
                        bgcolor: 'rgba(67,160,71,0.1)',
                        color: '#43A047',
                        fontWeight: 600,
                        border: '1px solid rgba(67,160,71,0.3)',
                      }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">
                  Your connection isn't optimal for competitive gaming right now.
                </Typography>
              )}
            </Paper>
          </motion.div>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CancelIcon sx={{ color: '#EF5350' }} />
                <Typography variant="h6" fontWeight={700}>
                  ❌ Not Recommended
                </Typography>
              </Box>
              {data.not_recommended.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {data.not_recommended.slice(0, 5).map((game, i) => (
                    <Box key={i}>
                      <Typography variant="body2" fontWeight={700} color="text.primary">
                        {game.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {game.reason}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">
                  Your connection can handle all game types! 🎉
                </Typography>
              )}
            </Paper>
          </motion.div>
        </Grid>
      </Grid>

      {/* Tips */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Paper sx={{ p: 3, mt: 3, bgcolor: isDark ? 'rgba(156,39,176,0.05)' : 'rgba(156,39,176,0.03)' }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            💡 Gaming Tips
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0 }}>
            <li><Typography variant="body2">Use wired Ethernet instead of WiFi for lower ping</Typography></li>
            <li><Typography variant="body2">Close background apps and downloads during gaming</Typography></li>
            <li><Typography variant="body2">Connect to game servers closest to your location</Typography></li>
            <li><Typography variant="body2">Ping under 50ms is ideal for competitive FPS games</Typography></li>
            <li><Typography variant="body2">Jitter (ping variance) should be under 10ms for smooth gameplay</Typography></li>
          </Box>
        </Paper>
      </motion.div>
    </Box>
  );
}

export default GamingModePage;
