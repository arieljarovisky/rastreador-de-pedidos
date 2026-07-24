import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AgencyPalette,
  ThemeMode,
  agencyPaletteFor,
} from '../theme';

const STORAGE_KEY = '@posta/theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  palette: AgencyPalette;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (stored === 'light' || stored === 'dark')) {
          setModeState(stored);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);

  const palette = useMemo(() => agencyPaletteFor(mode), [mode]);

  const value = useMemo(
    () => ({ mode, palette, setMode, toggleMode, ready }),
    [mode, palette, setMode, toggleMode, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return ctx;
}
