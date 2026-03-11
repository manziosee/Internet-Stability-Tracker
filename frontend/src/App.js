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
import { useColorMode } from './ColorModeContext';
import Dashboard from './components/Dashboard';
import OutageMap from './components/OutageMap';
import ReportForm from './components/ReportForm';
import ISPReliabilityPage from './components/ISPReliabilityPage';
import StatusPage from './components/StatusPage';
import TimelinePage from './components/TimelinePage';
import DiagnosticsPage from './components/DiagnosticsPage';
import AIInsightsPage from './components/AIInsightsPage';

const NAV_ITEMS = [
  { label: 'Dashboard',    path: '/',           icon: <DashboardIcon fontSize="small" /> },
  { label: 'Status',       path: '/status',     icon: <PublicIcon fontSize="small" /> },
  { label: 'Outage Map',   path: '/map',        icon: <MapIcon fontSize="small" /> },
  { label: 'Report Issue', path: '/report',     icon: <ReportProblemIcon fontSize="small" /> },
  { label: 'ISP Reliability', path: '/isp',    icon: <StarIcon fontSize="small" /> },
  { label: 'Timeline',     path: '/timeline',   icon: <HistoryIcon fontSize="small" /> },
  { label: 'Diagnostics',  path: '/diagnostics',icon: <NetworkCheckIcon fontSize="small" /> },
  { label: 'AI Insights',  path: '/insights',   icon: <AutoAwesomeIcon fontSize="small" /> },
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
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    component={Link}
                    to={item.path}
                    startIcon={item.icon}
                    sx={{
                      color: active ? '#000' : 'rgba(255,255,255,0.75)',
                      fontWeight: active ? 800 : 500,
                      bgcolor: active ? '#f0c24b' : 'transparent',
                      borderRadius: 2,
                      px: 1.5,
                      fontSize: 13,
                      '&:hover': {
                        bgcolor: active ? '#f6d978' : 'rgba(240,194,75,0.12)',
                        color: active ? '#000' : '#f0c24b',
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 260, pt: 2 }}>
          <Box sx={{ px: 2, pb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} color="primary">
              Internet Stability Tracker
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Community Network Monitor
            </Typography>
          </Box>
          <Divider />
          <List sx={{ pt: 1 }}>
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path;
              return (
                <ListItem key={item.path} disablePadding sx={{ px: 1, mb: 0.5 }}>
                  <ListItemButton
                    component={Link}
                    to={item.path}
                    selected={active}
                    onClick={() => setDrawerOpen(false)}
                    sx={{
                      borderRadius: 2,
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'white',
                        '& .MuiListItemIcon-root': { color: 'white' },
                        '&:hover': { bgcolor: 'primary.dark' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: active ? 700 : 500 }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
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
            <Route path="/map"        element={<OutageMap />} />
            <Route path="/report"     element={<ReportForm />} />
            <Route path="/isp"        element={<ISPReliabilityPage />} />
            <Route path="/timeline"   element={<TimelinePage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/insights"   element={<AIInsightsPage />} />
          </Routes>
        </Box>
      </Box>
    </Router>
  );
}

export default App;
