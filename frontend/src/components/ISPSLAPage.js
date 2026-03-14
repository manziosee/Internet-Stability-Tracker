import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Card, CardContent, Grid,
  Chip, LinearProgress, Alert } from '@mui/material';
import { motion } from 'framer-motion';
import VerifiedIcon from '@mui/icons-material/Verified';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SpeedIcon from '@mui/icons-material/Speed';
import { analyzeSLA } from '../services/api';

export default function ISPSLAPage() {
  const [promisedDl,   setPromisedDl]   = useState(100);
  const [promisedUl,   setPromisedUl]   = useState(20);
  const [promisedPing, setPromisedPing] = useState(30);
  const [windowDays,   setWindowDays]   = useState(30);
  const [result,  setResult]   = useState(null);
  const [loading, setLoading]  = useState(false);
  const [error,   setError]    = useState('');

  const run = async () => {
    setLoading(true); setError('');
    try {
      const res = await analyzeSLA({
        promised_download: promisedDl,
        promised_upload:   promisedUl,
        promised_ping:     promisedPing,
        window_days:       windowDays,
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to analyze SLA.');
    } finally { setLoading(false); }
  };

  const GradeChip = ({ grade }) => {
    const color = grade === 'A' ? 'success' : grade === 'B' ? 'primary' : grade === 'C' ? 'warning' : 'error';
    return <Chip label={`Grade ${grade}`} color={color} size="small" sx={{ fontWeight: 700, fontSize: '0.9rem', px: 1 }} />;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>ISP SLA Tracker</Typography>
        <Typography color="text.secondary" gutterBottom>
          Enter your ISP's promised speeds and see how they compare to your actual measurements.
        </Typography>
      </motion.div>

      <Card sx={{ mb: 3, mt: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Your ISP's Promises</Typography>
          <Grid container spacing={2}>
            {[
              { label: 'Promised Download (Mbps)', val: promisedDl,   set: setPromisedDl },
              { label: 'Promised Upload (Mbps)',   val: promisedUl,   set: setPromisedUl },
              { label: 'Promised Ping (ms)',        val: promisedPing, set: setPromisedPing },
              { label: 'Analysis Window (days)',    val: windowDays,   set: setWindowDays },
            ].map(({ label, val, set }) => (
              <Grid size={{ xs: 12, sm: 6 }} key={label}>
                <TextField fullWidth label={label} type="number" value={val}
                  onChange={e => set(Number(e.target.value))} size="small" />
              </Grid>
            ))}
          </Grid>
          <Button variant="contained" onClick={run} disabled={loading} sx={{ mt: 2 }} startIcon={<SpeedIcon />}>
            Analyze SLA
          </Button>
        </CardContent>
      </Card>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Alert severity={result.sla_met ? 'success' : 'warning'} sx={{ mb: 2 }}
            icon={result.sla_met ? <VerifiedIcon /> : <WarningAmberIcon />}>
            {result.verdict}
          </Alert>
          <Grid container spacing={2}>
            {[
              { label: 'Download', promised: result.promised?.download_mbps, actual: result.actual?.download?.avg, grade: result.grades?.download, compliance: result.sla_compliance_pct?.download },
              { label: 'Upload',   promised: result.promised?.upload_mbps,   actual: result.actual?.upload?.avg,   grade: result.grades?.upload,   compliance: result.sla_compliance_pct?.upload },
            ].map(({ label, promised, actual, grade, compliance }) => (
              <Grid size={{ xs: 12, sm: 6 }} key={label}>
                <Card variant="outlined">
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography fontWeight={600}>{label}</Typography>
                      {grade && <GradeChip grade={grade} />}
                    </Box>
                    <Typography variant="body2" color="text.secondary">Promised: {promised} Mbps</Typography>
                    <Typography variant="body2" color="text.secondary">Actual avg: {actual} Mbps</Typography>
                    <Box mt={1}>
                      <Typography variant="caption">SLA compliance: {compliance}%</Typography>
                      <LinearProgress variant="determinate" value={compliance || 0}
                        color={compliance >= 80 ? 'success' : compliance >= 50 ? 'warning' : 'error'}
                        sx={{ height: 8, borderRadius: 4, mt: 0.5 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h6">Overall Grade:</Typography>
                {result.grades?.overall && <GradeChip grade={result.grades.overall} />}
                <Typography color="text.secondary">Based on {result.sample_count} tests over {result.window_days} days</Typography>
              </Box>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </Box>
  );
}
