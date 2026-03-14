import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, TextField, Button,
  Alert, LinearProgress, Chip } from '@mui/material';
import { motion } from 'framer-motion';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { getBeforeAfterComparison } from '../services/api';

export default function BeforeAfterPage() {
  const today   = new Date().toISOString().split('T')[0];
  const minus30 = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
  const minus60 = new Date(Date.now() - 60 * 864e5).toISOString().split('T')[0];

  const [bStart,  setBStart]  = useState(minus60);
  const [bEnd,    setBEnd]    = useState(minus30);
  const [aStart,  setAStart]  = useState(minus30);
  const [aEnd,    setAEnd]    = useState(today);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const run = async () => {
    setLoading(true); setError('');
    try {
      const r = await getBeforeAfterComparison({
        before_start: bStart, before_end: bEnd,
        after_start:  aStart, after_end:  aEnd,
      });
      setResult(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Comparison failed.');
    } finally { setLoading(false); }
  };

  const DeltaChip = ({ val }) => {
    if (val === null || val === undefined) return <Chip label="N/A" size="small" />;
    const color = val > 5 ? 'success' : val < -5 ? 'error' : 'default';
    return <Chip label={`${val > 0 ? '+' : ''}${val}%`} color={color} size="small" />;
  };

  const verdictSeverity = result?.verdict?.startsWith('✅') ? 'success'
    : result?.verdict?.startsWith('📉') ? 'error' : 'info';

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <CompareArrowsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />Before/After Comparison
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Compare two time periods to measure the impact of a plan upgrade, router change, or ISP switch.
        </Typography>
      </motion.div>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {[
          { title: 'Before Period', start: bStart, end: bEnd, setStart: setBStart, setEnd: setBEnd },
          { title: 'After Period',  start: aStart, end: aEnd, setStart: setAStart, setEnd: setAEnd },
        ].map(({ title, start, end, setStart, setEnd }) => (
          <Grid size={{ xs: 12, sm: 6 }} key={title}>
            <Card variant="outlined">
              <CardContent>
                <Typography fontWeight={600} gutterBottom>{title}</Typography>
                <TextField fullWidth label="Start date" type="date" value={start}
                  onChange={e => setStart(e.target.value)} size="small" sx={{ mb: 1.5 }}
                  InputLabelProps={{ shrink: true }} />
                <TextField fullWidth label="End date" type="date" value={end}
                  onChange={e => setEnd(e.target.value)} size="small"
                  InputLabelProps={{ shrink: true }} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Button variant="contained" onClick={run} disabled={loading} sx={{ mt: 2 }}
        startIcon={<CompareArrowsIcon />}>
        Compare Periods
      </Button>
      {loading && <LinearProgress sx={{ mt: 1 }} />}
      {error   && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Alert severity={verdictSeverity} sx={{ mt: 2, mb: 2 }}>{result.verdict}</Alert>
          <Grid container spacing={2}>
            {['before', 'after'].map(period => (
              <Grid size={{ xs: 12, sm: 6 }} key={period}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography fontWeight={700} gutterBottom sx={{ textTransform: 'capitalize' }}>
                      {period}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{result[period]?.period}</Typography>
                    <Box mt={1.5}>
                      {[
                        { label: 'Download', key: 'avg_download', unit: 'Mbps', deltaKey: 'download_pct' },
                        { label: 'Upload',   key: 'avg_upload',   unit: 'Mbps', deltaKey: 'upload_pct' },
                        { label: 'Ping',     key: 'avg_ping',     unit: 'ms',   deltaKey: 'ping_pct' },
                      ].map(({ label, key, unit, deltaKey }) => (
                        <Box key={key} display="flex" justifyContent="space-between" alignItems="center" py={0.5}>
                          <Typography variant="body2">{label}</Typography>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography fontWeight={600}>{result[period]?.[key]} {unit}</Typography>
                            {period === 'after' && <DeltaChip val={result.deltas?.[deltaKey]} />}
                          </Box>
                        </Box>
                      ))}
                      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                        {result[period]?.count} tests
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </motion.div>
      )}
    </Box>
  );
}
