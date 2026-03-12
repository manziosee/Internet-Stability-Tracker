import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Shield as ShieldIcon,
  VpnKey as VpnKeyIcon,
  NetworkCheck as NetworkCheckIcon,
  BugReport as BugReportIcon,
  Lock as LockIcon,
  Public as PublicIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { getSecurityAudit } from '../services/api';

const SecurityDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [error, setError] = useState(null);
  const [lastScan, setLastScan] = useState(null);

  useEffect(() => {
    runSecurityAudit();
  }, []);

  const runSecurityAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getSecurityAudit();
      setAuditData(response.data);
      setLastScan(new Date().toLocaleString());
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to run security audit');
    } finally {
      setLoading(false);
    }
  };

  const getPrivacyScoreColor = (score) => {
    if (score >= 90) return 'success';
    if (score >= 75) return 'info';
    if (score >= 60) return 'warning';
    return 'error';
  };

  const getRiskLevelColor = (level) => {
    const colors = {
      low: 'success',
      medium: 'warning',
      high: 'error',
      critical: 'error',
    };
    return colors[level] || 'default';
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <ErrorIcon color="error" />;
      case 'medium':
        return <WarningIcon color="warning" />;
      case 'low':
        return <CheckCircleIcon color="success" />;
      default:
        return <SecurityIcon />;
    }
  };

  if (loading && !auditData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Running Security Audit...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Scanning ports, checking privacy, detecting intrusions...
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Box>
            <Typography variant="h4" gutterBottom>
              <ShieldIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Network Security Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Comprehensive security audit of your network
            </Typography>
            {lastScan && (
              <Typography variant="caption" color="text.secondary">
                Last scan: {lastScan}
              </Typography>
            )}
          </Box>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
            onClick={runSecurityAudit}
            disabled={loading}
          >
            {loading ? 'Scanning...' : 'Run Audit'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {auditData && (
          <Grid container spacing={3}>
            {/* Privacy Score Card */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <LockIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Privacy Score</Typography>
                  </Box>
                  
                  {auditData.privacy_score && (
                    <>
                      <Box display="flex" alignItems="center" justifyContent="center" mb={2}>
                        <Box position="relative" display="inline-flex">
                          <CircularProgress
                            variant="determinate"
                            value={auditData.privacy_score.privacy_score || 0}
                            size={120}
                            thickness={5}
                            color={getPrivacyScoreColor(auditData.privacy_score.privacy_score || 0)}
                          />
                          <Box
                            position="absolute"
                            top={0}
                            left={0}
                            bottom={0}
                            right={0}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            flexDirection="column"
                          >
                            <Typography variant="h4" component="div">
                              {auditData.privacy_score.privacy_score || 0}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Grade: {auditData.privacy_score.grade || 'N/A'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Chip
                        label={auditData.privacy_score.status || 'Unknown'}
                        color={getPrivacyScoreColor(auditData.privacy_score.privacy_score || 0)}
                        sx={{ mb: 2 }}
                      />

                      {auditData.privacy_score.issues && auditData.privacy_score.issues.length > 0 && (
                        <Box mt={2}>
                          <Typography variant="subtitle2" gutterBottom>
                            Issues Found:
                          </Typography>
                          <List dense>
                            {auditData.privacy_score.issues.map((issue, idx) => (
                              <ListItem key={idx}>
                                <ListItemIcon>
                                  <WarningIcon color="warning" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary={issue} />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}

                      {auditData.privacy_score.recommendations && auditData.privacy_score.recommendations.length > 0 && (
                        <Box mt={2}>
                          <Typography variant="subtitle2" gutterBottom>
                            Recommendations:
                          </Typography>
                          <List dense>
                            {auditData.privacy_score.recommendations.map((rec, idx) => (
                              <ListItem key={idx}>
                                <ListItemIcon>
                                  <CheckCircleIcon color="success" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary={rec} />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Port Scan Results */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <NetworkCheckIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Port Scan</Typography>
                  </Box>

                  {auditData.port_scan && (
                    <>
                      <Box display="flex" gap={2} mb={2}>
                        <Chip
                          label={`${auditData.port_scan.total_open || 0} Open Ports`}
                          color="info"
                        />
                        <Chip
                          label={`${auditData.port_scan.total_vulnerable || 0} Vulnerable`}
                          color={auditData.port_scan.total_vulnerable > 0 ? 'error' : 'success'}
                        />
                        <Chip
                          label={`Risk: ${auditData.port_scan.risk_level || 'Unknown'}`}
                          color={getRiskLevelColor(auditData.port_scan.risk_level)}
                        />
                      </Box>

                      {auditData.port_scan.vulnerable_ports && auditData.port_scan.vulnerable_ports.length > 0 && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Vulnerable Ports Detected!
                          </Typography>
                          <List dense>
                            {auditData.port_scan.vulnerable_ports.map((port, idx) => (
                              <ListItem key={idx}>
                                <ListItemText
                                  primary={`Port ${port.port}: ${port.service}`}
                                  secondary={port.reason}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Alert>
                      )}

                      {auditData.port_scan.open_ports && auditData.port_scan.open_ports.length > 0 && (
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography>All Open Ports ({auditData.port_scan.open_ports.length})</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <TableContainer>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Port</TableCell>
                                    <TableCell>Service</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {auditData.port_scan.open_ports.map((port, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell>{port.port}</TableCell>
                                      <TableCell>{port.service}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </AccordionDetails>
                        </Accordion>
                      )}

                      {auditData.port_scan.recommendations && auditData.port_scan.recommendations.length > 0 && (
                        <Box mt={2}>
                          <Typography variant="subtitle2" gutterBottom>
                            Security Recommendations:
                          </Typography>
                          <List dense>
                            {auditData.port_scan.recommendations.map((rec, idx) => (
                              <ListItem key={idx}>
                                <ListItemIcon>
                                  <ShieldIcon color="primary" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary={rec} />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Intrusion Detection */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <BugReportIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Intrusion Detection</Typography>
                  </Box>

                  {auditData.intrusion_detection && (
                    <>
                      <Box display="flex" gap={2} mb={2}>
                        <Chip
                          label={`${auditData.intrusion_detection.intrusions_detected || 0} Intrusions`}
                          color={auditData.intrusion_detection.intrusions_detected > 0 ? 'error' : 'success'}
                        />
                        <Chip
                          label={`Status: ${auditData.intrusion_detection.status || 'Unknown'}`}
                          color={auditData.intrusion_detection.status === 'alert' ? 'error' : 'success'}
                        />
                      </Box>

                      {auditData.intrusion_detection.intrusions_detected === 0 ? (
                        <Alert severity="success">
                          <Typography variant="body2">
                            ✅ No suspicious activity detected. Your network appears secure.
                          </Typography>
                        </Alert>
                      ) : (
                        <>
                          <Alert severity="error" sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                              ⚠️ Suspicious Activity Detected!
                            </Typography>
                          </Alert>

                          {auditData.intrusion_detection.suspicious_activity && 
                           auditData.intrusion_detection.suspicious_activity.length > 0 && (
                            <List>
                              {auditData.intrusion_detection.suspicious_activity.map((activity, idx) => (
                                <ListItem key={idx}>
                                  <ListItemIcon>
                                    {getSeverityIcon(activity.severity)}
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={activity.type || activity.description}
                                    secondary={
                                      activity.timestamp 
                                        ? `Detected at: ${new Date(activity.timestamp).toLocaleString()}`
                                        : activity.count ? `Count: ${activity.count}` : ''
                                    }
                                  />
                                </ListItem>
                              ))}
                            </List>
                          )}
                        </>
                      )}

                      {auditData.intrusion_detection.recommendations && 
                       auditData.intrusion_detection.recommendations.length > 0 && (
                        <Box mt={2}>
                          <Typography variant="subtitle2" gutterBottom>
                            Recommended Actions:
                          </Typography>
                          <List dense>
                            {auditData.intrusion_detection.recommendations.map((rec, idx) => (
                              <ListItem key={idx}>
                                <ListItemIcon>
                                  <SecurityIcon color="primary" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary={rec} />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* VPN Recommendations */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <VpnKeyIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">VPN Recommendations</Typography>
                  </Box>

                  {auditData.vpn_recommendation && (
                    <>
                      {auditData.vpn_recommendation.your_location && (
                        <Box mb={2}>
                          <Typography variant="body2" color="text.secondary">
                            <PublicIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                            Location: {auditData.vpn_recommendation.your_location}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            ISP: {auditData.vpn_recommendation.your_isp || 'Unknown'}
                          </Typography>
                        </Box>
                      )}

                      <Chip
                        label={auditData.vpn_recommendation.should_use_vpn ? 'VPN Recommended' : 'VPN Optional'}
                        color={auditData.vpn_recommendation.should_use_vpn ? 'warning' : 'success'}
                        sx={{ mb: 2 }}
                      />

                      {auditData.vpn_recommendation.recommendations && 
                       auditData.vpn_recommendation.recommendations.length > 0 && (
                        <Box mb={2}>
                          <Typography variant="subtitle2" gutterBottom>
                            Why You Should Use VPN:
                          </Typography>
                          <List>
                            {auditData.vpn_recommendation.recommendations.map((rec, idx) => (
                              <ListItem key={idx}>
                                <ListItemIcon>
                                  <Chip
                                    label={rec.priority || 'medium'}
                                    size="small"
                                    color={rec.priority === 'high' ? 'error' : 'warning'}
                                  />
                                </ListItemIcon>
                                <ListItemText
                                  primary={rec.reason}
                                  secondary={
                                    rec.vpn_features && rec.vpn_features.length > 0
                                      ? `Features needed: ${rec.vpn_features.join(', ')}`
                                      : null
                                  }
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}

                      {auditData.vpn_recommendation.suggested_protocols && 
                       auditData.vpn_recommendation.suggested_protocols.length > 0 && (
                        <Box mb={2}>
                          <Typography variant="subtitle2" gutterBottom>
                            Recommended Protocols:
                          </Typography>
                          <Box display="flex" gap={1} flexWrap="wrap">
                            {auditData.vpn_recommendation.suggested_protocols.map((protocol, idx) => (
                              <Chip key={idx} label={protocol} size="small" variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                      )}

                      {auditData.vpn_recommendation.features_to_look_for && 
                       auditData.vpn_recommendation.features_to_look_for.length > 0 && (
                        <Box>
                          <Typography variant="subtitle2" gutterBottom>
                            Essential VPN Features:
                          </Typography>
                          <List dense>
                            {auditData.vpn_recommendation.features_to_look_for.map((feature, idx) => (
                              <ListItem key={idx}>
                                <ListItemIcon>
                                  <CheckCircleIcon color="success" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary={feature} />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Overall Security Summary */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Security Summary
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h4" color="primary">
                        {auditData.privacy_score?.privacy_score || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Privacy Score
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h4" color={auditData.port_scan?.total_vulnerable > 0 ? 'error' : 'success'}>
                        {auditData.port_scan?.total_vulnerable || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Vulnerable Ports
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h4" color={auditData.intrusion_detection?.intrusions_detected > 0 ? 'error' : 'success'}>
                        {auditData.intrusion_detection?.intrusions_detected || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Intrusions Detected
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h4" color={auditData.vpn_recommendation?.should_use_vpn ? 'warning' : 'success'}>
                        {auditData.vpn_recommendation?.should_use_vpn ? 'YES' : 'NO'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        VPN Needed
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

                <Box mt={3}>
                  <Alert 
                    severity={
                      (auditData.port_scan?.total_vulnerable > 0 || auditData.intrusion_detection?.intrusions_detected > 0)
                        ? 'error'
                        : auditData.privacy_score?.privacy_score < 75
                        ? 'warning'
                        : 'success'
                    }
                  >
                    {(auditData.port_scan?.total_vulnerable > 0 || auditData.intrusion_detection?.intrusions_detected > 0) ? (
                      <Typography variant="body2">
                        ⚠️ <strong>Action Required:</strong> Security vulnerabilities detected. Please review the recommendations above.
                      </Typography>
                    ) : auditData.privacy_score?.privacy_score < 75 ? (
                      <Typography variant="body2">
                        ℹ️ <strong>Improvement Suggested:</strong> Your network security is acceptable but could be improved.
                      </Typography>
                    ) : (
                      <Typography variant="body2">
                        ✅ <strong>All Clear:</strong> Your network security looks good! Continue monitoring regularly.
                      </Typography>
                    )}
                  </Alert>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        )}
      </motion.div>
    </Container>
  );
};

export default SecurityDashboard;
