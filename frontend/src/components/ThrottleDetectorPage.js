import React, { useState } from 'react';
import { Box, Typography, Button, Card, CardContent, Grid, LinearProgress,
  Alert, List, ListItem, ListItemText, ListItemIcon } from '@mui/material';
import { motion } from 'framer-motion';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { detectThrottling } from '../services/api';

export default function ThrottleDetectorPage() {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const run = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await detectThrottling();
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Detection failed. Check your connection.');
    } finally { setLoading(false); }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>ISP Throttle Detector</Typography>
        <Typography color="text.secondary" gutterBottom>
          Probes multiple CDN endpoints to detect if your ISP is selectively throttling your traffic.
        </Typography>
      </motion.div>

      <Card sx={{ mb: 3, mt: 2 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Downloads small files from Cloudflare, jsDelivr, Google CDN, and Fastly then compares speeds.
            Large discrepancies between providers indicate selective throttling.
          </Typography>
          <Button variant="contained" startIcon={<ShieldIcon />} onClick={run} disabled={loading} sx={{ mt: 1 }}>
            {loading ? 'Probing CDNs…' : 'Start Throttle Detection'}
          </Button>
        </CardContent>
      </Card>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Alert severity={result.is_throttled ? 'warning' : 'success'}
            icon={result.is_throttled ? <WarningIcon /> : <ShieldIcon />} sx={{ mb: 2 }}>
            {result.message}
          </Alert>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            {[
              { label: 'Throttled',   value: result.is_throttled ? 'YES' : 'NO', color: result.is_throttled ? 'error.main' : 'success.main' },
              { label: 'Confidence',  value: `${result.confidence}%` },
              { label: 'Avg Speed',   value: `${result.avg_mbps} Mbps` },
              { label: 'Speed Range', value: `${result.min_mbps}–${result.max_mbps}` },
            ].map(({ label, value, color }) => (
              <Grid size={{ xs: 6, sm: 3 }} key={label}>
                <Card variant="outlined" sx={{ textAlign: 'center', p: 1.5 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>CDN Probe Results</Typography>
              <List dense>
                {(result.probes || []).map((p, i) => (
                  <ListItem key={i} divider>
                    <ListItemIcon>
                      {p.ok ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={p.label}
                      secondary={p.ok ? `${p.mbps} Mbps` : `Error: ${p.error || 'timeout'}`}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </Box>
  );
}
