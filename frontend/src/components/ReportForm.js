import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, Paper, Typography, TextField, FormControl, InputLabel,
  Select, MenuItem, Button, CircularProgress, Alert, Chip,
  Divider, IconButton, Tooltip
} from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import SendIcon from '@mui/icons-material/Send';
import { createReport } from '../services/api';

const ISSUE_TYPES = [
  { value: 'outage', label: 'Complete Outage', color: '#E53935' },
  { value: 'slow', label: 'Slow Speeds', color: '#F57C00' },
  { value: 'intermittent', label: 'Intermittent Connection', color: '#1565C0' },
  { value: 'other', label: 'Other', color: '#637381' },
];

const EMPTY_FORM = {
  isp: '',
  location: '',
  latitude: '',
  longitude: '',
  issue_type: '',
  description: '',
};

function ReportForm() {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [geoError, setGeoError] = useState(null);

  const set = (field) => (e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setFormData((prev) => ({
          ...prev,
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
        }));
        // Reverse geocode using Nominatim
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await res.json();
          const addr = data.address;
          const location =
            addr.city || addr.town || addr.village || addr.county || addr.state || 'Unknown';
          setFormData((prev) => ({ ...prev, location }));
        } catch {
          // Location name unavailable, coordinates are still set
        }
        setLocating(false);
      },
      (err) => {
        setGeoError('Could not get your location. Please enter coordinates manually.');
        setLocating(false);
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createReport({
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
      });
      setSubmitted(true);
    } catch (err) {
      setError('Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFormData(EMPTY_FORM);
    setSubmitted(false);
    setError(null);
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 680, mx: 'auto' }}>
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: { xs: 2.5, md: 3 },
          borderRadius: 3,
          background: (theme) => theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(7,8,13,0.94) 0%, rgba(12,16,24,0.9) 100%)'
            : 'linear-gradient(135deg, rgba(245,194,75,0.14), rgba(245,194,75,0.12))',
          border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(240,194,75,0.22)' : 'rgba(245,194,75,0.25)'}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ReportProblemIcon sx={{ color: '#F57C00' }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>
              Report a Network Issue
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Help the community by sharing outages or slowdowns near you
            </Typography>
          </Box>
        </Box>
      </Paper>

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Paper
              sx={{
                p: 5,
                textAlign: 'center',
                borderRadius: 3,
                background: (theme) => theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, rgba(240,194,75,0.2), rgba(240,194,75,0.08))'
                  : 'linear-gradient(135deg, rgba(245,194,75,0.16), rgba(245,194,75,0.12))',
                border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(240,194,75,0.22)' : 'rgba(245,194,75,0.25)'}`,
              }}
            >
              <CheckCircleOutlineIcon sx={{ fontSize: 64, color: '#2E7D32', mb: 2 }} />
              <Typography variant="h5" fontWeight={700} mb={1}>
                Report Submitted!
              </Typography>
              <Typography variant="body1" color="text.secondary" mb={3}>
                Thank you for helping the community. Your report has been recorded and will
                appear on the outage map.
              </Typography>
              <Button variant="contained" onClick={reset} startIcon={<ReportProblemIcon />}>
                Submit Another Report
              </Button>
            </Paper>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Paper
              sx={{
                p: { xs: 2.5, md: 3.5 },
                borderRadius: 3,
                background: (theme) => theme.palette.mode === 'dark'
                  ? 'rgba(255,255,255,0.02)'
                  : '#fff',
                border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}`,
                boxShadow: (theme) => theme.palette.mode === 'dark'
                  ? '0 10px 40px rgba(0,0,0,0.35)'
                  : '0 16px 40px rgba(0,0,0,0.08)',
              }}
            >
              {error && (
                <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                {/* ISP & Issue Type */}
                <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2.5 }}>
                  <TextField
                    label="ISP / Provider Name"
                    value={formData.isp}
                    onChange={set('isp')}
                    required
                    fullWidth
                    placeholder="e.g. MTN, Airtel, Liquid"
                  />
                  <FormControl required fullWidth>
                    <InputLabel>Issue Type</InputLabel>
                    <Select
                      value={formData.issue_type}
                      onChange={set('issue_type')}
                      label="Issue Type"
                    >
                      {ISSUE_TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: t.color }} />
                            {t.label}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                <Divider sx={{ my: 2.5 }}>
                  <Chip label="Location" size="small" />
                </Divider>

                {/* Location */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <TextField
                      label="Location / Area"
                      value={formData.location}
                      onChange={set('location')}
                      required
                      fullWidth
                      placeholder="e.g. Kigali, Kimironko"
                    />
                    <Tooltip title="Auto-detect my location">
                      <span>
                        <IconButton
                          onClick={detectLocation}
                          disabled={locating}
                          color="primary"
                          sx={{ mt: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, width: 56, height: 56 }}
                        >
                          {locating ? <CircularProgress size={20} /> : <MyLocationIcon />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>

                  {geoError && (
                    <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setGeoError(null)}>
                      {geoError}
                    </Alert>
                  )}

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="Latitude"
                      type="number"
                      inputProps={{ step: 'any' }}
                      value={formData.latitude}
                      onChange={set('latitude')}
                      required
                      fullWidth
                      placeholder="-1.9441"
                      helperText="Auto-filled when you use location detect"
                    />
                    <TextField
                      label="Longitude"
                      type="number"
                      inputProps={{ step: 'any' }}
                      value={formData.longitude}
                      onChange={set('longitude')}
                      required
                      fullWidth
                      placeholder="30.0619"
                      helperText="Auto-filled when you use location detect"
                    />
                  </Box>
                </Box>

                <Divider sx={{ my: 2.5 }}>
                  <Chip label="Details" size="small" />
                </Divider>

                <TextField
                  label="Description"
                  multiline
                  rows={4}
                  value={formData.description}
                  onChange={set('description')}
                  required
                  fullWidth
                  placeholder="Describe what you're experiencing — when it started, how often, what you've tried..."
                  sx={{ mb: 3 }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={submitting}
                  startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                >
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </Button>
              </form>
            </Paper>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

export default ReportForm;
