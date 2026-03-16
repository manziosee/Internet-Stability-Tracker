import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField,
  CircularProgress, Alert, Chip, LinearProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip,
} from '@mui/material';
import DevicesIcon from '@mui/icons-material/Devices';
import AddLinkIcon from '@mui/icons-material/AddLink';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WifiIcon from '@mui/icons-material/Wifi';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { getMyDeviceGroups, linkDevice, unlinkDevice, compareDevices, getNearbyDevices } from '../services/api';

// Short 6-char code from group UUID for easy mobile entry
function shortCode(uuid) {
  return (uuid || '').replace(/-/g, '').substring(0, 6).toUpperCase();
}

// Deterministic group ID based on the shared public IP — all devices behind the
// same router get the same my_ip from the server, so this is always identical.
function networkGroupId(ip) {
  return 'wifi-' + (ip || 'unknown').replace(/[.:]/g, '-');
}

// 6-char display code derived from IP for easy verbal confirmation
function networkDisplayCode(ip) {
  if (!ip) return '------';
  let h = 5381;
  for (let i = 0; i < ip.length; i++) h = (((h << 5) + h) ^ ip.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

// QR code image using free qrserver.com API (no npm dep needed)
function QRCode({ value, size = 140 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=000000&margin=8`;
  return (
    <Box
      component="img"
      src={url}
      alt="QR Code"
      sx={{ width: size, height: size, borderRadius: 2, display: 'block' }}
    />
  );
}

export default function MultiDevicePage() {
  const [groups,   setGroups]   = useState([]);
  const [nearby,   setNearby]   = useState([]);
  const [myIp,     setMyIp]     = useState('');
  const [compare,  setCompare]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [cmpLoad,  setCmpLoad]  = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState('');
  const [open,     setOpen]     = useState(false);
  const [qrOpen,   setQrOpen]   = useState(false);
  const [qrGroup,  setQrGroup]  = useState(null);
  const [form,     setForm]     = useState({ group_id: '', label: '' });
  const [copied,   setCopied]   = useState('');
  const scanTimer = useRef(null);

  // Build a shareable join URL
  const joinUrl = (groupId) =>
    `${window.location.origin}/multi-device?join=${groupId}`;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getMyDeviceGroups()
      .then(r => setGroups(r.data?.groups || []))
      .catch(() => setError('Could not load device groups.'))
      .finally(() => setLoading(false));
  }, []);

  const loadCompare = useCallback(() => {
    setCmpLoad(true);
    compareDevices()
      .then(r => setCompare(r.data))
      .catch(() => {})
      .finally(() => setCmpLoad(false));
  }, []);

  const scanNearby = useCallback(() => {
    setScanning(true);
    getNearbyDevices()
      .then(r => {
        setNearby(r.data?.nearby || []);
        if (r.data?.my_ip) setMyIp(r.data.my_ip);
      })
      .catch(() => {})
      .finally(() => setScanning(false));
  }, []);

  // Auto-handle ?join= query param (scan from QR / shared link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      setForm({ group_id: joinId, label: '' });
      setOpen(true);
      // Clean URL
      window.history.replaceState({}, '', '/multi-device');
    }
  }, []);

  // On mount: load groups + start nearby scan loop
  useEffect(() => {
    load();
    loadCompare();
    scanNearby();
    // Re-scan every 15 s so new devices appear quickly
    scanTimer.current = setInterval(scanNearby, 15000);
    return () => clearInterval(scanTimer.current);
  }, [load, loadCompare, scanNearby]);

  const handleLink = async (groupId, label) => {
    try {
      const gid = groupId || form.group_id || null;
      const lbl = label   || form.label    || 'My Device';
      await linkDevice({ group_id: gid, label: lbl });
      setOpen(false);
      setSuccess(`Linked to group "${lbl}" successfully.`);
      setTimeout(() => setSuccess(''), 3000);
      load(); loadCompare(); scanNearby();
    } catch {
      setError('Failed to link device.');
    }
  };

  const handleUnlink = async (groupId) => {
    try {
      await unlinkDevice(groupId);
      load(); loadCompare(); scanNearby();
    } catch {
      setError('Failed to unlink.');
    }
  };

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).catch(() => {
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    });
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const openQR = (group) => { setQrGroup(group); setQrOpen(true); };

  // First group this device is in (for QR sharing)
  const primaryGroup = groups[0] || null;

  return (
    <Box sx={{ p: 3, maxWidth: 980, mx: 'auto' }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DevicesIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Multi-Device</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<RefreshIcon />} onClick={() => { load(); scanNearby(); }} disabled={loading || scanning}>
            Refresh
          </Button>
          <Button variant="contained" size="small" startIcon={<AddLinkIcon />} onClick={() => { setForm({ group_id: '', label: '' }); setOpen(true); }}>
            Link Manually
          </Button>
        </Box>
      </Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
        Connect devices on the same WiFi network to compare their internet performance side-by-side.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* ── WIFI AUTO-JOIN (IP-based deterministic pairing) ── */}
      <Card sx={{ mb: 3, borderLeft: '4px solid', borderColor: 'primary.main' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WifiIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" fontWeight={700}>Same WiFi Network — Auto-Join</Typography>
              {scanning && <CircularProgress size={14} sx={{ ml: 1 }} />}
            </Box>
            <Tooltip title="Refresh network code">
              <IconButton size="small" onClick={scanNearby} disabled={scanning}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            All devices on the same WiFi share one public IP, giving them the same network code.
            Tap <strong>Auto-Join</strong> on each device to link them — no Bluetooth or manual entry needed.
          </Typography>

          {myIp ? (
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 'auto' }}>
                {/* Network Code badge */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{
                    px: 2.5, py: 1.5, borderRadius: 2,
                    bgcolor: 'primary.main', color: '#fff',
                    fontFamily: 'monospace', fontWeight: 900, fontSize: 30, letterSpacing: 6,
                    userSelect: 'all',
                  }}>
                    {networkDisplayCode(myIp)}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Network code · {myIp}
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: true }}>
                {/* Check if already joined this network group */}
                {(() => {
                  const ngid = networkGroupId(myIp);
                  const alreadyIn = groups.some(g => g.group_id === ngid);
                  return alreadyIn ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleIcon color="success" />
                      <Box>
                        <Typography variant="body2" fontWeight={700} color="success.main">
                          You're in the WiFi group
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Other devices that tap Auto-Join will appear in your comparison table below.
                        </Typography>
                      </Box>
                    </Box>
                  ) : (
                    <Box>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        Tap <strong>Auto-Join</strong> on this device and every other device on your WiFi to link them instantly.
                      </Typography>
                      <Button
                        variant="contained"
                        startIcon={<LinkIcon />}
                        onClick={() => handleLink(ngid, 'WiFi Network')}
                        size="small"
                      >
                        Auto-Join WiFi Group
                      </Button>
                    </Box>
                  );
                })()}
              </Grid>
            </Grid>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
              {scanning
                ? <><CircularProgress size={18} /><Typography variant="body2" color="text.secondary">Detecting your network…</Typography></>
                : <><WifiIcon sx={{ color: 'text.disabled' }} /><Typography variant="body2" color="text.secondary">Could not detect public IP. Try refreshing.</Typography></>
              }
            </Box>
          )}

          {/* If DB-based nearby also found devices (same Fly machine), show them too */}
          {nearby.length > 0 && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Also seen on this server instance:
              </Typography>
              <Grid container spacing={1}>
                {nearby.map((d) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={d.client_id}>
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: 1, p: 1,
                      borderRadius: 1.5, border: '1px solid', borderColor: 'divider',
                      bgcolor: 'action.hover',
                    }}>
                      <DevicesIcon fontSize="small" color="action" />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{d.label}</Typography>
                      </Box>
                      {!d.already_linked && (
                        <Button size="small" variant="outlined" startIcon={<LinkIcon />}
                          onClick={() => handleLink(primaryGroup?.group_id || crypto.randomUUID(), d.label)}>
                          Link
                        </Button>
                      )}
                      {d.already_linked && <CheckCircleIcon fontSize="small" color="success" />}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── SHARE / QR ── */}
      {primaryGroup && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
              Invite Another Device to Your Group
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 'auto' }}>
                <QRCode value={joinUrl(primaryGroup.group_id)} size={120} />
              </Grid>
              <Grid size={{ xs: 12, sm: true }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Scan the QR code on another device, or share the join link / code below.
                </Typography>

                {/* Short code */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{
                    px: 2, py: 1, borderRadius: 1.5,
                    bgcolor: 'primary.main', color: '#fff',
                    fontFamily: 'monospace', fontWeight: 900, fontSize: 22, letterSpacing: 4,
                  }}>
                    {shortCode(primaryGroup.group_id)}
                  </Box>
                  <Typography variant="caption" color="text.secondary">6-char code</Typography>
                </Box>

                {/* Full join URL */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    value={joinUrl(primaryGroup.group_id)}
                    inputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: 11 } }}
                    sx={{ flex: 1, minWidth: 200 }}
                  />
                  <Tooltip title={copied === 'url' ? 'Copied!' : 'Copy join link'}>
                    <IconButton size="small" onClick={() => copy(joinUrl(primaryGroup.group_id), 'url')}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Show QR">
                    <IconButton size="small" onClick={() => openQR(primaryGroup)}>
                      <QrCode2Icon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

      {/* ── MY GROUPS ── */}
      {!loading && groups.length === 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <DevicesIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" gutterBottom>No linked devices yet.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Use <strong>Auto-Join WiFi Group</strong> above on each device, or link manually with a code.
            </Typography>
            <Button variant="contained" onClick={() => { setForm({ group_id: '', label: '' }); setOpen(true); }}>
              Link Manually
            </Button>
          </CardContent>
        </Card>
      )}

      {groups.length > 0 && (
        <>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Your Linked Devices</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {groups.map((g) => (
              <Grid size={{ xs: 12, sm: 6 }} key={g.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {g.is_primary && <StarIcon fontSize="small" sx={{ color: '#FFC107' }} />}
                        <Typography variant="subtitle2" fontWeight={700}>{g.label}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        {g.is_primary && (
                          <Chip label="This Device" size="small" color="primary" sx={{ height: 18, fontSize: 10 }} />
                        )}
                        <Tooltip title="Show QR to invite others">
                          <IconButton size="small" onClick={() => openQR(g)}>
                            <QrCode2Icon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Copy join link">
                          <IconButton size="small" onClick={() => copy(joinUrl(g.group_id), g.id)}>
                            <ContentCopyIcon fontSize="small" sx={{ color: copied === g.id ? 'success.main' : undefined }} />
                          </IconButton>
                        </Tooltip>
                        {!g.is_primary && (
                          <Tooltip title="Unlink">
                            <IconButton size="small" color="error" onClick={() => handleUnlink(g.group_id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block', mb: 0.5 }}>
                      Code: <strong>{shortCode(g.group_id)}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      Joined {new Date(g.joined_at).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* ── COMPARISON TABLE ── */}
      {compare?.devices?.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={700}>Performance Comparison (Last 7 Days)</Typography>
              <Button size="small" onClick={loadCompare} disabled={cmpLoad}>Refresh</Button>
            </Box>
            {cmpLoad && <LinearProgress sx={{ mb: 1 }} />}
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <Box component="thead">
                  <Box component="tr">
                    {['Device', 'Download', 'Upload', 'Ping', 'Tests'].map(h => (
                      <Box component="th" key={h} sx={{
                        textAlign: 'left', py: 0.75, px: 1,
                        borderBottom: '2px solid', borderColor: 'divider',
                        fontWeight: 700, color: 'text.secondary', fontSize: 12,
                      }}>
                        {h}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {compare.devices.map((d, i) => (
                    <Box component="tr" key={i} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      <Box component="td" sx={{ py: 0.75, px: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={d.is_me ? 700 : 400}>{d.label}</Typography>
                          {d.is_me && <Chip label="You" size="small" color="primary" sx={{ height: 16, fontSize: 10 }} />}
                          {d.is_primary && !d.is_me && <StarIcon sx={{ fontSize: 12, color: '#FFC107' }} />}
                        </Box>
                      </Box>
                      <Box component="td" sx={{ py: 0.75, px: 1, borderBottom: '1px solid', borderColor: 'divider', color: 'primary.main', fontWeight: 600 }}>
                        {d.avg_download != null ? `${d.avg_download} Mbps` : '—'}
                      </Box>
                      <Box component="td" sx={{ py: 0.75, px: 1, borderBottom: '1px solid', borderColor: 'divider', color: 'secondary.main', fontWeight: 600 }}>
                        {d.avg_upload != null ? `${d.avg_upload} Mbps` : '—'}
                      </Box>
                      <Box component="td" sx={{ py: 0.75, px: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        {d.avg_ping != null ? `${d.avg_ping} ms` : '—'}
                      </Box>
                      <Box component="td" sx={{ py: 0.75, px: 1, borderBottom: '1px solid', borderColor: 'divider', color: 'text.secondary' }}>
                        {d.sample_count ?? 0}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── MANUAL LINK DIALOG ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Link a Device</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert severity="info">
            Paste a 6-character code or the full group ID from another device. Leave blank to create a new group.
          </Alert>
          <TextField
            label="Group ID or 6-char code"
            value={form.group_id}
            onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))}
            fullWidth
            placeholder="e.g. A3F9B2 or paste full UUID"
            autoFocus
          />
          <TextField
            label="This device's label"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            fullWidth
            placeholder="e.g. Laptop, Phone, Smart TV"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => handleLink(form.group_id || null, form.label || 'My Device')}>
            Link
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── QR DIALOG ── */}
      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Share Group — {qrGroup?.label}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
          {qrGroup && <QRCode value={joinUrl(qrGroup.group_id)} size={200} />}
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Scan this QR code on another device (phone, tablet, laptop) to join this group instantly.
          </Typography>
          {qrGroup && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  px: 2.5, py: 1, borderRadius: 2,
                  bgcolor: 'primary.main', color: '#fff',
                  fontFamily: 'monospace', fontWeight: 900, fontSize: 28, letterSpacing: 6,
                }}>
                  {shortCode(qrGroup.group_id)}
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">6-char code — type this on any device</Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {qrGroup && (
            <Button
              startIcon={<ContentCopyIcon />}
              onClick={() => copy(joinUrl(qrGroup.group_id), 'qr')}
            >
              {copied === 'qr' ? 'Copied!' : 'Copy Link'}
            </Button>
          )}
          <Button variant="contained" onClick={() => setQrOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
