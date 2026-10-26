import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#F7F3EE',
  surface: '#FFFFFF',
  border: '#E8DFD4',
  text: '#1F1B16',
  muted: '#7A6F64',
  accent: '#E2531A',
  accentSoft: '#FCE7DC',
  onAccent: '#FFFFFF',
  tabBar: 'rgba(255,255,255,0.50)',
  tabBarBorder: 'rgba(255,255,255,0.85)',
  glow: ['#FFFFFF', '#FFD9BF', '#FF8A3D', '#FFF7F2'],
};

const dark: typeof light = {
  bg: '#141210',
  surface: '#1F1B18',
  border: '#332C26',
  text: '#F5EFE8',
  muted: '#A89C90',
  accent: '#FF6B2C',
  accentSoft: '#3B2418',
  onAccent: '#FFFFFF',
  tabBar: 'rgba(255,255,255,0.62)',
  tabBarBorder: 'rgba(255,255,255,0.90)',
  glow: ['#7A2E0E', '#3B2418', '#1F1B18', '#141210'],
};

export type Theme = typeof light;

/** What the user picked. `system` follows the OS light/dark setting. */
export type ThemeMode = 'system' | 'light' | 'dark';
/** The palette actually in effect after resolving `mode` against the OS. */
export type Scheme = 'light' | 'dark';

const STORAGE_KEY = 'ember.themeMode';

type ThemeModeContextValue = {
  mode: ThemeMode;
  scheme: Scheme;
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
  /** Flip between light and dark, pinning an explicit choice (leaves `system`). */
  toggle: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function isMode(v: string | null): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark';
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const system: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Restore the persisted choice once; fall back to system on any read error.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (alive && isMode(v)) setModeState(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const scheme: Scheme = mode === 'system' ? system : mode;
  const theme = scheme === 'dark' ? dark : light;
  const toggle = () => setMode(scheme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeModeContext.Provider value={{ mode, scheme, theme, setMode, toggle }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

/** Resolved palette. Safe to call anywhere under `ThemeModeProvider`. */
export const useTheme = (): Theme => useContext(ThemeModeContext)?.theme ?? light;

/** Page background for a scheme, for full-screen transition backdrops. */
export const bgFor = (s: Scheme): string => (s === 'dark' ? dark.bg : light.bg);

/** Full theme-mode controls (mode, scheme, setMode, toggle). Provider required. */
export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
