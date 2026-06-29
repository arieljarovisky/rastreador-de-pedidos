import { useEffect, useState } from 'react';

export type PostaTheme = 'dark' | 'paper';

const STORAGE_KEY = 'posta_theme';

export function readPostaTheme(): PostaTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'paper' || saved === 'dark') return saved;
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
    localStorage.setItem(STORAGE_KEY, theme);
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
