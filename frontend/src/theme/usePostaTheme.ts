import { useEffect, useState } from 'react';

export type PostaTheme = 'dark' | 'paper';

/** Clave compartida con la landing (valores: light | dark). */
export const LANDING_THEME_KEY = 'posta-theme';

/** Clave legada del panel (valores: paper | dark). */
const LEGACY_APP_THEME_KEY = 'posta_theme';

function landingToAppTheme(value: string | null): PostaTheme | null {
  if (value === 'dark') return 'dark';
  if (value === 'light') return 'paper';
  return null;
}

function appToLandingTheme(theme: PostaTheme): 'light' | 'dark' {
  return theme === 'paper' ? 'light' : 'dark';
}

export function readPostaTheme(): PostaTheme {
  try {
    const fromLanding = landingToAppTheme(localStorage.getItem(LANDING_THEME_KEY));
    if (fromLanding) return fromLanding;

    const legacy = localStorage.getItem(LEGACY_APP_THEME_KEY);
    if (legacy === 'paper' || legacy === 'dark') return legacy;
  } catch {
    // ignore
  }
  return 'dark';
}

export function applyPostaTheme(theme: PostaTheme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-paper', theme === 'paper');
  try {
    localStorage.setItem(LANDING_THEME_KEY, appToLandingTheme(theme));
    localStorage.setItem(LEGACY_APP_THEME_KEY, theme);
  } catch {
    // ignore
  }
}

/** Suscribe al tema activo (html data-theme). */
export function usePostaTheme(): PostaTheme {
  const [theme, setTheme] = useState<PostaTheme>(() => readPostaTheme());

  useEffect(() => {
    const sync = () => {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'paper' || attr === 'dark') {
        setTheme(attr);
        return;
      }
      setTheme(readPostaTheme());
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    sync();
    return () => observer.disconnect();
  }, []);

  return theme;
}
