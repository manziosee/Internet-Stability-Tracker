import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Paper, Typography, Grid, CircularProgress, Chip, Alert, Card, CardContent,
  useTheme, LinearProgress, Divider, Button
} from '@mui/material';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import VideocamIcon from '@mui/icons-material/Videocam';
import RouterIcon from '@mui/icons-material/Router';
import ChecklistIcon from '@mui/icons-material/Checklist';
import PublicIcon from '@mui/icons-material/Public';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import { 
  getGamingMetrics, 
  getVideoCallQuality, 
  getRouterHealth, 
  getActivityRecommendations,
  getIsItJustMe 
} from '../services/api';

function CoolFeaturesPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  
  const [gaming, setGaming] = useState(null);
  const [video, setVideo] = useState(null);
  const [router, setRouter] = useState(null);
  const [activities, setActivities] = useState(null);
  const [isItJustMe, setIsItJustMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [g, v, r, a, i] = await Promise.all([
        getGamingMetrics(1).catch(() => null),
        getVideoCallQuality().catch(() => null),
        getRouterHealth().catch(() => null),
        getActivityRecommendations().catch(() => null),
        getIsItJustMe().catch(() => null),
      ]);
      setGaming(g?.data);
      setVideo(v?.data);
      setRouter(r?.data);
      setActivities(a?.data);
      setIsItJustMe(i?.data);
    } catch (err) {
      console.error('Failed to fetch cool features:', err);
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
              Real-time insights about your connection
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchAll}
            disabled={loading}
          >
            Refresh All
          </Button>
        </Box>
      </motion.div>

      <Grid container spacing={3}>
        {/* Gaming Metrics */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <SportsEsportsIcon sx={{ fontSize: 28, color: '#AB47BC' }} />
                  <Typography variant="h6" fontWeight={700}>
                    🎮 Gaming Mode
                  </Typography>
                </Box>
                {gaming && !gaming.error ? (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <CircularProgress
                          variant="determinate"
                          value={100}
                          size={80}
                          thickness={4}
                          sx={{ color: isDark ? 'rgba(255,255,255,0.1)' : '#f0f0f0', position: 'absolute' }}
                        />
                        <CircularProgress
                          variant="determinate"
                          value={Number(gaming.gaming_score) || 0}
                          size={80}
                          thickness={4}
                          sx={{ color: '#AB47BC' }}
                        />
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Typography variant="h5" fontWeight={900}>
                            {gaming.grade}
                          </Typography>
                        </Box>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">Ping: {gaming.avg_ping}ms</Typography>
                        <Typography variant="body2" color="text.secondary">Jitter: {gaming.jitter}ms</Typography>
                        <Typography variant="body2" color="text.secondary">Loss: {gaming.packet_loss}%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      ✅ Good for: {gaming.recommended_for.slice(0, 2).join(', ') || 'Casual gaming'}
                    </Typography>
                  </>
                ) : (
                  <Alert severity="info" sx={{ fontSize: '0.85rem' }}>Run a speed test first</Alert>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </Grid>

        {/* Video Call Quality */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <VideocamIcon sx={{ fontSize: 28, color: '#2196F3' }} />
                  <Typography variant="h6" fontWeight={700}>
                    📹 Video Calls
                  </Typography>
                </Box>
                {video && !video.error ? (
                  <>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                      {Object.entries(video.platforms).slice(0, 3).map(([platform, info]) => (
                        <Box key={platform} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2" textTransform="capitalize">
                            {platform.replace('_', ' ')}
                          </Typography>
                          <Chip 
                            label={`${info.quality} · ${info.participants}p`}
                            size="small"
                            sx={{ fontSize: '0.7rem', height: 20 }}
                          />
                        </Box>
                      ))}
                    </Box>
                    <Chip 
                      label={`Status: ${video.overall_status.toUpperCase()}`}
                      size="small"
                      sx={{ 
                        bgcolor: video.overall_status === 'excellent' ? 'rgba(67,160,71,0.15)' : 'rgba(255,167,38,0.15)',
                        color: video.overall_status === 'excellent' ? '#43A047' : '#FFA726',
                      }}
                    />
                  </>
                ) : (
                  <Alert severity="info" sx={{ fontSize: '0.85rem' }}>Run a speed test first</Alert>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </Grid>

        {/* Router Health */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <RouterIcon sx={{ fontSize: 28, color: '#FF9800' }} />
                  <Typography variant="h6" fontWeight={700}>
                    🚨 Router Health
                  </Typography>
                </Box>
                {router && !router.error ? (
                  <>
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {router.needs_reboot ? (
                          <WarningIcon sx={{ color: '#FF9800' }} />
                        ) : (
                          <CheckCircleIcon sx={{ color: '#43A047' }} />
                        )}
                        <Typography variant="body1" fontWeight={700}>
                          {router.needs_reboot ? 'Reboot Recommended' : 'Router OK'}
                        </Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={router.confidence} 
                        sx={{ 
                          height: 8, 
                          borderRadius: 4,
                          bgcolor: isDark ? 'rgba(255,255,255,0.1)' : '#f0f0f0',
                          '& .MuiLinearProgress-bar': {
                            bgcolor: router.needs_reboot ? '#FF9800' : '#43A047',
                          }
                        }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {router.confidence}% confidence
                      </Typography>
                    </Box>
                    {router.reasons.slice(0, 2).map((reason, i) => (
                      <Typography key={i} variant="caption" display="block" color="text.secondary">
                        • {reason}
                      </Typography>
                    ))}
                  </>
                ) : (
                  <Alert severity="info" sx={{ fontSize: '0.85rem' }}>Need 5+ tests in 24h</Alert>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </Grid>

        {/* What Can I Do? */}
        <Grid size={{ xs: 12, md: 6 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <ChecklistIcon sx={{ fontSize: 28, color: '#4CAF50' }} />
                  <Typography variant="h6" fontWeight={700}>
                    📊 What Can I Do?
                  </Typography>
                </Box>
                {activities && !activities.error ? (
                  <>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Current: {activities.current_speed} Mbps · {activities.current_ping}ms
                    </Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {activities.recommended.slice(0, 5).map((act, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CheckCircleIcon sx={{ fontSize: 14, color: '#43A047' }} />
                          <Typography variant="caption">
                            {act.icon} {act.name}
                          </Typography>
                        </Box>
                      ))}
                      {activities.not_recommended.slice(0, 2).map((act, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CancelIcon sx={{ fontSize: 14, color: '#EF5350' }} />
                          <Typography variant="caption" color="text.secondary">
                            {act.icon} {act.name}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </>
                ) : (
                  <Alert severity="info" sx={{ fontSize: '0.85rem' }}>Run a speed test first</Alert>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </Grid>

        {/* Is It Just Me? */}
        <Grid size={{ xs: 12 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <PublicIcon sx={{ fontSize: 28, color: '#9C27B0' }} />
                  <Typography variant="h6" fontWeight={700}>
                    🌍 Is It Just Me?
                  </Typography>
                </Box>
                {isItJustMe && !isItJustMe.error ? (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <Paper sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: isItJustMe.is_just_you ? 'rgba(255,152,0,0.1)' : 'rgba(156,39,176,0.1)',
                        border: `2px solid ${isItJustMe.is_just_you ? 'rgba(255,152,0,0.3)' : 'rgba(156,39,176,0.3)'}`,
                      }}>
                        <Typography variant="h4" gutterBottom>
                          {isItJustMe.is_just_you ? '🏠' : '🌍'}
                        </Typography>
                        <Typography variant="h6" fontWeight={700}>
                          {isItJustMe.verdict}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, md: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box>
                          <Typography variant="body2" color="text.secondary">ISP: {isItJustMe.isp}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {isItJustMe.affected_users} of {isItJustMe.total_users_checked} users affected ({isItJustMe.outage_percentage}%)
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="body2" fontWeight={700} gutterBottom>External Services:</Typography>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            {Object.entries(isItJustMe.external_services).map(([service, status]) => (
                              <Chip
                                key={service}
                                label={service}
                                size="small"
                                icon={status ? <CheckCircleIcon /> : <CancelIcon />}
                                sx={{
                                  bgcolor: status ? 'rgba(67,160,71,0.15)' : 'rgba(239,83,80,0.15)',
                                  color: status ? '#43A047' : '#EF5350',
                                }}
                              />
                            ))}
                          </Box>
                        </Box>
                        <Alert severity={isItJustMe.is_just_you ? 'warning' : 'info'} sx={{ fontSize: '0.85rem' }}>
                          {isItJustMe.recommendation}
                        </Alert>
                      </Box>
                    </Grid>
                  </Grid>
                ) : (
                  <Alert severity="info">Run a speed test first</Alert>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </Grid>
      </Grid>
    </Box>
  );
}

export default CoolFeaturesPage;
