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
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import VerifiedIcon from '@mui/icons-material/Verified';
import ShieldIcon from '@mui/icons-material/Shield';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DownloadIcon from '@mui/icons-material/Download';
import KeyIcon from '@mui/icons-material/Key';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupsIcon from '@mui/icons-material/Groups';
import ContractIcon from '@mui/icons-material/Assignment';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DevicesIcon from '@mui/icons-material/Devices';
import DnsIcon from '@mui/icons-material/Dns';
import GavelIcon from '@mui/icons-material/Gavel';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
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
import ISPSLAPage from './components/ISPSLAPage';
import ThrottleDetectorPage from './components/ThrottleDetectorPage';
import NetworkHealthPage from './components/NetworkHealthPage';
import WeeklyReportPage from './components/WeeklyReportPage';
import CostCalculatorPage from './components/CostCalculatorPage';
import LeaderboardPage from './components/LeaderboardPage';
import ExportPage from './components/ExportPage';
import APIKeysPage from './components/APIKeysPage';
import ISPReportCardPage from './components/ISPReportCardPage';
import BeforeAfterPage from './components/BeforeAfterPage';
import UptimeCalendarPage from './components/UptimeCalendarPage';
import ISPCommunityPage from './components/ISPCommunityPage';
import SpeedTrendPage from './components/SpeedTrendPage';
import ISPContractPage from './components/ISPContractPage';
import CertificatePage from './components/CertificatePage';
import BestTimePage from './components/BestTimePage';
import MultiDevicePage from './components/MultiDevicePage';
import DNSMonitorPage from './components/DNSMonitorPage';
import ComplaintLetterPage from './components/ComplaintLetterPage';
import ScheduledTestsPage from './components/ScheduledTestsPage';
import PacketLossPage from './components/PacketLossPage';
import WFHScorePage from './components/WFHScorePage';

// Core nav items shown in top bar (keep ≤8 for readability)
const NAV_ITEMS = [
  { label: 'Dashboard',    path: '/',             icon: <DashboardIcon fontSize="small" />,          group: 'core' },
  { label: 'Status',       path: '/status',       icon: <PublicIcon fontSize="small" />,             group: 'core' },
  { label: 'Outage Map',   path: '/map',          icon: <MapIcon fontSize="small" />,                group: 'core' },
  { label: 'AI Insights',  path: '/ai-enhanced',  icon: <PsychologyIcon fontSize="small" />,         group: 'core' },
  { label: 'Health',       path: '/health-score', icon: <HealthAndSafetyIcon fontSize="small" />,    group: 'tools' },
  { label: 'Leaderboard',  path: '/leaderboard',  icon: <EmojiEventsIcon fontSize="small" />,        group: 'tools' },
  { label: 'Alerts',       path: '/alerts',       icon: <NotificationsActiveIcon fontSize="small" />,group: 'tools' },
  { label: 'Security',     path: '/security',     icon: <SecurityIcon fontSize="small" />,           group: 'tools' },
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
    { label: 'Advanced',      path: '/advanced',     icon: <InsightsIcon /> },
    { label: 'Security',      path: '/security',     icon: <SecurityIcon /> },
    { label: 'Smart Alerts',  path: '/alerts',       icon: <NotificationsActiveIcon /> },
    { label: 'Leaderboard',   path: '/leaderboard',  icon: <EmojiEventsIcon /> },
    { label: 'Health Score',  path: '/health-score', icon: <HealthAndSafetyIcon /> },
  ]},
  { section: 'Tools & Features', items: [
    { label: 'ISP SLA Tracker',   path: '/isp-sla',       icon: <VerifiedIcon /> },
    { label: 'Throttle Detector', path: '/throttle',       icon: <ShieldIcon /> },
    { label: 'Cost Calculator',   path: '/cost-calc',      icon: <AttachMoneyIcon /> },
    { label: 'Weekly Report',     path: '/weekly-report',  icon: <AssessmentIcon /> },
    { label: 'Before/After',      path: '/before-after',   icon: <CompareArrowsIcon /> },
    { label: 'ISP Report Card',   path: '/isp-report',     icon: <StarIcon /> },
    { label: 'Export Data',       path: '/export',         icon: <DownloadIcon /> },
    { label: 'API Keys',          path: '/api-keys',        icon: <KeyIcon /> },
    { label: 'Uptime Calendar',   path: '/uptime-calendar', icon: <CalendarMonthIcon /> },
    { label: 'ISP Community',     path: '/isp-community',   icon: <GroupsIcon /> },
    { label: 'Speed Trend',       path: '/speed-trend',     icon: <TrendingUpIcon /> },
  ]},
  { section: 'v3.3 — New Features', items: [
    { label: 'ISP Contract Tracker', path: '/isp-contract',    icon: <ContractIcon /> },
    { label: 'Quality Certificate',  path: '/certificate',     icon: <WorkspacePremiumIcon /> },
    { label: 'Best Time to Use',     path: '/best-time',       icon: <AccessTimeIcon /> },
    { label: 'Multi-Device',         path: '/multi-device',    icon: <DevicesIcon /> },
    { label: 'DNS Monitor',          path: '/dns-monitor',     icon: <DnsIcon /> },
    { label: 'Complaint Letter',     path: '/complaint-letter',icon: <GavelIcon /> },
    { label: 'Scheduled Tests',      path: '/schedules',       icon: <ScheduleIcon /> },
    { label: 'Packet Loss Monitor',  path: '/packet-loss',     icon: <SignalCellularAltIcon /> },
    { label: 'WFH Readiness',        path: '/wfh-score',       icon: <HomeWorkIcon /> },
  ]},
];

function NavBar() {
  const location = useLocation();
  const theme = useTheme();
  const isMobile  = useMediaQuery(theme.breakpoints.down('md'));
  const isCompact = useMediaQuery(theme.breakpoints.between('md', 'xl'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode, toggleColorMode } = useColorMode();

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 1400,
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(0,0,0,0.92) 0%, rgba(10,8,0,0.92) 60%, rgba(17,16,0,0.92) 100%)',
          border: '1.5px solid rgba(240,194,75,0.45)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 32px rgba(240,194,75,0.14), 0 2px 16px rgba(0,0,0,0.6)',
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

          {/* Hamburger always visible — opens full drawer */}
          <IconButton onClick={() => setDrawerOpen(true)} edge="end"
            sx={{ mr: isMobile ? 0 : 0.5, color: '#fff' }}>
            <MenuIcon />
          </IconButton>

          {/* Desktop: condensed icon+label or icon-only nav */}
          {!isMobile && (
            <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center', ml: 0.5 }}>
              {NAV_ITEMS.map((item, idx) => {
                const active = location.pathname === item.path;
                const prevGroup = idx > 0 ? NAV_ITEMS[idx - 1].group : item.group;
                const showDivider = idx > 0 && prevGroup !== item.group;
                return (
                  <React.Fragment key={item.path}>
                    {showDivider && (
                      <Box sx={{ width: '1px', height: 20, bgcolor: 'rgba(240,194,75,0.2)', mx: 0.25 }} />
                    )}
                    <Tooltip title={isCompact ? item.label : ''} placement="bottom" arrow>
                      <Button
                        component={Link}
                        to={item.path}
                        startIcon={item.icon}
                        sx={{
                          color: active ? '#000' : 'rgba(255,255,255,0.75)',
                          fontWeight: active ? 800 : 500,
                          bgcolor: active ? '#f0c24b' : 'transparent',
                          borderRadius: 2,
                          px: isCompact ? 0.8 : 1.2,
                          py: 0.6,
                          fontSize: 11,
                          minWidth: 'auto',
                          whiteSpace: 'nowrap',
                          '& .MuiButton-startIcon': { mr: isCompact ? 0 : 0.4 },
                          '&:hover': {
                            bgcolor: active ? '#f6d978' : 'rgba(240,194,75,0.12)',
                            color: active ? '#000' : '#f0c24b',
                          },
                        }}
                      >
                        {isCompact ? null : item.label}
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
        <Box sx={{ position: 'relative', zIndex: 1, pt: '76px', pb: 6 }}>
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
            <Route path="/alerts"        element={<SmartAlertsPage />} />
            <Route path="/isp-sla"       element={<ISPSLAPage />} />
            <Route path="/throttle"      element={<ThrottleDetectorPage />} />
            <Route path="/health-score"  element={<NetworkHealthPage />} />
            <Route path="/weekly-report" element={<WeeklyReportPage />} />
            <Route path="/cost-calc"     element={<CostCalculatorPage />} />
            <Route path="/leaderboard"   element={<LeaderboardPage />} />
            <Route path="/export"        element={<ExportPage />} />
            <Route path="/api-keys"      element={<APIKeysPage />} />
            <Route path="/isp-report"    element={<ISPReportCardPage />} />
            <Route path="/before-after"       element={<BeforeAfterPage />} />
            <Route path="/uptime-calendar"    element={<UptimeCalendarPage />} />
            <Route path="/isp-community"      element={<ISPCommunityPage />} />
            <Route path="/speed-trend"        element={<SpeedTrendPage />} />
            <Route path="/isp-contract"       element={<ISPContractPage />} />
            <Route path="/certificate"        element={<CertificatePage />} />
            <Route path="/best-time"          element={<BestTimePage />} />
            <Route path="/multi-device"       element={<MultiDevicePage />} />
            <Route path="/dns-monitor"        element={<DNSMonitorPage />} />
            <Route path="/complaint-letter"   element={<ComplaintLetterPage />} />
            <Route path="/schedules"          element={<ScheduledTestsPage />} />
            <Route path="/packet-loss"        element={<PacketLossPage />} />
            <Route path="/wfh-score"          element={<WFHScorePage />} />
          </Routes>
        </Box>
      </Box>
    </Router>
  );
}

export default App;
