import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField,
  CircularProgress, Alert, Chip, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
} from '@mui/material';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import {
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
} from '../services/api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const fmtHour = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

const defaultForm = { label: 'My Schedule', hours: [8, 13, 18, 23], days: [0, 1, 2, 3, 4, 5, 6], burst_count: 1, enabled: true };

export default function ScheduledTestsPage() {
  const [schedules, setSchedules] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [open,      setOpen]      = useState(false);
  const [editing,   setEditing]   = useState(null); // schedule id or null
  const [form,      setForm]      = useState(defaultForm);

  const load = () => {
    setLoading(true);
    getSchedules()
      .then(r => setSchedules(r.data?.schedules || []))
      .catch(() => setError('Could not load schedules.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(defaultForm); setOpen(true); };
  const openEdit   = (s) => {
    setEditing(s.id);
    setForm({ label: s.label, hours: s.hours, days: s.days, burst_count: s.burst_count, enabled: s.enabled });
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateSchedule(editing, form);
      } else {
        await createSchedule(form);
      }
      setOpen(false);
      load();
    } catch {
      setError('Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try { await deleteSchedule(id); load(); }
    catch { setError('Failed to delete.'); }
  };

  const handleToggle = async (s) => {
    try {
      await updateSchedule(s.id, { ...s, enabled: !s.enabled });
      load();
    } catch {}
  };

  const toggleHour = (h) => setForm(f => ({
    ...f, hours: f.hours.includes(h) ? f.hours.filter(x => x !== h) : [...f.hours, h].sort((a, b) => a - b),
  }));

  const toggleDay = (d) => setForm(f => ({
    ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d].sort((a, b) => a - b),
  }));

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScheduleIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Scheduled Speed Tests</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={openCreate}>
          New Schedule
        </Button>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Automatically run speed tests at specific hours and days to build comprehensive trend data without manual effort.
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Schedules run server-side — keep this tab open or install the browser extension to trigger tests automatically.
      </Alert>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error   && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && schedules.length === 0 && (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <ScheduleIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" gutterBottom>No schedules configured.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create a schedule to run speed tests automatically and build rich historical data.
            </Typography>
            <Button variant="contained" onClick={openCreate}>Create Schedule</Button>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        {schedules.map((s) => (
          <Grid size={{ xs: 12, sm: 6 }} key={s.id}>
            <Card variant="outlined" sx={{ opacity: s.enabled ? 1 : 0.6, transition: 'opacity 0.2s' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700}>{s.label}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Chip label={s.enabled ? 'Active' : 'Paused'} size="small"
                      color={s.enabled ? 'success' : 'default'} sx={{ height: 20, fontSize: 10 }} />
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(s)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(s.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </Box>
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Hours: {(s.hours || []).map(fmtHour).join(', ') || 'None'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Days: {(s.days || []).map(d => DAYS[d]).join(', ') || 'None'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">
                    Burst: {s.burst_count} test{s.burst_count !== 1 ? 's' : ''} per trigger
                    {s.last_run && ` · Last: ${new Date(s.last_run).toLocaleDateString()}`}
                  </Typography>
                  <Switch checked={!!s.enabled} size="small" onChange={() => handleToggle(s)} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Create/Edit dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editing ? 'Edit Schedule' : 'New Schedule'}</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            label="Schedule name" value={form.label} size="small"
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))} fullWidth
          />

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Hours to run (select all that apply)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {HOURS_OPTIONS.map(h => (
                <Chip
                  key={h}
                  label={fmtHour(h)}
                  size="small"
                  onClick={() => toggleHour(h)}
                  color={form.hours.includes(h) ? 'primary' : 'default'}
                  icon={form.hours.includes(h) ? <CheckIcon /> : undefined}
                  sx={{ fontWeight: form.hours.includes(h) ? 700 : 400, cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Days</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {DAYS.map((d, i) => (
                <Chip
                  key={d}
                  label={d}
                  size="small"
                  onClick={() => toggleDay(i)}
                  color={form.days.includes(i) ? 'primary' : 'default'}
                  sx={{ fontWeight: form.days.includes(i) ? 700 : 400, cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Box>

          <TextField
            label="Tests per trigger (burst)"
            type="number"
            value={form.burst_count}
            onChange={e => setForm(f => ({ ...f, burst_count: Math.max(1, Math.min(5, parseInt(e.target.value) || 1)) }))}
            size="small"
            inputProps={{ min: 1, max: 5 }}
            helperText="Run 1–5 tests in sequence for more accurate readings"
            fullWidth
          />

          <FormControlLabel
            control={<Switch checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />}
            label="Enable immediately"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || form.hours.length === 0 || form.days.length === 0}
          >
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
