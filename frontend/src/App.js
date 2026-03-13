import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Box, Button,
  IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, useMediaQuery, useTheme, Divider, Tooltip
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MapIcon from '@mui/icons-material/Map';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import WifiIcon from '@mui/icons-material/Wifi';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import StarIcon from '@mui/icons-material/Star';
import PublicIcon from '@mui/icons-material/Public';
import HistoryIcon from '@mui/icons-material/History';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InsightsIcon from '@mui/icons-material/Insights';
import SecurityIcon from '@mui/icons-material/Security';
import BiotechIcon from '@mui/icons-material/Biotech';
import TimelineIcon from '@mui/icons-material/Timeline';
import PsychologyIcon from '@mui/icons-material/Psychology';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { useColorMode } from './ColorModeContext';
import Dashboard from './components/Dashboard';
import OutageMap from './components/OutageMap';
import ReportForm from './components/ReportForm';
import ISPReliabilityPage from './components/ISPReliabilityPage';
import StatusPage from './components/StatusPage';
import TimelinePage from './components/TimelinePage';
import DiagnosticsPage from './components/DiagnosticsPage';
import AIInsightsPage from './components/AIInsightsPage';
import AdvancedInsightsPage from './components/AdvancedInsightsPage';
import GamingModePage from './components/GamingModePage';
import VideoCallQualityPage from './components/VideoCallQualityPage';
import CoolFeaturesPage from './components/CoolFeaturesPage';
import SecurityDashboard from './components/SecurityDashboard';
import AdvancedDiagnosticsPage from './components/AdvancedDiagnosticsPage';
import HistoricalVisualizationPage from './components/HistoricalVisualizationPage';
import AIInsightsEnhancedPage from './components/AIInsightsEnhancedPage';
import SmartAlertsPage from './components/SmartAlertsPage';

// Groups used in the desktop nav for visual separation
const NAV_ITEMS = [
  // Core
  { label: 'Dashboard',    path: '/',                     icon: <DashboardIcon fontSize="small" />,   group: 'core' },
  { label: 'Status',       path: '/status',               icon: <PublicIcon fontSize="small" />,      group: 'core' },
  { label: 'Outage Map',   path: '/map',                  icon: <MapIcon fontSize="small" />,         group: 'core' },
  { label: 'Report',       path: '/report',               icon: <ReportProblemIcon fontSize="small" />,group: 'core' },
  { label: 'ISP',          path: '/isp',                  icon: <StarIcon fontSize="small" />,        group: 'core' },
  { label: 'Cool',         path: '/cool',                 icon: <AutoAwesomeIcon fontSize="small" />, group: 'core' },
  // Group 1 — Advanced Diagnostics
  { label: 'Diagnostics',  path: '/diagnostics-advanced', icon: <BiotechIcon fontSize="small" />,     group: 'g1' },
  // Group 2 — Historical Visualization
  { label: 'Historical',   path: '/history',              icon: <TimelineIcon fontSize="small" />,    group: 'g2' },
  // Group 3 — AI Insights
  { label: 'AI Insights',  path: '/ai-enhanced',          icon: <PsychologyIcon fontSize="small" />,  group: 'g3' },
  // Other
  { label: 'Advanced',     path: '/advanced',             icon: <InsightsIcon fontSize="small" />,              group: 'other' },
  { label: 'Security',     path: '/security',             icon: <SecurityIcon fontSize="small" />,              group: 'other' },
  { label: 'Alerts',       path: '/alerts',               icon: <NotificationsActiveIcon fontSize="small" />,   group: 'other' },
];

// Full drawer list including hidden routes
const DRAWER_ITEMS = [
  { section: 'Core', items: [
    { label: 'Dashboard',    path: '/',       icon: <DashboardIcon /> },
    { label: 'Status',       path: '/status', icon: <PublicIcon /> },
    { label: 'Outage Map',   path: '/map',    icon: <MapIcon /> },
    { label: 'Report Issue', path: '/report', icon: <ReportProblemIcon /> },
    { label: 'ISP Reliability', path: '/isp', icon: <StarIcon /> },
    { label: 'Cool Features',path: '/cool',   icon: <AutoAwesomeIcon /> },
  ]},
  { section: 'Group 1 — Advanced Diagnostics', items: [
    { label: 'Advanced Diagnostics', path: '/diagnostics-advanced', icon: <BiotechIcon /> },
    { label: 'Basic Diagnostics',    path: '/diagnostics',          icon: <NetworkCheckIcon /> },
  ]},
  { section: 'Group 2 — Historical Data', items: [
    { label: 'Historical Visualization', path: '/history',   icon: <TimelineIcon /> },
    { label: 'Timeline',                 path: '/timeline',  icon: <HistoryIcon /> },
  ]},
  { section: 'Group 3 — AI Insights', items: [
    { label: 'AI Insights Enhanced', path: '/ai-enhanced', icon: <PsychologyIcon /> },
    { label: 'AI Insights (Basic)',  path: '/insights',    icon: <AutoAwesomeIcon /> },
  ]},
  { section: 'Other', items: [
    { label: 'Advanced',      path: '/advanced', icon: <InsightsIcon /> },
    { label: 'Security',      path: '/security', icon: <SecurityIcon /> },
    { label: 'Smart Alerts',  path: '/alerts',   icon: <NotificationsActiveIcon /> },
  ]},
];

function NavBar() {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode, toggleColorMode } = useColorMode();

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          background: 'linear-gradient(135deg, #000000 0%, #0a0800 60%, #111000 100%)',
          borderBottom: '1.5px solid rgba(240,194,75,0.45)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 32px rgba(240,194,75,0.12)',
        }}
      >
        <Toolbar sx={{ px: { xs: 2, md: 4 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            <Box
              sx={{
                bgcolor: 'rgba(240,194,75,0.15)',
                borderRadius: 2,
                p: 0.75,
                display: 'flex',
                alignItems: 'center',
                border: '1px solid rgba(240,194,75,0.3)',
              }}
            >
              <WifiIcon sx={{ fontSize: 22, color: '#f0c24b' }} />
            </Box>
            <Box>
              <Typography
                variant="subtitle1"
                fontWeight={800}
                sx={{ lineHeight: 1.1, color: '#f0c24b', letterSpacing: '-0.3px' }}
              >
                Internet Stability Tracker
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                Community Network Monitor
              </Typography>
            </Box>
          </Box>

          {/* Dark / Light toggle — always visible */}
          <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <IconButton
              onClick={toggleColorMode}
              sx={{
                mr: isMobile ? 0.5 : 1,
                bgcolor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.18)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
                transition: 'background 0.2s',
              }}
              size="small"
            >
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          {isMobile ? (
            <IconButton color="inherit" onClick={() => setDrawerOpen(true)} edge="end">
              <MenuIcon />
            </IconButton>
          ) : (
            <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center' }}>
              {NAV_ITEMS.map((item, idx) => {
                const active = location.pathname === item.path;
                const prevGroup = idx > 0 ? NAV_ITEMS[idx - 1].group : item.group;
                const showDivider = idx > 0 && prevGroup !== item.group;
                return (
                  <React.Fragment key={item.path}>
                    {showDivider && (
                      <Box sx={{ width: '1px', height: 20, bgcolor: 'rgba(240,194,75,0.2)', mx: 0.25 }} />
                    )}
                    <Tooltip title={item.label} placement="bottom" arrow>
                      <Button
                        component={Link}
                        to={item.path}
                        startIcon={item.icon}
                        sx={{
                          color: active ? '#000' : 'rgba(255,255,255,0.75)',
                          fontWeight: active ? 800 : 500,
                          bgcolor: active ? '#f0c24b' : 'transparent',
                          borderRadius: 2,
                          px: 1.2,
                          fontSize: 12,
                          minWidth: 'auto',
                          whiteSpace: 'nowrap',
                          '& .MuiButton-startIcon': { mr: 0.4 },
                          '&:hover': {
                            bgcolor: active ? '#f6d978' : 'rgba(240,194,75,0.12)',
                            color: active ? '#000' : '#f0c24b',
                          },
                        }}
                      >
                        {item.label}
                      </Button>
                    </Tooltip>
                  </React.Fragment>
                );
              })}
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 270, background: '#080808', borderLeft: '1px solid rgba(240,194,75,0.2)' } }}>
        <Box sx={{ pt: 2, pb: 4 }}>
          <Box sx={{ px: 2.5, pb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WifiIcon sx={{ fontSize: 20, color: '#f0c24b' }} />
              <Box>
                <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#f0c24b', lineHeight: 1.1 }}>
                  IST
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                  Internet Stability Tracker
                </Typography>
              </Box>
            </Box>
          </Box>
          <Divider sx={{ borderColor: 'rgba(240,194,75,0.15)' }} />
          {DRAWER_ITEMS.map((group) => (
            <Box key={group.section}>
              <Typography variant="caption" sx={{ px: 2.5, pt: 2, pb: 0.5, display: 'block', color: 'rgba(240,194,75,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', fontSize: 10 }}>
                {group.section}
              </Typography>
              <List dense sx={{ px: 1, pb: 0.5 }}>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <ListItem key={item.path} disablePadding sx={{ mb: 0.25 }}>
                      <ListItemButton
                        component={Link}
                        to={item.path}
                        selected={active}
                        onClick={() => setDrawerOpen(false)}
                        sx={{
                          borderRadius: 2, py: 0.75,
                          '&.Mui-selected': {
                            bgcolor: 'rgba(240,194,75,0.15)',
                            '& .MuiListItemIcon-root': { color: '#f0c24b' },
                            '& .MuiListItemText-primary': { color: '#f0c24b', fontWeight: 700 },
                          },
                          '&:hover': { bgcolor: 'rgba(240,194,75,0.07)' },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 34, color: active ? '#f0c24b' : 'rgba(255,255,255,0.5)' }}>
                          {React.cloneElement(item.icon, { fontSize: 'small' })}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{ fontSize: 13, fontWeight: active ? 700 : 400, color: active ? '#f0c24b' : 'rgba(255,255,255,0.75)' }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mx: 2 }} />
            </Box>
          ))}
        </Box>
      </Drawer>
    </>
  );
}

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Box sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            inset: 0,
            background: (theme) => theme.palette.mode === 'dark'
              ? 'radial-gradient(1000px 800px at 14% 12%, rgba(240,194,75,0.1), transparent 55%), radial-gradient(700px 600px at 82% -6%, rgba(240,194,75,0.07), transparent 50%)'
              : 'radial-gradient(1200px 1200px at 12% 6%, rgba(240,194,75,0.07), transparent 52%), radial-gradient(900px 900px at 85% 0%, rgba(90,99,120,0.06), transparent 55%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <NavBar />
        <Box sx={{ position: 'relative', zIndex: 1, pb: 6 }}>
          <Routes>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/status"     element={<StatusPage />} />
            <Route path="/cool"       element={<CoolFeaturesPage />} />
            <Route path="/gaming"     element={<GamingModePage />} />
            <Route path="/video"      element={<VideoCallQualityPage />} />
            <Route path="/map"        element={<OutageMap />} />
            <Route path="/report"     element={<ReportForm />} />
            <Route path="/isp"        element={<ISPReliabilityPage />} />
            <Route path="/timeline"   element={<TimelinePage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/insights"   element={<AIInsightsPage />} />
            <Route path="/advanced"   element={<AdvancedInsightsPage />} />
            <Route path="/security"   element={<SecurityDashboard />} />
            <Route path="/diagnostics-advanced" element={<AdvancedDiagnosticsPage />} />
            <Route path="/history"    element={<HistoricalVisualizationPage />} />
            <Route path="/ai-enhanced" element={<AIInsightsEnhancedPage />} />
            <Route path="/alerts"     element={<SmartAlertsPage />} />
          </Routes>
        </Box>
      </Box>
    </Router>
  );
}

export default App;
