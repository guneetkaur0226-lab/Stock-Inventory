import { useEffect, useState } from 'react';

const KEY = 'ms.theme';
const read = () => {
  try {
    return localStorage.getItem(KEY) || 'auto';
  } catch {
    return 'auto';
  }
};

function apply(mode) {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#12171d' : '#0f4c5c');
}

export function initTheme() {
  apply(read());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => apply(read()));
}

export function useTheme() {
  const [mode, setMode] = useState(read);
  useEffect(() => {
    apply(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  return [mode, setMode];
}
