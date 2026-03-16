import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField,
  CircularProgress, Alert, Chip, LinearProgress, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment,
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import SpeedIcon from '@mui/icons-material/Speed';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { getContract, saveContract, getContractCompliance } from '../services/api';

const STATUS_COLOR = { passing: 'success', failing: 'error', no_contract: 'default', no_data: 'warning' };
const STATUS_ICON  = {
  passing:     <CheckCircleIcon fontSize="small" />,
  failing:     <CancelIcon fontSize="small" />,
  no_contract: <VerifiedIcon fontSize="small" />,
  no_data:     <WarningIcon fontSize="small" />,
};

const defaultForm = {
  isp_name: '', plan_name: '', promised_download: '',
  promised_upload: '', monthly_cost: '', currency: 'USD',
  sla_threshold_pct: '80',
};

export default function ISPContractPage() {
  const [compliance, setCompliance] = useState(null);
  const [contract,   setContract]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const [open,       setOpen]       = useState(false);
  const [form,       setForm]       = useState(defaultForm);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getContract().catch(() => null),
      getContractCompliance().catch(() => null),
    ]).then(([c, comp]) => {
      setContract(c?.data || null);
      setCompliance(comp?.data || null);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEditor = () => {
    if (contract) {
      setForm({
        isp_name: contract.isp_name || '',
        plan_name: contract.plan_name || '',
        promised_download: contract.promised_download ?? '',
        promised_upload: contract.promised_upload ?? '',
        monthly_cost: contract.monthly_cost ?? '',
        currency: contract.currency || 'USD',
        sla_threshold_pct: contract.sla_threshold_pct ?? '80',
      });
    } else {
      setForm(defaultForm);
    }
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveContract({
        ...form,
        promised_download: parseFloat(form.promised_download),
        promised_upload:   form.promised_upload ? parseFloat(form.promised_upload) : null,
        monthly_cost:      form.monthly_cost ? parseFloat(form.monthly_cost) : null,
        sla_threshold_pct: parseFloat(form.sla_threshold_pct) || 80,
      });
      setOpen(false);
      load();
    } catch {
      setError('Failed to save contract.');
    } finally {
      setSaving(false);
    }
  };

  const status = compliance?.status || 'no_contract';

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <VerifiedIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>ISP Contract Tracker</Typography>
        </Box>
        <Button variant="contained" startIcon={<EditIcon />} size="small" onClick={openEditor}>
          {contract ? 'Edit Contract' : 'Set Up Contract'}
        </Button>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Compare your promised speeds against actual measurements to see if you're getting what you pay for.
      </Typography>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error   && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && (
        <>
          {/* Status banner */}
          <Card sx={{ mb: 3, borderLeft: '4px solid', borderColor: status === 'passing' ? 'success.main' : status === 'failing' ? 'error.main' : 'warning.main' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" fontWeight={700}>
                  {compliance?.verdict || 'No contract set up yet'}
                </Typography>
                {compliance?.message && (
                  <Typography variant="body2" color="text.secondary">{compliance.message}</Typography>
                )}
              </Box>
              <Chip
                label={status.replace('_', ' ').toUpperCase()}
                color={STATUS_COLOR[status] || 'default'}
                icon={STATUS_ICON[status]}
                sx={{ fontWeight: 700 }}
              />
            </CardContent>
          </Card>

          {compliance && compliance.status !== 'no_contract' && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {/* Download compliance */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <SpeedIcon color="primary" fontSize="small" />
                      <Typography variant="subtitle2" fontWeight={700}>Download Speed</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Promised</Typography>
                      <Typography variant="caption" fontWeight={700}>{compliance.promised_download} Mbps</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Actual (avg)</Typography>
                      <Typography variant="caption" fontWeight={700}
                        sx={{ color: compliance.dl_pass ? 'success.main' : 'error.main' }}>
                        {compliance.actual_download != null ? `${compliance.actual_download} Mbps` : '—'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">Achievement</Typography>
                      <Typography variant="caption" fontWeight={700}>
                        {compliance.dl_pct != null ? `${compliance.dl_pct}%` : '—'}
                      </Typography>
                    </Box>
                    {compliance.dl_pct != null && (
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(compliance.dl_pct, 100)}
                        color={compliance.dl_pass ? 'success' : 'error'}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Upload compliance */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <SpeedIcon color="secondary" fontSize="small" />
                      <Typography variant="subtitle2" fontWeight={700}>Upload Speed</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Promised</Typography>
                      <Typography variant="caption" fontWeight={700}>
                        {compliance.promised_upload != null ? `${compliance.promised_upload} Mbps` : 'Not specified'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Actual (avg)</Typography>
                      <Typography variant="caption" fontWeight={700}
                        sx={{ color: compliance.ul_pass ? 'success.main' : compliance.actual_upload != null ? 'error.main' : 'text.secondary' }}>
                        {compliance.actual_upload != null ? `${compliance.actual_upload} Mbps` : '—'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">Achievement</Typography>
                      <Typography variant="caption" fontWeight={700}>
                        {compliance.ul_pct != null ? `${compliance.ul_pct}%` : '—'}
                      </Typography>
                    </Box>
                    {compliance.ul_pct != null && (
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(compliance.ul_pct, 100)}
                        color={compliance.ul_pass ? 'success' : 'error'}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Value for money */}
              {compliance.cost_per_mbps != null && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <AttachMoneyIcon color="warning" fontSize="small" />
                        <Typography variant="subtitle2" fontWeight={700}>Value for Money</Typography>
                      </Box>
                      <Typography variant="h4" fontWeight={800} color="warning.main">
                        {compliance.cost_per_mbps}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {compliance.currency || 'USD'} per Mbps of actual download
                      </Typography>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        Monthly cost: <strong>{compliance.monthly_cost} {compliance.currency}</strong>
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Samples info */}
              {compliance.samples != null && (
                <Grid size={{ xs: 12, sm: compliance.cost_per_mbps != null ? 6 : 12 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Data Summary</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Based on <strong>{compliance.samples}</strong> speed test{compliance.samples !== 1 ? 's' : ''} in the past 30 days.
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        SLA threshold: <strong>{compliance.sla_threshold_pct}%</strong> of promised speed
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                        Run more speed tests from the Dashboard to improve accuracy.
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>
          )}

          {/* Contract details */}
          {contract && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Your Contract</Typography>
                <Grid container spacing={1}>
                  {[
                    ['ISP', contract.isp_name],
                    ['Plan', contract.plan_name || '—'],
                    ['Promised Download', `${contract.promised_download} Mbps`],
                    ['Promised Upload', contract.promised_upload ? `${contract.promised_upload} Mbps` : '—'],
                    ['Monthly Cost', contract.monthly_cost ? `${contract.monthly_cost} ${contract.currency}` : '—'],
                    ['SLA Threshold', `${contract.sla_threshold_pct}%`],
                  ].map(([label, value]) => (
                    <Grid size={{ xs: 6, sm: 4 }} key={label}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" fontWeight={600}>{value}</Typography>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}

          {!contract && !loading && (
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <VerifiedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body1" gutterBottom>No contract set up yet.</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Enter your ISP plan details to start tracking whether you're getting what you pay for.
                </Typography>
                <Button variant="contained" onClick={openEditor}>Set Up Contract</Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Edit dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{contract ? 'Edit Contract' : 'Set Up ISP Contract'}</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="ISP Name" value={form.isp_name} onChange={e => setForm(f => ({ ...f, isp_name: e.target.value }))} fullWidth required />
          <TextField label="Plan Name" value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))} fullWidth />
          <TextField
            label="Promised Download" type="number" value={form.promised_download}
            onChange={e => setForm(f => ({ ...f, promised_download: e.target.value }))}
            InputProps={{ endAdornment: <InputAdornment position="end">Mbps</InputAdornment> }}
            fullWidth required
          />
          <TextField
            label="Promised Upload" type="number" value={form.promised_upload}
            onChange={e => setForm(f => ({ ...f, promised_upload: e.target.value }))}
            InputProps={{ endAdornment: <InputAdornment position="end">Mbps</InputAdornment> }}
            fullWidth
          />
          <Grid container spacing={1}>
            <Grid size={{ xs: 8 }}>
              <TextField
                label="Monthly Cost" type="number" value={form.monthly_cost}
                onChange={e => setForm(f => ({ ...f, monthly_cost: e.target.value }))}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                label="Currency" value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                fullWidth
              />
            </Grid>
          </Grid>
          <TextField
            label="SLA Threshold (%)" type="number" value={form.sla_threshold_pct}
            onChange={e => setForm(f => ({ ...f, sla_threshold_pct: e.target.value }))}
            helperText="Minimum % of promised speed that counts as passing (default: 80%)"
            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.isp_name || !form.promised_download}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
