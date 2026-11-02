import type { View } from './types';

export const VIEWS: View[] = ['welcome', 'dashboard', 'review', 'cleanup', 'settings'];

export function parseHash(hash: string): View | null {
  const value = hash.replace(/^#\/?/, '').replace(/\/$/, '').split('?')[0];
  if (!value) return null;
  return (VIEWS as string[]).includes(value) ? (value as View) : null;
}

export function readHash(): View | null {
  if (typeof window === 'undefined') return null;
  return parseHash(window.location.hash);
}

export function writeHash(view: View, replace = false): void {
  if (typeof window === 'undefined') return;
  const hash = `#/${view}`;
  if (window.location.hash === hash) return;
  if (replace) window.history.replaceState(null, '', hash);
  else window.location.hash = hash;
}
