'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'dark' | 'light';
interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'dark', toggle: () => {}, setTheme: () => {} });

/**
 * Read the theme synchronously on first render (browser only). Combined with
 * the inline bootstrap script in app/layout.tsx, this prevents a hydration
 * flash and avoids an extra render that would otherwise happen inside
 * `useEffect`.
 */
function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem('shipublic.theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  // Keep <html data-theme> in sync without forcing an extra render on mount.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem('shipublic.theme', t); } catch {}
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('shipublic.theme', next); } catch {}
      return next;
    });
  }, []);

  // Memoize the context value so consumers don't rerender unless theme changes.
  const value = useMemo<ThemeCtx>(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
