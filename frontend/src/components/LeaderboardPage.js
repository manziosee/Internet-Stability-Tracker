import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Table, TableHead, TableBody, TableRow,
  TableCell, Button, TextField, Alert, CircularProgress, Tabs, Tab } from '@mui/material';
import { motion } from 'framer-motion';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { getLeaderboard, submitToLeaderboard } from '../services/api';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState(0);
  const [name,       setName]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState('');

  const metric = tab === 0 ? 'download' : 'upload';

  const load = () => {
    setLoading(true);
    getLeaderboard(metric).then(r => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [metric]); // eslint-disable-line

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const r = await submitToLeaderboard(name);
      setMsg(`Submitted! Best download: ${r.data.best_download} Mbps, upload: ${r.data.best_upload} Mbps`);
      load();
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Submission failed.');
    } finally { setSubmitting(false); }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <EmojiEventsIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#FDD835' }} />
          Speed Leaderboard
        </Typography>
        <Typography color="text.secondary" gutterBottom>Top community speeds. Submit your best to compete!</Typography>
      </motion.div>

      <Card sx={{ mb: 3, mt: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>Submit your best speed</Typography>
          <Box display="flex" gap={2} alignItems="center">
            <TextField size="small" label="Display name" value={name}
              onChange={e => setName(e.target.value)} sx={{ flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && submit()} />
            <Button variant="contained" onClick={submit} disabled={submitting || !name.trim()}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </Box>
          {msg && <Alert severity="info" sx={{ mt: 1 }}>{msg}</Alert>}
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Download Speed" />
        <Tab label="Upload Speed" />
      </Tabs>

      {loading ? <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress /></Box> : (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {data?.total_participants ?? 0} participants
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Download (Mbps)</TableCell>
                  <TableCell align="right">Upload (Mbps)</TableCell>
                  <TableCell>ISP</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.entries || []).map(e => (
                  <TableRow key={e.rank} sx={{ bgcolor: e.rank <= 3 ? 'action.hover' : 'inherit' }}>
                    <TableCell>
                      <Typography fontWeight={e.rank <= 3 ? 700 : 400}>
                        {MEDAL[e.rank - 1] || e.rank}
                      </Typography>
                    </TableCell>
                    <TableCell>{e.display_name}</TableCell>
                    <TableCell align="right">{e.best_download}</TableCell>
                    <TableCell align="right">{e.best_upload}</TableCell>
                    <TableCell><Typography variant="caption">{e.isp || '—'}</Typography></TableCell>
                  </TableRow>
                ))}
                {!data?.entries?.length && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary" sx={{ py: 2 }}>
                        No entries yet — be the first to submit!
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
