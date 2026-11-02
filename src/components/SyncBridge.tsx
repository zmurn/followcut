import { useEffect, useState } from 'preact/hooks';
import { store } from '../lib/store';
import {
  SYNC_EVENT,
  SYNC_REVISION_KEY,
  clearComputerSync,
  getPhoneSyncCode,
  readComputerSyncCode
} from '../lib/sync';

/**
 * Two-way bridge over the local handoff server.
 *
 * Phone role (URL /p/<code>): after each store change, PUT the complete session.
 * Computer role (root URL plus a stored handoff code): poll the same code and
 * apply the phone's latest decisions, cursor, and cleanup states. The computer's
 * local view and theme are preserved; the deck cursor and metrics follow.
 */
export function SyncBridge() {
  const shareMode = Boolean(window.__FOLLOWCUT_SHARE_MODE__);
  const phoneCode = shareMode ? getPhoneSyncCode() : null;
  const [computerCode, setComputerCode] = useState<string | null>(() => (
    shareMode && !phoneCode ? readComputerSyncCode() : null
  ));

  useEffect(() => {
    if (!shareMode || phoneCode) return;
    const sync = () => setComputerCode(readComputerSyncCode());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [shareMode, phoneCode]);

  useEffect(() => {
    if (!phoneCode) return;
    let timer = 0;
    let lastSent = '';
    let stopped = false;
    let warned = false;

    const send = async () => {
      if (stopped) return;
      let body: string;
      try {
        body = JSON.stringify(store.exportBackup());
      } catch {
        return;
      }
      if (body === lastSent) return;
      try {
        const response = await fetch(`/api/handoff/${encodeURIComponent(phoneCode)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        if (response.ok) {
          lastSent = body;
        } else if ((response.status === 404 || response.status === 410) && !warned) {
          warned = true;
          store.setNotice('warn', 'Live sync ended. The computer needs to create a new phone code.');
        }
      } catch {
        // The next store change retries. The phone keeps its local state.
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void send(), 320);
    };

    const unsubscribe = store.subscribe(schedule);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [phoneCode]);

  useEffect(() => {
    if (!computerCode) return;
    let stopped = false;
    let timer = 0;
    let last = Number(localStorage.getItem(SYNC_REVISION_KEY) || '0');
    let announced = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/handoff/${encodeURIComponent(computerCode)}`, {
          cache: 'no-store'
        });
        if (response.status === 404 || response.status === 410) {
          store.setNotice('warn', 'Phone sync ended. Open Continue on phone to pair again.');
          clearComputerSync();
          return;
        }
        if (response.ok) {
          const data = await response.json() as { revision: number; backup: string };
          if (Number.isFinite(data.revision) && data.revision > last) {
            if (last === 0 && data.revision === 1) {
              last = 1;
              localStorage.setItem(SYNC_REVISION_KEY, String(last));
            } else if (typeof data.backup === 'string') {
              try {
                store.applyRemoteBackup(data.backup);
                last = data.revision;
                localStorage.setItem(SYNC_REVISION_KEY, String(last));
                if (!announced) {
                  announced = true;
                  store.setNotice('success', 'Phone synced. This computer now follows your phone review.');
                }
              } catch {
                // Leave the last revision unchanged so the next poll can retry.
              }
            }
          }
        }
      } catch {
        // The server may be restarting; keep polling while this page is open.
      }
      if (!stopped) timer = window.setTimeout(() => void poll(), 1200);
    };

    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [computerCode]);

  return null;
}
