import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Table, TableHead, TableBody, TableRow,
  TableCell, Chip, CircularProgress, Alert, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { motion } from 'framer-motion';
import { getISPReportCard } from '../services/api';

const GRADE_COLOR = { 'A+': 'success', 'A': 'success', 'B': 'primary', 'C': 'warning', 'D': 'error', 'F': 'error' };

export default function ISPReportCardPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);

  useEffect(() => {
    setLoading(true);
    getISPReportCard(days).then(r => setData(r.data)).finally(() => setLoading(false));
  }, [days]);

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>ISP Report Card</Typography>
        <Typography color="text.secondary" gutterBottom>
          Community-driven ISP performance rankings based on real speed tests.
        </Typography>
      </motion.div>

      <Box sx={{ mb: 2, mt: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Time window</InputLabel>
          <Select value={days} label="Time window" onChange={e => setDays(e.target.value)}>
            {[7, 14, 30, 60, 90].map(d => (
              <MenuItem key={d} value={d}>Last {d} days</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : !data?.report_cards?.length ? (
        <Alert severity="info">
          No ISP data yet. Run speed tests to populate this report.
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {data.isp_count} ISPs ranked — {data.window_days} day window
            </Typography>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>ISP</TableCell>
                  <TableCell align="center">Grade</TableCell>
                  <TableCell align="right">Score</TableCell>
                  <TableCell align="right">Avg Download</TableCell>
                  <TableCell align="right">Avg Upload</TableCell>
                  <TableCell align="right">Avg Ping</TableCell>
                  <TableCell align="right">Tests</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.report_cards.map(r => (
                  <TableRow key={r.isp} hover>
                    <TableCell>{r.rank}</TableCell>
                    <TableCell><Typography fontWeight={600}>{r.isp}</Typography></TableCell>
                    <TableCell align="center">
                      <Chip label={r.grade} color={GRADE_COLOR[r.grade] || 'default'} size="small" />
                    </TableCell>
                    <TableCell align="right">{r.score}</TableCell>
                    <TableCell align="right">{r.avg_download} Mbps</TableCell>
                    <TableCell align="right">{r.avg_upload} Mbps</TableCell>
                    <TableCell align="right">{r.avg_ping} ms</TableCell>
                    <TableCell align="right">{r.test_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
