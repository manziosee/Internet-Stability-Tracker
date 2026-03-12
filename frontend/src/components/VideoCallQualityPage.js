import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Paper, Typography, Grid, CircularProgress, Chip, Alert, Card, CardContent, useTheme
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import { getVideoCallQuality } from '../services/api';

const PLATFORM_LOGOS = {
  zoom: '🔵',
  teams: '🟣',
  google_meet: '🟢',
};

function VideoCallQualityPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const res = await getVideoCallQuality();
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch video call quality:', err);
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
          {data?.error || 'No data available. Run a speed test first!'}
        </Alert>
      </Box>
    );
  }

  const statusColor = {
    excellent: '#43A047',
    good: '#66BB6A',
    poor: '#EF5350',
  };

  const StatusIcon = ({ status }) => {
    if (status === 'excellent') return <CheckCircleIcon sx={{ color: statusColor.excellent }} />;
    if (status === 'good') return <WarningIcon sx={{ color: statusColor.good }} />;
    return <ErrorIcon sx={{ color: statusColor.poor }} />;
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            bgcolor: 'rgba(33,150,243,0.15)', 
            borderRadius: 2, 
            p: 1.5, 
            border: '1px solid rgba(33,150,243,0.3)' 
          }}>
            <VideocamIcon sx={{ fontSize: 32, color: '#2196F3' }} />
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>
              📹 Video Call Quality
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time predictions for Zoom, Teams, and Google Meet
            </Typography>
          </Box>
        </Box>
      </motion.div>

      {/* Current Speed */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
        <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Current Connection
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4, my: 2 }}>
            <Box>
              <Typography variant="h4" fontWeight={900} color="primary">
                {data.current_speed.download} Mbps
              </Typography>
              <Typography variant="caption" color="text.secondary">Download</Typography>
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={900} color="secondary">
                {data.current_speed.upload} Mbps
              </Typography>
              <Typography variant="caption" color="text.secondary">Upload</Typography>
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={900}>
                {data.current_speed.ping}ms
              </Typography>
              <Typography variant="caption" color="text.secondary">Ping</Typography>
            </Box>
          </Box>
          <Chip 
            label={`Overall: ${data.overall_status.toUpperCase()}`}
            sx={{ 
              fontWeight: 700,
              bgcolor: `${statusColor[data.overall_status]}20`,
              color: statusColor[data.overall_status],
              border: `1px solid ${statusColor[data.overall_status]}`,
            }}
          />
        </Paper>
      </motion.div>

      {/* Platform Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {Object.entries(data.platforms).map(([platform, info], i) => (
          <Grid size={{ xs: 12, md: 4 }} key={platform}>
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.2 + i * 0.1 }}
            >
              <Card sx={{ 
                height: '100%',
                border: `2px solid ${statusColor[info.status]}40`,
                bgcolor: `${statusColor[info.status]}05`,
              }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="h4">{PLATFORM_LOGOS[platform]}</Typography>
                      <Typography variant="h6" fontWeight={700} textTransform="capitalize">
                        {platform.replace('_', ' ')}
                      </Typography>
                    </Box>
                    <StatusIcon status={info.status} />
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Video Quality
                    </Typography>
                    <Typography variant="h5" fontWeight={800}>
                      {info.quality}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Max Participants
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PeopleIcon sx={{ color: statusColor[info.status] }} />
                      <Typography variant="h5" fontWeight={800}>
                        {info.participants}
                      </Typography>
                    </Box>
                  </Box>

                  <Chip 
                    label={`Ping: ${info.ping}ms`}
                    size="small"
                    sx={{ 
                      bgcolor: `${statusColor[info.status]}15`,
                      color: statusColor[info.status],
                      fontWeight: 600,
                    }}
                  />
                </CardContent>
              </Card>
            </motion.div>
          </Grid>
        ))}
      </Grid>

      {/* Recommendations */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            💡 Recommendations
          </Typography>
          {data.recommendations.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {data.recommendations.map((rec, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Typography sx={{ fontSize: '1.2rem' }}>
                    {rec.startsWith('✅') ? '✅' : rec.startsWith('⚠️') ? '⚠️' : '💡'}
                  </Typography>
                  <Typography variant="body2">
                    {rec.replace(/^[✅⚠️💡]\s*/, '')}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography color="text.secondary">
              Your connection is perfect for video calls! 🎉
            </Typography>
          )}
        </Paper>
      </motion.div>

      {/* Tips */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Paper sx={{ p: 3, mt: 3, bgcolor: isDark ? 'rgba(33,150,243,0.05)' : 'rgba(33,150,243,0.03)' }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            📞 Video Call Tips
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0 }}>
            <li><Typography variant="body2">Close unnecessary apps and browser tabs before calls</Typography></li>
            <li><Typography variant="body2">Use wired Ethernet for more stable connection</Typography></li>
            <li><Typography variant="body2">Turn off video if connection becomes unstable</Typography></li>
            <li><Typography variant="body2">HD 1080p requires 3-4 Mbps per participant</Typography></li>
            <li><Typography variant="body2">Ping under 150ms ensures smooth audio without delays</Typography></li>
          </Box>
        </Paper>
      </motion.div>
    </Box>
  );
}

export default VideoCallQualityPage;
