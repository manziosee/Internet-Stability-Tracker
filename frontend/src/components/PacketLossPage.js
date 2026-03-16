import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField,
  CircularProgress, Alert, Chip, LinearProgress, Divider,
} from '@mui/material';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import { runPacketLossTest, getPacketLossHistory } from '../services/api';

const jitterColor= (ms)  => ms  == null ? 'default' : ms < 10 ? 'success' : ms < 30 ? 'warning' : 'error';

const LossIcon = ({ pct }) => {
  if (pct === 0)  return <CheckCircleIcon color="success" />;
  if (pct < 5)    return <WarningIcon color="warning" />;
  return <ErrorIcon color="error" />;
};

export default function PacketLossPage() {
  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [history,  setHistory]  = useState([]);
  const [hLoading, setHLoading] = useState(true);
  const [error,    setError]    = useState(null);
  const [target,   setTarget]   = useState('1.1.1.1');
  const [count,    setCount]    = useState(20);


  const loadHistory = () => {
    setHLoading(true);
    getPacketLossHistory()
      .then(r => setHistory(r.data?.readings || []))
      .catch(() => {})
      .finally(() => setHLoading(false));
  };

  useEffect(() => { loadHistory(); }, []);

  const runTest = () => {
    setRunning(true);
    setError(null);
    setResult(null);
    runPacketLossTest({ target, count: parseInt(count) || 20 })
      .then(r => {
        setResult(r.data);
        loadHistory();
      })
      .catch(() => setError('Test failed. Check your connection or try a different target.'))
      .finally(() => setRunning(false));
  };

  const lossGrade = (pct) => {
    if (pct === 0)  return { label: 'Perfect',  color: '#4CAF50' };
    if (pct < 1)    return { label: 'Excellent', color: '#8BC34A' };
    if (pct < 5)    return { label: 'Acceptable',color: '#FFC107' };
    if (pct < 15)   return { label: 'Poor',      color: '#FF9800' };
    return             { label: 'Critical',  color: '#f44336' };
  };

  const grade = result ? lossGrade(result.loss_pct) : null;

  // Mini sparkline from history
  const histPts = history.slice(-20);
  const maxLoss = Math.max(...histPts.map(h => h.loss_pct || 0), 1);
  const SVG_W = 300, SVG_H = 50;
  const sparkPath = histPts.length > 1
    ? histPts.map((h, i) => {
        const x = (i / (histPts.length - 1)) * SVG_W;
        const y = SVG_H - ((h.loss_pct || 0) / maxLoss) * (SVG_H - 4) - 2;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
    : null;

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <SignalCellularAltIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Packet Loss & Jitter Monitor</Typography>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Measure packet loss and jitter to diagnose unstable connections, VoIP quality, and gaming lag.
      </Typography>

      {/* Controls */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField
                label="Target host" value={target} size="small" fullWidth
                onChange={e => setTarget(e.target.value)}
                placeholder="1.1.1.1 or google.com"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Packets" value={count} type="number" size="small" fullWidth
                onChange={e => setCount(e.target.value)}
                inputProps={{ min: 5, max: 100 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Button
                variant="contained" fullWidth
                startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
                onClick={runTest} disabled={running}
              >
                {running ? 'Running…' : 'Run Test'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error   && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Live result */}
      {result && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* Grade card */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ height: '100%', textAlign: 'center', borderTop: `3px solid ${grade.color}` }}>
              <CardContent sx={{ pt: 3 }}>
                <LossIcon pct={result.loss_pct} />
                <Typography variant="h3" fontWeight={900} sx={{ color: grade.color, mt: 1 }}>
                  {result.loss_pct}%
                </Typography>
                <Typography variant="body2" color="text.secondary">Packet Loss</Typography>
                <Chip label={grade.label} size="small" sx={{ mt: 1, fontWeight: 700, bgcolor: `${grade.color}22`, color: grade.color }} />
              </CardContent>
            </Card>
          </Grid>

          {/* Stats */}
          <Grid size={{ xs: 12, sm: 8 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Test Results — {result.target}</Typography>
                <Grid container spacing={1.5}>
                  {[
                    ['Packets Sent',   result.sent],
                    ['Received',       result.received],
                    ['Lost',           result.lost],
                    ['Avg Ping',       result.avg_ping_ms != null ? `${result.avg_ping_ms} ms` : '—'],
                    ['Jitter',         result.jitter_ms   != null ? `${result.jitter_ms} ms`   : '—'],
                    ['Min / Max Ping', result.min_ping_ms != null ? `${result.min_ping_ms} / ${result.max_ping_ms} ms` : '—'],
                  ].map(([l, v]) => (
                    <Grid size={{ xs: 6 }} key={l}>
                      <Typography variant="caption" color="text.secondary">{l}</Typography>
                      <Typography variant="body2" fontWeight={600}>{v ?? '—'}</Typography>
                    </Grid>
                  ))}
                </Grid>

                {result.jitter_ms != null && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="caption" color="text.secondary">Jitter quality</Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min((result.jitter_ms / 50) * 100, 100)}
                      color={jitterColor(result.jitter_ms)}
                      sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {result.jitter_ms < 10 ? 'Excellent for VoIP/gaming'
                       : result.jitter_ms < 30 ? 'Acceptable for streaming'
                       : 'High jitter — may cause call/game issues'}
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {running && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Sending {count} packets to {target}…
          </Typography>
        </Box>
      )}

      {/* History */}
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>Recent History</Typography>
            <Button size="small" startIcon={<RefreshIcon />} onClick={loadHistory} disabled={hLoading}>Refresh</Button>
          </Box>

          {hLoading && <LinearProgress />}

          {/* Sparkline */}
          {sparkPath && (
            <Box sx={{ mb: 2 }}>
              <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f44336" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#f44336" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${sparkPath} L${SVG_W},${SVG_H} L0,${SVG_H} Z`} fill="url(#lossGrad)" />
                <path d={sparkPath} fill="none" stroke="#f44336" strokeWidth="1.5" />
              </svg>
              <Typography variant="caption" color="text.secondary">Packet loss % over last {histPts.length} readings</Typography>
            </Box>
          )}

          {!hLoading && history.length === 0 && (
            <Typography variant="body2" color="text.secondary">No history yet — run your first test above.</Typography>
          )}

          {history.slice(-8).reverse().map((h, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
              <LossIcon pct={h.loss_pct} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  {h.loss_pct}% loss
                  {h.jitter_ms != null && ` · ${h.jitter_ms} ms jitter`}
                  {h.avg_ping_ms != null && ` · ${h.avg_ping_ms} ms ping`}
                </Typography>
                <Typography variant="caption" color="text.secondary">{h.target}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {new Date(h.timestamp).toLocaleString()}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}
