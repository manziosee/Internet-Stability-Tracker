import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Button, TextField, Alert, Chip } from '@mui/material';
import { motion } from 'framer-motion';
import DownloadIcon from '@mui/icons-material/Download';
import TableChartIcon from '@mui/icons-material/TableChart';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { exportCSV, exportJSONData } from '../services/api';

export default function ExportPage() {
  const [days,    setDays]    = useState(90);
  const [msg,     setMsg]     = useState('');
  const [loading, setLoading] = useState('');

  const downloadCSV = async () => {
    setLoading('csv'); setMsg('');
    try {
      const res = await exportCSV(days);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href = url; a.download = `speed_tests_${days}d.csv`; a.click();
      window.URL.revokeObjectURL(url);
      setMsg('CSV downloaded successfully!');
    } catch { setMsg('Export failed. Please try again.'); }
    finally  { setLoading(''); }
  };

  const downloadJSON = async () => {
    setLoading('json'); setMsg('');
    try {
      const res  = await exportJSONData(days);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `speed_tests_${days}d.json`; a.click();
      window.URL.revokeObjectURL(url);
      setMsg(`JSON exported: ${res.data.count} measurements.`);
    } catch { setMsg('Export failed. Please try again.'); }
    finally  { setLoading(''); }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 700, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>Export Data</Typography>
        <Typography color="text.secondary" gutterBottom>
          Download your speed test history for analysis in Excel, Google Sheets, or custom tools.
        </Typography>
      </motion.div>

      <Card sx={{ mt: 2, mb: 3 }}>
        <CardContent>
          <TextField label="Days of history" type="number" value={days}
            onChange={e => setDays(Number(e.target.value))}
            size="small" sx={{ width: 180, mb: 3 }} inputProps={{ min: 1, max: 365 }} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <TableChartIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                <Typography fontWeight={600}>CSV Export</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Open in Excel or Google Sheets
                </Typography>
                <Button fullWidth variant="contained" color="success" startIcon={<DownloadIcon />}
                  onClick={downloadCSV} disabled={loading === 'csv'}>
                  {loading === 'csv' ? 'Downloading…' : 'Download CSV'}
                </Button>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <DataObjectIcon sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
                <Typography fontWeight={600}>JSON Export</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Use with scripts or APIs
                </Typography>
                <Button fullWidth variant="contained" color="info" startIcon={<DownloadIcon />}
                  onClick={downloadJSON} disabled={loading === 'json'}>
                  {loading === 'json' ? 'Downloading…' : 'Download JSON'}
                </Button>
              </Card>
            </Grid>
          </Grid>
          {msg && <Alert severity="success" sx={{ mt: 2 }}>{msg}</Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>Included fields</Typography>
          {['Timestamp', 'Download (Mbps)', 'Upload (Mbps)', 'Ping (ms)', 'ISP', 'City', 'Country'].map(f => (
            <Chip key={f} label={f} size="small" sx={{ m: 0.3 }} />
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}
