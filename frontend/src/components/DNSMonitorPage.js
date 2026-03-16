import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField,
  CircularProgress, Alert, Chip, LinearProgress, Divider, IconButton,
} from '@mui/material';
import DnsIcon from '@mui/icons-material/Dns';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { runDNSTest } from '../services/api';

const DEFAULT_SERVERS = [
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: 'Google',     ip: '8.8.8.8' },
  { name: 'Quad9',      ip: '9.9.9.9' },
  { name: 'OpenDNS',   ip: '208.67.222.222' },
];

const SPEED_COLOR = (ms) => {
  if (ms == null) return 'text.secondary';
  if (ms < 20)  return 'success.main';
  if (ms < 60)  return 'warning.main';
  return 'error.main';
};

export default function DNSMonitorPage() {
  const [results,  setResults]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [servers,  setServers]  = useState(DEFAULT_SERVERS);
  const [newName,  setNewName]  = useState('');
  const [newIP,    setNewIP]    = useState('');
  const [domain,   setDomain]   = useState('google.com');

  const runTest = useCallback(() => {
    setLoading(true);
    setError(null);
    runDNSTest(domain)
      .then(r => setResults(r.data))
      .catch(() => setError('DNS test failed. Check your connection.'))
      .finally(() => setLoading(false));
  }, [domain]);

  const addServer = () => {
    if (!newIP) return;
    setServers(s => [...s, { name: newName || newIP, ip: newIP }]);
    setNewName(''); setNewIP('');
  };

  const removeServer = (ip) => setServers(s => s.filter(x => x.ip !== ip));

  const allResults = results?.results || [];
  const maxMs = Math.max(...allResults.map(r => r.latency_ms || 0), 1);
  const best = allResults.reduce((b, r) => (r.latency_ms != null && (b == null || r.latency_ms < b.latency_ms)) ? r : b, null);

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <DnsIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>DNS Performance Monitor</Typography>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Compare response times of multiple DNS resolvers to find the fastest one for your network.
      </Typography>

      {/* Controls */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Test domain"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                size="small"
                fullWidth
                placeholder="google.com"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
                onClick={runTest}
                disabled={loading}
                fullWidth
              >
                {loading ? 'Running test…' : 'Run DNS Test'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Best resolver highlight */}
      {best && (
        <Card sx={{ mb: 3, borderLeft: '4px solid', borderColor: 'success.main' }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main' }} />
            <Box>
              <Typography variant="h6" fontWeight={700}>
                Fastest: {best.name} ({best.ip})
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Resolved in <strong style={{ color: '#4CAF50' }}>{best.latency_ms} ms</strong> — recommended DNS server for your network
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {allResults.length > 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              DNS Latency Results — {results.domain}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {allResults.sort((a, b) => (a.latency_ms ?? 9999) - (b.latency_ms ?? 9999)).map((r) => {
                const pct = r.latency_ms != null ? Math.round((r.latency_ms / maxMs) * 100) : 0;
                const isBest = r.ip === best?.ip;
                return (
                  <Box key={r.ip}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {r.success
                          ? <CheckCircleIcon fontSize="small" color="success" />
                          : <ErrorIcon fontSize="small" color="error" />}
                        <Typography variant="body2" fontWeight={isBest ? 700 : 400}>
                          {r.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {r.ip}
                        </Typography>
                        {isBest && <Chip label="Fastest" size="small" color="success" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />}
                      </Box>
                      <Typography variant="body2" fontWeight={700} sx={{ color: SPEED_COLOR(r.latency_ms) }}>
                        {r.latency_ms != null ? `${r.latency_ms} ms` : 'Failed'}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      color={!r.success ? 'error' : isBest ? 'success' : 'primary'}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Server management */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>DNS Servers to Test</Typography>
          {servers.map(s => (
            <Box key={s.ip} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Chip label={s.name} size="small" />
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', flex: 1 }}>{s.ip}</Typography>
              {!DEFAULT_SERVERS.find(d => d.ip === s.ip) && (
                <IconButton size="small" color="error" onClick={() => removeServer(s.ip)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField size="small" label="Name" value={newName} onChange={e => setNewName(e.target.value)} sx={{ width: 120 }} />
            <TextField size="small" label="IP address" value={newIP}  onChange={e => setNewIP(e.target.value)}  sx={{ flex: 1, minWidth: 140 }} />
            <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addServer} disabled={!newIP}>
              Add
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
