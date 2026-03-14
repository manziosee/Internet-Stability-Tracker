import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Button, TextField, Alert,
  List, ListItem, ListItemText, ListItemSecondaryAction, IconButton,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { motion } from 'framer-motion';
import KeyIcon from '@mui/icons-material/Key';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { listAPIKeys, createAPIKey, revokeAPIKey } from '../services/api';

export default function APIKeysPage() {
  const [keys,     setKeys]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [label,    setLabel]    = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey,   setNewKey]   = useState(null);
  const [msg,      setMsg]      = useState('');

  const load = () => {
    listAPIKeys().then(r => setKeys(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!label.trim()) return;
    setCreating(true);
    try {
      const r = await createAPIKey(label);
      setNewKey(r.data.key);
      setLabel('');
      load();
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Failed to create key.');
    } finally { setCreating(false); }
  };

  const revoke = async (id) => {
    await revokeAPIKey(id);
    load();
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setMsg('Copied to clipboard!');
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <KeyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />API Keys
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Generate API keys to integrate your speed data with external tools and scripts.
        </Typography>
      </motion.div>

      <Card sx={{ mt: 2, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>Create New Key</Typography>
          <Box display="flex" gap={2}>
            <TextField size="small" label="Key label (e.g. Home Script)" value={label}
              onChange={e => setLabel(e.target.value)} sx={{ flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && create()} />
            <Button variant="contained" onClick={create} disabled={creating || !label.trim()}>
              {creating ? 'Generating…' : 'Generate'}
            </Button>
          </Box>
          {msg && <Alert severity="info" sx={{ mt: 1 }} onClose={() => setMsg('')}>{msg}</Alert>}
        </CardContent>
      </Card>

      {loading ? <CircularProgress /> : (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Your Keys ({keys.length}/5)</Typography>
            {keys.length === 0 ? (
              <Typography color="text.secondary">No API keys yet. Create one above.</Typography>
            ) : (
              <List>
                {keys.map(k => (
                  <ListItem key={k.id} divider>
                    <ListItemText
                      primary={k.label}
                      secondary={
                        `Created: ${new Date(k.created_at).toLocaleDateString()}` +
                        (k.last_used ? ` • Last used: ${new Date(k.last_used).toLocaleDateString()}` : ' • Never used')
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton size="small" onClick={() => revoke(k.id)} color="error">
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!newKey} onClose={() => setNewKey(null)} maxWidth="sm" fullWidth>
        <DialogTitle>🔑 Your New API Key</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>Save this key now — it won't be shown again!</Alert>
          <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1,
            fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.82rem' }}>
            {newKey}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<ContentCopyIcon />} onClick={() => copy(newKey)}>Copy Key</Button>
          <Button variant="contained" onClick={() => setNewKey(null)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
