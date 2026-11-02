import { useEffect, useState } from 'preact/hooks';
import { store } from '../lib/store';
import { useStore } from '../lib/hooks';
import { copyText, downloadText, timestampSlug } from '../lib/download';
import { formatNumber } from '../lib/selectors';
import { Modal } from './Modal';
import { Icon } from './Icon';
import {
  SYNC_CODE_KEY,
  SYNC_REVISION_KEY,
  SYNC_URL_KEY,
  clearComputerSync,
  notifySyncChanged
} from '../lib/sync';

interface PhoneHandoffProps {
  open: boolean;
  onClose: () => void;
}

interface Handoff {
  code: string;
  url: string;
  qr: string;
  expiresAt: number;
  revision: number;
  warning?: string;
}

interface ActiveSync {
  code: string;
  url?: string;
}

function isShareMode(): boolean {
  return Boolean(window.__FOLLOWCUT_SHARE_MODE__);
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function PhoneHandoff({ open, onClose }: PhoneHandoffProps) {
  const state = useStore();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<'link' | 'command' | null>(null);
  const [activeSync, setActiveSync] = useState<ActiveSync | null>(null);
  const shareMode = isShareMode();
  const hasData = Boolean(state.dataset);
  const remaining = handoff ? handoff.expiresAt - now : 0;

  useEffect(() => {
    if (!open) {
      setHandoff(null);
      setActiveSync(null);
      setError('');
      setLoading(false);
      setCopied(null);
      return;
    }
    setNow(Date.now());
    if (shareMode && hasData) {
      const storedCode = localStorage.getItem(SYNC_CODE_KEY);
      if (storedCode) {
        let cancelled = false;
        setActiveSync({ code: storedCode, url: localStorage.getItem(SYNC_URL_KEY) || undefined });
        setLoading(false);
        void fetch(`/api/handoff/${encodeURIComponent(storedCode)}`, { cache: 'no-store' })
          .then(response => {
            if (cancelled) return;
            if (response.status === 404 || response.status === 410) {
              clearComputerSync();
              setActiveSync(null);
              void createHandoff();
            }
          })
          .catch(() => {
            // The server may be down; keep the active panel so the code can be retried.
          });
        return () => {
          cancelled = true;
        };
      }
      void createHandoff();
    }
  }, [open, shareMode, hasData]);

  useEffect(() => {
    if (!open || !handoff) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, handoff]);

  async function createHandoff() {
    setLoading(true);
    setError('');
    setHandoff(null);
    setActiveSync(null);
    setCopied(null);
    try {
      const backup = store.exportBackup();
      // The phone should land on the deck, not on the computer's settings screen.
      backup.data.ui = { ...backup.data.ui, view: 'review' };
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      const response = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
        signal: controller.signal
      });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error(`handoff_${response.status}`);
      const result = await response.json() as Handoff;
      if (!result.url || !result.qr || !result.code) throw new Error('handoff_incomplete');
      localStorage.setItem(SYNC_CODE_KEY, result.code);
      localStorage.setItem(SYNC_REVISION_KEY, String(result.revision ?? 1));
      localStorage.setItem(SYNC_URL_KEY, result.url);
      notifySyncChanged();
      setActiveSync({ code: result.code, url: result.url });
      setHandoff(result);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(aborted
        ? 'The handoff server did not answer in time. Make sure it is still running, then try again.'
        : 'The handoff server did not answer. Run `npm run share` on this computer, open the printed localhost URL, and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    const url = handoff?.url ?? activeSync?.url;
    if (!url) return;
    if (await copyText(url)) {
      setCopied('link');
      window.setTimeout(() => setCopied(null), 2400);
    }
  }

  async function copyCommand() {
    if (await copyText('npm run share')) {
      setCopied('command');
      window.setTimeout(() => setCopied(null), 2400);
    }
  }

  function downloadSession() {
    if (!state.dataset) return;
    downloadText(`followcut-phone-${timestampSlug()}.json`, JSON.stringify(store.exportBackup(), null, 2), 'application/json');
    store.setNotice('success', 'Backup downloaded. Restore it in the localhost handoff app once, then pair the phone.');
  }

  const footer = shareMode && hasData ? (
    <>
      <button type="button" class="btn btn--ghost" onClick={downloadSession}><Icon name="download" size={14} /> Backup</button>
      <span class="spacer" />
      <button type="button" class="btn" onClick={() => void createHandoff()} disabled={loading}>New code</button>
      <button type="button" class="btn btn--ink" onClick={onClose}>Done</button>
    </>
  ) : (
    <>
      <span class="spacer" />
      {hasData ? <button type="button" class="btn" onClick={downloadSession}><Icon name="download" size={14} /> Download backup</button> : null}
      <button type="button" class="btn btn--ink" onClick={onClose}>Close</button>
    </>
  );

  return (
    <Modal
      id="phone-handoff"
      open={open}
      onClose={onClose}
      title={shareMode ? 'Continue on your phone' : 'Set up phone handoff'}
      description={shareMode
        ? 'A live session over your local Wi-Fi. The computer updates as you review.'
        : 'The standalone file has no network access. The optional local handoff server bridges the two devices.'}
      footer={footer}
    >
      {!hasData ? (
        <div class="callout callout--quiet">
          <Icon name="info" size={18} />
          <div><strong>Import a snapshot first.</strong> The phone handoff needs a session to share.</div>
        </div>
      ) : !shareMode ? (
        <div class="phone-handoff">
          <div class="callout">
            <Icon name="phone" size={18} />
            <div>
              <strong>Phone handoff is a separate, local mode.</strong>
              <div>It runs a temporary server on this computer, and only on your local network.</div>
            </div>
          </div>
          <ol class="phone-instructions">
            <li>In the project folder, run <code>npm run share</code>.</li>
            <li>Open the printed <code>http://localhost:4173</code> URL on this computer (or whichever port it prints).</li>
            <li>
              If this session has data, download a backup here and restore it in that localhost app once.
              Browsers keep <code>file://</code> and <code>http://</code> storage separate.
            </li>
            <li>Import or restore the session there, then open <strong>Continue on phone</strong> and scan the QR.</li>
          </ol>
          <div class="phone-command">
            <code>npm run share</code>
            <button type="button" class="btn btn--sm" onClick={() => void copyCommand()}>
              <Icon name={copied === 'command' ? 'check' : 'copy'} size={13} /> {copied === 'command' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div class="data-actions">
            <a class="btn btn--sm" href="http://localhost:4173/" target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={13} /> Open localhost handoff app
            </a>
            <span class="rail-note">Works after the server prints its address; the default port is 4173.</span>
          </div>
          <p class="rail-note">
            The normal single-file app stays offline and strict. The handoff server holds normalized account data in memory,
            never writes it to disk, and keeps an opened live session for twelve hours while the server runs. Use a trusted
            Wi-Fi network, not public Wi-Fi.
          </p>
        </div>
      ) : activeSync && !handoff ? (
        <div class="phone-handoff">
          <div class="callout">
            <Icon name="phone" size={18} />
            <div>
              <strong>Live phone session is active.</strong>
              <div>The computer updates as you review. Keep this tab or the phone tab open; the server must stay running.</div>
            </div>
          </div>
          {activeSync.url ? (
            <div class="phone-handoff__url">
              <code>{activeSync.url}</code>
              <button type="button" class="btn btn--sm" onClick={() => void copyLink()}>
                <Icon name={copied === 'link' ? 'check' : 'copy'} size={13} /> {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            </div>
          ) : null}
          <p class="rail-note">
            Open the link on the phone if you need to reconnect it. Use <strong>New code</strong> to pair another phone and
            start a fresh live session; the old phone will stop syncing to this computer.
          </p>
          <button
            type="button"
            class="btn btn--sm"
            onClick={() => {
              clearComputerSync();
              setActiveSync(null);
              onClose();
            }}
          >
            Stop phone sync
          </button>
        </div>
      ) : loading ? (
        <div class="phone-status" role="status">
          <Icon name="refresh" size={18} /> Preparing a live handoff for your phone…
        </div>
      ) : error ? (
        <div class="callout callout--warn" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <strong>The handoff server is not answering.</strong>
            <div>{error}</div>
            <div style={{ marginTop: '8px' }}>
              <button type="button" class="btn btn--sm" onClick={() => void createHandoff()}>Try again</button>
            </div>
          </div>
        </div>
      ) : handoff && remaining > 0 ? (
        <div class="phone-handoff">
          <div class="phone-handoff__qr">
            <img src={handoff.qr} width={272} height={272} alt="QR code to open this session on your phone" />
          </div>
          <p class="phone-handoff__lead">Scan with your phone camera. Both devices must be on the same Wi-Fi. The computer updates live as you review.</p>
          <div class="phone-handoff__url">
            <code>{handoff.url}</code>
            <button type="button" class="btn btn--sm" onClick={() => void copyLink()}>
              <Icon name={copied === 'link' ? 'check' : 'copy'} size={13} /> {copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <div class="phone-handoff__meta">
            <span>Code expires in <strong>{countdown(remaining)}</strong></span>
            <span>{formatNumber(state.dataset?.accounts.length ?? 0)} following synced</span>
          </div>
          {handoff.warning ? (
            <div class="callout callout--warn"><Icon name="alert" size={16} /><div>{handoff.warning}</div></div>
          ) : null}
          <p class="rail-note">
            Live sync runs only on this local network. Keep the phone tab and this computer's server running. The link can
            be reopened in Safari or Chrome—it keeps the session code, so the full browser resumes the same review. Use a
            trusted Wi-Fi network, not public Wi-Fi.
          </p>
        </div>
      ) : (
        <div class="phone-handoff">
          <div class="callout callout--warn">
            <Icon name="alert" size={18} />
            <div><strong>This code expired.</strong> Generate a new one and scan it with your phone.</div>
          </div>
          <button type="button" class="btn btn--primary" onClick={() => void createHandoff()}>Generate a new code</button>
        </div>
      )}
    </Modal>
  );
}
