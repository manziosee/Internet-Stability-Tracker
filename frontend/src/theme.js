import { createTheme } from '@mui/material/styles';

export function getTheme(mode) {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: { main: '#f0c24b', light: '#f6d67a', dark: '#d4a21f', contrastText: '#0a0c12' },
      secondary: { main: '#d4a21f', light: '#f1d07a', dark: '#a87f17' },
      error: { main: '#ef5350', light: '#ff8a80' },
      warning: { main: '#f0c24b', light: '#f7dc8e' },
      success: { main: '#7bd88f', light: '#c8f1d4' },
      background: {
        default: isDark ? '#000000' : '#f2f4f7',
        paper: isDark ? '#080808' : '#ffffff',
      },
      text: {
        primary: isDark ? '#e5e9f2' : '#1a1d24',
        secondary: isDark ? '#9aa3b5' : '#4d5562',
      },
      divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    },
    typography: {
      fontFamily: '"Space Grotesk", "Inter", "Helvetica Neue", system-ui, sans-serif',
      h4: { fontWeight: 700, letterSpacing: '-0.6px' },
      h5: { fontWeight: 700, letterSpacing: '-0.6px' },
      h6: { fontWeight: 600, letterSpacing: '-0.3px' },
      subtitle1: { fontWeight: 600 },
      button: { letterSpacing: '0.3px', fontWeight: 700 },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: isDark
              ? '0 10px 40px rgba(0,0,0,0.7)'
              : '0 8px 26px rgba(0,0,0,0.08)',
            borderRadius: 16,
            border: isDark
              ? '1px solid rgba(240,194,75,0.08)'
              : '1px solid rgba(0,0,0,0.05)',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            boxShadow: isDark
              ? '0 4px 24px rgba(0,0,0,0.4)'
              : '0 2px 14px rgba(0,0,0,0.07)',
            borderRadius: 16,
            backgroundImage: 'none',
            ...(isDark && { border: '1px solid rgba(255,255,255,0.06)' }),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
            letterSpacing: '0.2px',
          },
          containedPrimary: {
            boxShadow: '0 8px 26px rgba(240,194,75,0.35)',
            '&:hover': { boxShadow: '0 10px 32px rgba(240,194,75,0.45)' },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 600,
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
            color: isDark ? '#94A3B8' : '#637381',
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 6 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          '#root': {
            minHeight: '100vh',
            backgroundColor: isDark ? '#000000' : '#f2f4f7',
            backgroundImage: isDark
              ? 'radial-gradient(1000px 800px at 15% 10%, rgba(240,194,75,0.1), transparent 55%), radial-gradient(800px 700px at 80% 0%, rgba(240,194,75,0.07), transparent 50%)'
              : 'radial-gradient(1200px 1200px at 10% 10%, rgba(240,194,75,0.07), transparent 55%), radial-gradient(900px 900px at 80% 0%, rgba(90,99,120,0.06), transparent 50%)',
          },
        },
      },
    },
  });
}
