import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableBody, TableRow,
  TableCell, Button, TextField, Alert, CircularProgress, Tabs, Tab, Chip,
  InputAdornment, Divider, LinearProgress, Grid,
} from '@mui/material';
import { motion } from 'framer-motion';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import SearchIcon from '@mui/icons-material/Search';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import PersonIcon from '@mui/icons-material/Person';
import { getLeaderboard, submitToLeaderboard, getMyRank } from '../services/api';

const MEDAL   = ['🥇', '🥈', '🥉'];
const BENCHMARKS = [
  { label: 'World Avg (Ookla 2024)',   dl: 109.2, ul: 65.4,  color: '#90a4ae' },
  { label: 'Africa Avg',               dl: 42.1,  ul: 23.8,  color: '#ffb74d' },
  { label: 'Gigabit Fibre',            dl: 940.0, ul: 450.0, color: '#66bb6a' },
  { label: '100 Mbps Plan',            dl: 95.0,  ul: 45.0,  color: '#42a5f5' },
];

export default function LeaderboardPage() {
  const [data,       setData]       = useState(null);
  const [myRank,     setMyRank]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState(0);
  const [name,       setName]       = useState('');
  const [search,     setSearch]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState('');
  const [msgSev,     setMsgSev]     = useState('info');

  const metric = tab === 0 ? 'download' : 'upload';

  const load = () => {
    setLoading(true);
    Promise.all([
      getLeaderboard(metric),
      getMyRank().catch(() => ({ data: null })),
    ]).then(([lb, mr]) => {
      setData(lb.data);
      setMyRank(mr.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [metric]); // eslint-disable-line

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const r = await submitToLeaderboard(name);
      setMsg(`Submitted! Best download: ${r.data.best_download} Mbps, upload: ${r.data.best_upload} Mbps`);
      setMsgSev('success');
      load();
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'No speed tests found — run a test first.');
      setMsgSev('error');
    } finally { setSubmitting(false); }
  };

  const filtered = (data?.entries || []).filter(e =>
    !search || e.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.isp?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <EmojiEventsIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#FDD835' }} />
          Speed Leaderboard
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Top community speeds — submit yours and see how you compare globally.
        </Typography>
      </motion.div>

      <Grid container spacing={2} sx={{ mt: 1, mb: 2 }}>
        {/* Personal best card */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <PersonIcon color="primary" fontSize="small" />
                <Typography variant="subtitle2" fontWeight={700}>Your Personal Best</Typography>
              </Box>
              {myRank?.submitted ? (
                <>
                  <Typography variant="h5" fontWeight={800} color="primary">{myRank.display_name}</Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <Box>
                      <Typography variant="h6" fontWeight={700} color="#42A5F5">
                        {myRank.best_download} <Typography component="span" variant="caption">Mbps ↓</Typography>
                      </Typography>
                      <Chip label={`#${myRank.download_rank} of ${myRank.total_participants}`} size="small"
                        color="primary" variant="outlined" sx={{ mt: 0.5 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" fontWeight={700} color="#66BB6A">
                        {myRank.best_upload} <Typography component="span" variant="caption">Mbps ↑</Typography>
                      </Typography>
                      <Chip label={`Top ${myRank.download_percentile}%`} size="small"
                        color="success" variant="outlined" sx={{ mt: 0.5 }} />
                    </Box>
                  </Box>
                  {myRank.isp && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      ISP: {myRank.isp}
                    </Typography>
                  )}
                </>
              ) : (
                <Typography color="text.secondary" variant="body2">
                  Not submitted yet. Enter your name and click Submit to join.
                </Typography>
              )}
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <TextField
                  size="small" label="Display name" value={name}
                  onChange={e => setName(e.target.value)} sx={{ flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                />
                <Button variant="contained" onClick={submit} disabled={submitting || !name.trim()} size="small">
                  {submitting ? '…' : 'Submit'}
                </Button>
              </Box>
              {msg && <Alert severity={msgSev} sx={{ mt: 1 }} onClose={() => setMsg('')}>{msg}</Alert>}
            </CardContent>
          </Card>
        </Grid>

        {/* Global benchmarks */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LeaderboardIcon color="primary" fontSize="small" />
                <Typography variant="subtitle2" fontWeight={700}>Global Speed Benchmarks</Typography>
              </Box>
              {BENCHMARKS.map(b => (
                <Box key={b.label} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">{b.label}</Typography>
                    <Typography variant="caption" fontWeight={600} sx={{ color: b.color }}>
                      ↓{b.dl} / ↑{b.ul} Mbps
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, (b.dl / 940) * 100)}
                    sx={{ height: 5, borderRadius: 3, '& .MuiLinearProgress-bar': { background: b.color } }}
                  />
                </Box>
              ))}
              {myRank?.submitted && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ mb: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" fontWeight={600} color="primary">You ({myRank.display_name})</Typography>
                      <Typography variant="caption" fontWeight={700} color="primary">
                        ↓{myRank.best_download} / ↑{myRank.best_upload} Mbps
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, (myRank.best_download / 940) * 100)}
                      color="primary"
                      sx={{ height: 5, borderRadius: 3 }}
                    />
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Community table */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="🏆 Download Speed" />
        <Tab label="⬆️ Upload Speed" />
      </Tabs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {data?.total_participants ?? 0} participants worldwide
        </Typography>
        <TextField
          size="small"
          placeholder="Search by name or ISP…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ width: 220 }}
        />
      </Box>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <Card>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 50 }}>Rank</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">↓ Mbps</TableCell>
                <TableCell align="right">↑ Mbps</TableCell>
                <TableCell>ISP</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Country</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(e => {
                const isMe = myRank?.submitted && myRank?.display_name === e.display_name &&
                             myRank?.best_download === e.best_download;
                return (
                  <TableRow key={e.rank}
                    sx={{ bgcolor: isMe ? 'primary.light' : e.rank <= 3 ? 'action.hover' : 'inherit',
                          '&:hover': { bgcolor: 'action.selected' } }}>
                    <TableCell>
                      <Typography fontWeight={e.rank <= 3 ? 800 : 400} fontSize={e.rank <= 3 ? 18 : 14}>
                        {MEDAL[e.rank - 1] || e.rank}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {e.display_name}
                        {isMe && <Chip label="You" size="small" color="primary" sx={{ fontSize: 10, height: 18 }} />}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={600} color="primary">{e.best_download}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={600} color="success.main">{e.best_upload}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{e.isp || '—'}</Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="caption" color="text.secondary">{e.country || '—'}</Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      {search ? 'No results matching your search.' : 'No entries yet — be the first to submit!'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </Box>
  );
}
