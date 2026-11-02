export const SYNC_CODE_KEY = 'followcut:v1:syncCode';
export const SYNC_REVISION_KEY = 'followcut:v1:syncRevision';
export const SYNC_URL_KEY = 'followcut:v1:syncUrl';
export const SYNC_EVENT = 'followcut:sync-changed';

export function notifySyncChanged(): void {
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function getPhoneSyncCode(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function readComputerSyncCode(): string | null {
  try {
    return localStorage.getItem(SYNC_CODE_KEY);
  } catch {
    return null;
  }
}

export function clearComputerSync(): void {
  try {
    localStorage.removeItem(SYNC_CODE_KEY);
    localStorage.removeItem(SYNC_REVISION_KEY);
    localStorage.removeItem(SYNC_URL_KEY);
  } catch {
    // Storage can be unavailable; the poll simply stops.
  }
  notifySyncChanged();
}
