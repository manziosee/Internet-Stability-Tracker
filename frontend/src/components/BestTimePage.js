import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress,
  Alert, Chip, LinearProgress, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NightsStayIcon from '@mui/icons-material/NightsStay';
import CloudIcon from '@mui/icons-material/Cloud';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { getBestTime } from '../services/api';

const HOUR_LABELS = [
  '12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am',
  '12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
];

function periodIcon(hour) {
  if (hour >= 6  && hour < 12) return <WbSunnyIcon  fontSize="small" sx={{ color: '#FFC107' }} />;
  if (hour >= 12 && hour < 18) return <CloudIcon    fontSize="small" sx={{ color: '#90CAF9' }} />;
  if (hour >= 18 && hour < 22) return <WbSunnyIcon  fontSize="small" sx={{ color: '#FF9800', opacity: 0.7 }} />;
  return <NightsStayIcon fontSize="small" sx={{ color: '#7986CB' }} />;
}

export default function BestTimePage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [metric,  setMetric]  = useState('download');

  useEffect(() => {
    setLoading(true);
    setError(null);
    getBestTime()
      .then(r => setData(r.data))
      .catch(() => setError('Could not load data. Run more speed tests to build up hour-by-hour history.'))
      .finally(() => setLoading(false));
  }, []);

  const hours = data?.hourly || [];
  const values = hours.map(h => metric === 'download' ? (h.avg_download || 0) : (h.avg_upload || 0));
  const maxVal = Math.max(...values, 1);
  const bestHour  = data?.best_download_hour;
  const worstHour = data?.worst_download_hour;
  const bestNow = data?.best_window;

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AccessTimeIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Best Time to Use Internet</Typography>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Discover which hours of the day your connection is fastest or slowest based on your measurement history.
      </Typography>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error   && <Alert severity="warning">{error}</Alert>}

      {!loading && data && (
        <>
          {/* Best window highlight */}
          {bestNow && (
            <Card sx={{ mb: 3, borderLeft: '4px solid', borderColor: 'success.main' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <AccessTimeIcon sx={{ fontSize: 36, color: 'success.main' }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight={700}>{bestNow.label}</Typography>
                  <Typography variant="body2" color="text.secondary">{bestNow.description}</Typography>
                </Box>
                <Chip label="Best Window" color="success" sx={{ fontWeight: 700 }} />
              </CardContent>
            </Card>
          )}

          {/* Metric toggle */}
          <Box sx={{ mb: 2 }}>
            <ToggleButtonGroup value={metric} exclusive size="small"
              onChange={(_, v) => v && setMetric(v)}>
              <ToggleButton value="download">
                <DownloadIcon fontSize="small" sx={{ mr: 0.5 }} /> Download
              </ToggleButton>
              <ToggleButton value="upload">
                <UploadIcon fontSize="small" sx={{ mr: 0.5 }} /> Upload
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Hour-by-hour bars */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
                Average {metric === 'download' ? 'Download' : 'Upload'} by Hour
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {hours.map((h, i) => {
                  const val = metric === 'download' ? h.avg_download : h.avg_upload;
                  const pct = val != null ? Math.round((val / maxVal) * 100) : 0;
                  const isBest  = h.hour === bestHour;
                  const isWorst = h.hour === worstHour;
                  return (
                    <Box key={h.hour} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 36, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {periodIcon(h.hour)}
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                          {HOUR_LABELS[h.hour]}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <LinearProgress
                          variant={val != null ? 'determinate' : 'indeterminate'}
                          value={pct}
                          color={isBest ? 'success' : isWorst ? 'error' : 'primary'}
                          sx={{ height: 10, borderRadius: 5, opacity: val == null ? 0.2 : 1 }}
                        />
                      </Box>
                      <Typography variant="caption" fontWeight={700} sx={{ width: 64, textAlign: 'right',
                        color: isBest ? 'success.main' : isWorst ? 'error.main' : 'text.primary' }}>
                        {val != null ? `${val} Mbps` : '—'}
                      </Typography>
                      {isBest  && <Chip label="Best"  size="small" color="success" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />}
                      {isWorst && <Chip label="Worst" size="small" color="error"   sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />}
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>

          {/* Activity recommendations */}
          {data.recommendations && data.recommendations.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>When to Do What</Typography>
                <Grid container spacing={1.5}>
                  {data.recommendations.map((rec) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={rec.activity}>
                      <Box sx={{
                        p: 1.5, borderRadius: 2,
                        bgcolor: rec.feasible ? 'success.main' : 'error.main',
                        opacity: 0.9,
                      }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#fff' }}>
                          {rec.activity}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                          {rec.best_hours || rec.note}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
