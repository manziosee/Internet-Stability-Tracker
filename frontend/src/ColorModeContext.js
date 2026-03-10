import React, { createContext, useContext, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { getTheme } from './theme';

const ColorModeContext = createContext({ toggleColorMode: () => {}, mode: 'light' });

export function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('colorMode') || 'light'; } catch { return 'light'; }
  });

  const colorMode = useMemo(() => ({
    mode,
    toggleColorMode: () => {
      setMode((prev) => {
        const next = prev === 'light' ? 'dark' : 'light';
        try { localStorage.setItem('colorMode', next); } catch {}
        return next;
      });
    },
  }), [mode]);

  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export const useColorMode = () => useContext(ColorModeContext);
