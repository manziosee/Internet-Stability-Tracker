import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button,
  CircularProgress, Alert, Chip, LinearProgress, Divider,
} from '@mui/material';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import CancelIcon from '@mui/icons-material/Cancel';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import CloudIcon from '@mui/icons-material/Cloud';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import StorageIcon from '@mui/icons-material/Storage';
import { getWFHScore } from '../services/api';

const APP_ICONS = {
  'Zoom':           <VideoCallIcon />,
  'Google Meet':    <VideoCallIcon />,
  'Microsoft Teams':<HeadsetMicIcon />,
  'Slack':          <HeadsetMicIcon />,
  'Google Drive':   <CloudIcon />,
  'Dropbox':        <CloudIcon />,
  'AWS':            <StorageIcon />,
  'GitHub':         <StorageIcon />,
};

const STATUS_INFO = {
  pass: { color: 'success', icon: <CheckCircleIcon />, label: 'Pass' },
  warn: { color: 'warning', icon: <WarningIcon />,     label: 'Marginal' },
  fail: { color: 'error',   icon: <CancelIcon />,      label: 'Fail' },
};

const SCORE_GRADE = (score) => {
  if (score >= 90) return { grade: 'A', label: 'Excellent WFH Connection',   color: '#4CAF50' };
  if (score >= 75) return { grade: 'B', label: 'Good for Most WFH Tasks',    color: '#8BC34A' };
  if (score >= 55) return { grade: 'C', label: 'Adequate — Some Limitations',color: '#FFC107' };
  if (score >= 35) return { grade: 'D', label: 'Poor — Expect Difficulties', color: '#FF9800' };
  return                  { grade: 'F', label: 'Not Suitable for WFH',       color: '#f44336' };
};

export default function WFHScorePage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getWFHScore()
      .then(r => setData(r.data))
      .catch(() => setError('Could not calculate score. Run speed tests first.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const score = data?.overall_score ?? 0;
  const gradeInfo = SCORE_GRADE(score);
  const apps = data?.apps || [];

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HomeWorkIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Work From Home Readiness</Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Check if your internet connection meets the requirements for popular remote work apps.
      </Typography>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error   && <Alert severity="warning">{error}</Alert>}

      {!loading && data && (
        <>
          {/* Score card */}
          <Card sx={{
            mb: 3,
            background: `linear-gradient(135deg, ${gradeInfo.color}22 0%, transparent 60%)`,
            borderTop: `3px solid ${gradeInfo.color}`,
          }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
              {/* Grade circle */}
              <Box sx={{
                width: 88, height: 88, borderRadius: '50%', flexShrink: 0,
                border: `4px solid ${gradeInfo.color}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                bgcolor: `${gradeInfo.color}18`,
              }}>
                <Typography variant="h3" fontWeight={900} sx={{ color: gradeInfo.color, lineHeight: 1 }}>
                  {gradeInfo.grade}
                </Typography>
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" fontWeight={800}>{gradeInfo.label}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Overall WFH score: <strong>{score}/100</strong>
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={score}
                  sx={{
                    height: 10, borderRadius: 5, maxWidth: 400,
                    '& .MuiLinearProgress-bar': { bgcolor: gradeInfo.color },
                  }}
                />
              </Box>

              {data.summary && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 140 }}>
                  <Chip label={`${data.summary.pass} / ${apps.length} apps pass`} color="success" size="small" sx={{ fontWeight: 700 }} />
                  {data.summary.warn > 0 && <Chip label={`${data.summary.warn} marginal`} color="warning" size="small" />}
                  {data.summary.fail > 0 && <Chip label={`${data.summary.fail} failing`} color="error" size="small" />}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Current stats */}
          {data.current && (
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Your Connection (Last 24h avg)</Typography>
                <Grid container spacing={2}>
                  {[
                    ['Download', `${data.current.download_mbps ?? '—'} Mbps`],
                    ['Upload',   `${data.current.upload_mbps ?? '—'} Mbps`],
                    ['Ping',     data.current.ping_ms != null ? `${data.current.ping_ms} ms` : '—'],
                    ['Uptime',   data.current.uptime_pct != null ? `${data.current.uptime_pct}%` : '—'],
                  ].map(([l, v]) => (
                    <Grid size={{ xs: 6, sm: 3 }} key={l}>
                      <Typography variant="caption" color="text.secondary">{l}</Typography>
                      <Typography variant="h6" fontWeight={700}>{v}</Typography>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* App breakdown */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>App Requirements</Typography>
          <Grid container spacing={2}>
            {apps.map((app) => {
              const si = STATUS_INFO[app.status] || STATUS_INFO.fail;
              const icon = APP_ICONS[app.name] || <CloudIcon />;
              return (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={app.name}>
                  <Card variant="outlined" sx={{
                    borderColor: app.status === 'pass' ? 'success.main' : app.status === 'warn' ? 'warning.main' : 'error.main',
                    borderWidth: 1.5,
                  }}>
                    <CardContent sx={{ pb: '12px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ color: `${si.color}.main` }}>{React.cloneElement(icon, { fontSize: 'small' })}</Box>
                          <Typography variant="subtitle2" fontWeight={700}>{app.name}</Typography>
                        </Box>
                        <Chip
                          label={si.label}
                          color={si.color}
                          size="small"
                          icon={React.cloneElement(si.icon, { style: { fontSize: 14 } })}
                          sx={{ fontWeight: 700, height: 22 }}
                        />
                      </Box>

                      <Divider sx={{ mb: 1 }} />

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {(app.requirements || []).map((req) => (
                          <Box key={req.metric} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="caption" color="text.secondary">{req.metric}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="caption" fontWeight={600}>{req.actual ?? '—'}</Typography>
                              <Typography variant="caption" color="text.disabled">/ {req.required}</Typography>
                              {req.pass
                                ? <CheckCircleIcon sx={{ fontSize: 12, color: 'success.main' }} />
                                : <CancelIcon      sx={{ fontSize: 12, color: 'error.main' }} />
                              }
                            </Box>
                          </Box>
                        ))}
                      </Box>

                      {app.note && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, fontStyle: 'italic' }}>
                          {app.note}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          {/* Recommendations */}
          {data.recommendations && data.recommendations.length > 0 && (
            <Card variant="outlined" sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Recommendations</Typography>
                {data.recommendations.map((rec, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
                    <WarningIcon fontSize="small" color="warning" sx={{ flexShrink: 0, mt: 0.25 }} />
                    <Typography variant="body2">{rec}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
