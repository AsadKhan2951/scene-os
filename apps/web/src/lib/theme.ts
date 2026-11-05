'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
import { THEME_KEY as KEY } from './themeBoot';


export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'); }, []);
  const toggle = useCallback(() => {
    setTheme((now) => {
      const next: Theme = now === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);
  return { theme, toggle };
}
