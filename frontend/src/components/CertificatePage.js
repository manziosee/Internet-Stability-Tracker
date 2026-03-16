import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Button, CircularProgress,
  Alert, Chip, Divider, Grid,
} from '@mui/material';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { getCertificate } from '../services/api';

const GRADE_COLOR = { A: '#4CAF50', B: '#8BC34A', C: '#FFC107', D: '#FF9800', F: '#f44336' };

export default function CertificatePage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const certRef = useRef(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getCertificate()
      .then(r => setData(r.data))
      .catch(() => setError('Could not generate certificate. Run speed tests first.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDownload = () => {
    if (!certRef.current) return;
    const el = certRef.current;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Network Quality Certificate</title>
      <style>body{font-family:sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}</style>
      </head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const grade = data?.grade;
  const gradeColor = GRADE_COLOR[grade] || '#9E9E9E';

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WorkspacePremiumIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Network Quality Certificate</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
          {data && (
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload}>
              Print / Save
            </Button>
          )}
        </Box>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        An official-looking certificate summarising your network quality grade for the past 30 days.
      </Typography>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error   && <Alert severity="warning">{error}</Alert>}

      {!loading && data && (
        <>
          {/* Certificate */}
          <Box ref={certRef}>
            <Card
              sx={{
                mb: 3,
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                border: '3px solid',
                borderColor: gradeColor,
                borderRadius: 4,
                boxShadow: `0 0 40px ${gradeColor}33`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Decorative corners */}
              {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
                <Box key={pos} sx={{
                  position: 'absolute',
                  width: 60, height: 60,
                  top:    pos.includes('top')    ? 12 : 'auto',
                  bottom: pos.includes('bottom') ? 12 : 'auto',
                  left:   pos.includes('left')   ? 12 : 'auto',
                  right:  pos.includes('right')  ? 12 : 'auto',
                  border: `2px solid ${gradeColor}55`,
                  borderRadius: 1,
                }} />
              ))}

              <CardContent sx={{ py: 5, px: 6, textAlign: 'center', position: 'relative' }}>
                <Typography variant="overline" sx={{ color: gradeColor, letterSpacing: 4, fontWeight: 700, fontSize: 11 }}>
                  CERTIFIED NETWORK QUALITY REPORT
                </Typography>

                <Box sx={{ my: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 100, height: 100, borderRadius: '50%',
                  border: `4px solid ${gradeColor}`,
                  background: `${gradeColor}22`,
                  boxShadow: `0 0 30px ${gradeColor}44`,
                }}>
                  <Typography variant="h2" fontWeight={900} sx={{ color: gradeColor }}>
                    {grade || '?'}
                  </Typography>
                </Box>

                <Typography variant="h4" fontWeight={800} sx={{ color: '#fff', mt: 2, mb: 0.5 }}>
                  {data.title || 'Network Quality Certificate'}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', mb: 3 }}>
                  {data.subtitle || 'Based on 30-day performance measurements'}
                </Typography>

                <Divider sx={{ borderColor: `${gradeColor}44`, mb: 3 }} />

                <Grid container spacing={3} justifyContent="center">
                  {(data.metrics || []).map((m) => (
                    <Grid size={{ xs: 6, sm: 3 }} key={m.label}>
                      <Typography variant="h5" fontWeight={800} sx={{ color: gradeColor }}>
                        {m.value}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        {m.label}
                      </Typography>
                    </Grid>
                  ))}
                </Grid>

                <Divider sx={{ borderColor: `${gradeColor}44`, my: 3 }} />

                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                  Issued: {data.issued_at || new Date().toLocaleDateString()} &nbsp;|&nbsp;
                  Period: {data.period || 'Last 30 days'} &nbsp;|&nbsp;
                  Samples: {data.sample_count || '—'}
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Criteria breakdown */}
          {data.criteria && data.criteria.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Certificate Criteria</Typography>
                <Grid container spacing={1}>
                  {data.criteria.map((c) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={c.name}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                        {c.pass
                          ? <CheckCircleIcon fontSize="small" color="success" />
                          : <CancelIcon fontSize="small" color="error" />}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{c.detail}</Typography>
                        </Box>
                        <Chip label={c.grade} size="small"
                          sx={{ fontWeight: 700, bgcolor: `${GRADE_COLOR[c.grade] || '#9E9E9E'}22`, color: GRADE_COLOR[c.grade] || 'text.primary', border: 'none' }} />
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
