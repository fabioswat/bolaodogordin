// Tema claro/escuro. Sem escolha salva, segue o tema do aparelho.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'tema';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return saved() ?? (media.matches ? 'dark' : 'light');
}

const EVENT = 'app:theme';
function apply(): void {
  const t = currentTheme();
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.style.colorScheme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b1a13' : '#0b5d3b');
  window.dispatchEvent(new Event(EVENT));
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t); } catch { /* navegador sem armazenamento: vale só nesta visita */ }
  apply();
}

// Aplica já ao carregar (antes do React) e acompanha mudanças do aparelho quando não há escolha salva.
apply();
media.addEventListener('change', () => { if (!saved()) apply(); });

export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState(currentTheme);
  useEffect(() => {
    const update = () => setT(currentTheme());
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return [t, setTheme];
}
