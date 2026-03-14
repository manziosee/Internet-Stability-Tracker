import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Card, CardContent, Grid,
  Alert, LinearProgress, Chip } from '@mui/material';
import { motion } from 'framer-motion';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { calculateCost } from '../services/api';

export default function CostCalculatorPage() {
  const [monthlyCost, setMonthlyCost] = useState(50);
  const [planDl,      setPlanDl]      = useState(100);
  const [planUl,      setPlanUl]      = useState(20);
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const run = async () => {
    setLoading(true); setError('');
    try {
      const res = await calculateCost({
        monthly_cost_usd:   monthlyCost,
        plan_download_mbps: planDl,
        plan_upload_mbps:   planUl,
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Calculation failed.');
    } finally { setLoading(false); }
  };

  const effColor = result?.efficiency === 'good' ? 'success' : result?.efficiency === 'average' ? 'warning' : 'error';

  return (
    <Box sx={{ p: 3, maxWidth: 700, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>Cost-Per-Mbps Calculator</Typography>
        <Typography color="text.secondary" gutterBottom>
          See if your internet plan is good value compared to national benchmarks.
        </Typography>
      </motion.div>

      <Card sx={{ mt: 2, mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            {[
              { label: 'Monthly Bill (USD)',    val: monthlyCost, set: setMonthlyCost },
              { label: 'Plan Download (Mbps)',  val: planDl,      set: setPlanDl },
              { label: 'Plan Upload (Mbps)',    val: planUl,      set: setPlanUl },
            ].map(({ label, val, set }) => (
              <Grid size={{ xs: 12, sm: 4 }} key={label}>
                <TextField fullWidth label={label} type="number" value={val}
                  onChange={e => set(Number(e.target.value))} size="small" />
              </Grid>
            ))}
          </Grid>
          <Button variant="contained" startIcon={<AttachMoneyIcon />} onClick={run} disabled={loading} sx={{ mt: 2 }}>
            Calculate
          </Button>
        </CardContent>
      </Card>

      {loading && <LinearProgress />}
      {error   && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Alert severity={effColor} sx={{ mb: 2 }}>{result.verdict}</Alert>
          <Grid container spacing={2}>
            {[
              { label: 'Cost / Plan Mbps',   value: `$${result.cost_per_plan_mbps}` },
              { label: 'Cost / Actual Mbps', value: `$${result.cost_per_actual_mbps}` },
              { label: 'Annual Cost',        value: `$${result.annual_cost_usd}` },
              { label: 'Actual Avg Speed',   value: `${result.actual_avg_download_mbps} Mbps` },
            ].map(({ label, value }) => (
              <Grid size={{ xs: 6, sm: 3 }} key={label}>
                <Card variant="outlined" sx={{ textAlign: 'center', p: 1.5 }}>
                  <Typography variant="h6" fontWeight={700}>{value}</Typography>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>Benchmark Reference</Typography>
              <Typography variant="body2">🇺🇸 US avg: ${result.benchmark?.us_avg_usd_per_mbps}/Mbps/month</Typography>
              <Typography variant="body2">🌍 Global avg: ${result.benchmark?.global_avg_usd_per_mbps}/Mbps/month</Typography>
              <Chip label={result.efficiency?.toUpperCase()} color={effColor} size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </motion.div>
      )}
    </Box>
  );
}
