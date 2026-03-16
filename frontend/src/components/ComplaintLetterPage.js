import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField,
  CircularProgress, Alert, Chip, Divider, Grid, Paper,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { getComplaintLetter } from '../services/api';

export default function ComplaintLetterPage() {
  const [letter,   setLetter]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [copied,   setCopied]   = useState(false);
  const [form,     setForm]     = useState({
    your_name: '', your_address: '', isp_name: '', account_number: '', issue_start: '',
  });

  const generate = () => {
    setLoading(true);
    setError(null);
    setLetter(null);
    getComplaintLetter(form)
      .then(r => setLetter(r.data))
      .catch(() => setError('Could not generate letter. Make sure you have speed test data recorded.'))
      .finally(() => setLoading(false));
  };

  const copy = () => {
    const text = letter?.letter_text || '';
    navigator.clipboard?.writeText(text).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const download = () => {
    const blob = new Blob([letter?.letter_text || ''], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'isp-complaint-letter.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const severity = letter?.severity;

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <GavelIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>ISP Complaint Letter Generator</Typography>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Generate a formal complaint letter to your ISP backed by real speed test data. Ready to send.
      </Typography>

      {/* Form */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>Your Details (optional — for personalisation)</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Your name" value={form.your_name}
                onChange={e => setForm(f => ({ ...f, your_name: e.target.value }))}
                size="small" fullWidth placeholder="John Doe" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="ISP name" value={form.isp_name}
                onChange={e => setForm(f => ({ ...f, isp_name: e.target.value }))}
                size="small" fullWidth placeholder="e.g. Comcast, AT&T" />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField label="Your address" value={form.your_address}
                onChange={e => setForm(f => ({ ...f, your_address: e.target.value }))}
                size="small" fullWidth placeholder="123 Main St, City, State" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Account number" value={form.account_number}
                onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                size="small" fullWidth placeholder="Optional" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Issue start date" value={form.issue_start}
                onChange={e => setForm(f => ({ ...f, issue_start: e.target.value }))}
                size="small" fullWidth placeholder="e.g. March 1, 2026" />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <AutoFixHighIcon />}
              onClick={generate}
              disabled={loading}
            >
              {loading ? 'Generating…' : 'Generate Complaint Letter'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {letter && (
        <>
          {/* Evidence summary */}
          <Card sx={{ mb: 3, borderLeft: '4px solid', borderColor: severity === 'high' ? 'error.main' : severity === 'medium' ? 'warning.main' : 'info.main' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={700}>Evidence Summary</Typography>
                <Chip
                  label={`${severity?.toUpperCase()} SEVERITY`}
                  color={severity === 'high' ? 'error' : severity === 'medium' ? 'warning' : 'info'}
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
              <Grid container spacing={1}>
                {(letter.evidence || []).map((e) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={e.label}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                      <Typography variant="caption" color="text.secondary">{e.label}</Typography>
                      <Typography variant="caption" fontWeight={700}>{e.value}</Typography>
                    </Box>
                    <Divider />
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>

          {/* Letter */}
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>Formal Complaint Letter</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" startIcon={<ContentCopyIcon />} onClick={copy} variant="outlined">
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  <Button size="small" startIcon={<DownloadIcon />} onClick={download} variant="contained">
                    Download
                  </Button>
                </Box>
              </Box>
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  fontFamily: '"Courier New", monospace',
                  fontSize: 13,
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                  bgcolor: 'action.hover',
                  maxHeight: 520,
                  overflowY: 'auto',
                  borderRadius: 1,
                }}
              >
                {letter.letter_text}
              </Paper>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
                This letter is generated from your actual speed test data. Review before sending.
              </Typography>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
