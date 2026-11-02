import { useRef, useState } from 'preact/hooks';
import type { View } from '../lib/types';
import { store } from '../lib/store';
import { useStore } from '../lib/hooks';
import { getMetrics, formatDate, formatNumber } from '../lib/selectors';
import { buildDecisionsCsv, buildQueueCsv } from '../lib/csv';
import { downloadText, timestampSlug } from '../lib/download';
import { parseBackup, BackupError, type BackupData } from '../lib/backup';
import { GoalEditor } from '../components/GoalEditor';
import { ImportFlow } from '../components/ImportFlow';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';

interface SettingsProps {
  onNavigate: (view: View) => void;
  onOpenPhone: () => void;
}

interface RestoreState {
  text: string;
  data: BackupData;
}

export function Settings({ onNavigate, onOpenPhone }: SettingsProps) {
  const state = useStore();
  const metrics = getMetrics(state);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<RestoreState | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const snapshot = state.dataset?.snapshot;
  const bytes = store.storageBytes();
  const sizeLabel = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

  async function onRestoreFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setRestoreError('');
    if (file.size > 32 * 1024 * 1024) {
      setRestoreError('This backup is larger than the 32 MB safety limit.');
      return;
    }
    try {
      const text = await file.text();
      const data = parseBackup(text, new Date());
      setRestore({ text, data });
    } catch (err) {
      setRestoreError(err instanceof BackupError ? err.message : 'This backup could not be read.');
    }
  }

  function confirmRestore() {
    if (!restore) return;
    try {
      store.restoreBackupText(restore.text);
      setRestore(null);
      store.setNotice('success', 'Session restored from backup. Nothing was sent anywhere.');
      onNavigate('dashboard');
    } catch (err) {
      setRestoreError(err instanceof BackupError ? err.message : 'This backup could not be restored.');
      setRestore(null);
    }
  }

  function backupJson() {
    downloadText(`followcut-session-${timestampSlug()}.json`, JSON.stringify(store.exportBackup(), null, 2), 'application/json');
    store.setNotice('success', 'Session backup downloaded. It contains normalized account data, not the raw archive.');
  }

  function decisionsCsv() {
    downloadText(`followcut-decisions-${timestampSlug()}.csv`, buildDecisionsCsv(state), 'text/csv');
    store.setNotice('success', 'Decisions CSV downloaded from this device.');
  }

  function cleanupCsv() {
    downloadText(`followcut-cleanup-${timestampSlug()}.csv`, buildQueueCsv(state), 'text/csv');
    store.setNotice('success', 'Cleanup CSV downloaded from this device.');
  }

  if (!state.dataset || !metrics || !snapshot) return null;

  return (
    <div class="page page--narrow">
      <div class="page-head">
        <div class="page-head__copy">
          <h1>Your local session</h1>
          <p>
            Everything lives in this browser or the optional local handoff on your computer. There is no account, no cloud sync, and no remote copy. Download a backup before
            clearing data or moving to another browser.
          </p>
        </div>
        <div class="page-head__actions">
          <button type="button" class="btn" onClick={() => onNavigate('dashboard')}>Overview</button>
          <button type="button" class="btn btn--primary" onClick={backupJson}>
            <Icon name="download" size={15} /> Download backup
          </button>
        </div>
      </div>

      <div class="settings-grid">
        <div class="settings-col">
          <section class="section" aria-labelledby="appearance-title">
            <div class="section__head">
              <h2 id="appearance-title">Appearance</h2>
              <p>Both themes use the same semantic tokens. Motion follows the system by default.</p>
            </div>
            <div class="section__body">
              <div class="setting-row">
                <div class="setting-row__copy">
                  <b>Theme</b>
                  <span>Warm paper or near-black. System follows your OS.</span>
                </div>
                <div class="segmented" role="group" aria-label="Theme">
                  <button type="button" aria-pressed={state.settings.theme === 'system'} onClick={() => store.setTheme('system')}>System</button>
                  <button type="button" aria-pressed={state.settings.theme === 'light'} onClick={() => store.setTheme('light')}>Light</button>
                  <button type="button" aria-pressed={state.settings.theme === 'dark'} onClick={() => store.setTheme('dark')}>Dark</button>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-row__copy">
                  <b>Profile preview</b>
                  <span>In-app puts a low-resolution Instagram post strip in the current card and preloads the next profile. Off is the default and keeps cards offline; the full profile link still opens Instagram in a new tab.</span>
                </div>
                <div class="segmented" role="group" aria-label="Profile preview">
                  <button type="button" aria-pressed={state.settings.profileOpen === 'tab'} onClick={() => store.setProfileOpen('tab')}>Off</button>
                  <button type="button" aria-pressed={state.settings.profileOpen === 'preview'} onClick={() => store.setProfileOpen('preview')}>In-app</button>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-row__copy">
                  <b>Motion</b>
                  <span>System honors prefers-reduced-motion. Reduce disables card flights and transitions here.</span>
                </div>
                <div class="segmented" role="group" aria-label="Motion">
                  <button type="button" aria-pressed={state.settings.motion === 'system'} onClick={() => store.setMotion('system')}>System</button>
                  <button type="button" aria-pressed={state.settings.motion === 'reduce'} onClick={() => store.setMotion('reduce')}>Reduce</button>
                </div>
              </div>
            </div>
          </section>

          <section class="section" aria-labelledby="target-title">
            <div class="section__head">
              <h2 id="target-title">Target following count</h2>
              <p>Optional. The number is never used to auto-select accounts.</p>
            </div>
            <div class="section__body">
              <GoalEditor state={state} compact />
            </div>
          </section>

          <section class="section" aria-labelledby="backup-title">
            <div class="section__head">
              <h2 id="backup-title">Backup &amp; export</h2>
              <p>Portable files chosen by you. They stay on your device unless you move them.</p>
            </div>
            <div class="section__body">
              <div class="data-actions">
                <button type="button" class="btn btn--primary" onClick={backupJson}><Icon name="download" size={15} /> Session backup (JSON)</button>
                <button type="button" class="btn" onClick={decisionsCsv}><Icon name="download" size={15} /> Decisions CSV</button>
                <button type="button" class="btn" onClick={cleanupCsv}><Icon name="download" size={15} /> Cleanup CSV</button>
              </div>
              <p class="rail-note">
                The session backup contains normalized accounts, decisions, cleanup states, notes, the target, and snapshot
                metadata. It does <strong>not</strong> contain the raw Instagram archive or any photos. Restore it on another
                device by choosing the JSON file below.
              </p>
            </div>
          </section>

          <section class="section" aria-labelledby="restore-title">
            <div class="section__head">
              <h2 id="restore-title">Restore a backup</h2>
              <p>Replaces this browser's session after a preview. Export your current session first if it matters.</p>
            </div>
            <div class="section__body">
              <div class="data-actions">
                <button type="button" class="btn" onClick={() => restoreRef.current?.click()}><Icon name="upload" size={15} /> Choose backup JSON</button>
                <input ref={restoreRef} type="file" accept=".json,application/json" class="sr-only" aria-label="Choose a FOLLOW/CUT session backup" onChange={onRestoreFile} />
              </div>
              {restoreError ? <p class="callout callout--warn"><Icon name="alert" size={16} /> {restoreError}</p> : null}
            </div>
          </section>

          <section class="section danger-zone" aria-labelledby="clear-title">
            <div class="section__head">
              <h2 id="clear-title">Clear local session</h2>
              <p>Removes the snapshot, decisions, notes, confirmations, and target from this browser.</p>
            </div>
            <div class="section__body">
              <div class="data-actions">
                <button type="button" class="btn btn--danger" onClick={() => setClearOpen(true)}>
                  <Icon name="trash" size={15} /> Clear everything on this device
                </button>
                <button type="button" class="btn btn--ghost" onClick={backupJson}>Download a backup first</button>
              </div>
            </div>
          </section>
        </div>

        <div class="settings-col">
          <section class="section" aria-labelledby="reimport-title">
            <div class="section__head">
              <h2 id="reimport-title">Import a newer export</h2>
              <p>Merge by exact username. Renames are never guessed; they appear as a removal and an addition.</p>
            </div>
            <div class="section__body">
              <ImportFlow compact onImported={() => onNavigate('dashboard')} />
            </div>
          </section>

          <section class="section" aria-labelledby="phone-title">
            <div class="section__head">
              <h2 id="phone-title">Use on your phone</h2>
              <p>Hand the deck to your phone over local Wi-Fi. A one-time copy; no cloud account.</p>
            </div>
            <div class="section__body">
              <div class="data-actions">
                <button type="button" class="btn phone-action" onClick={onOpenPhone}>
                  <Icon name="phone" size={15} /> Continue on phone
                </button>
              </div>
              <p class="rail-note">
                Requires <code>npm run share</code> on this computer. The phone loads the app from this computer, so keep
                the handoff server open while you use it. Decisions on the phone are a separate copy; use a backup to bring
                them back.
              </p>
            </div>
          </section>

          <section class="section" aria-labelledby="session-title">
            <div class="section__head">
              <h2 id="session-title">This session</h2>
              <p>{snapshot.demo ? 'Demo data — all accounts are fictional.' : 'A snapshot plus your local review work.'}</p>
            </div>
            <div class="section__body">
              <div class="meta-list">
                <div><span>Following in snapshot</span><span>{formatNumber(metrics.following)}</span></div>
                <div><span>Followers in snapshot</span><span>{metrics.followers === null ? 'Not included' : formatNumber(metrics.followers)}</span></div>
                <div><span>Reviewed</span><span>{formatNumber(metrics.reviewed)}</span></div>
                <div><span>Marked for cut</span><span>{formatNumber(metrics.planned)}</span></div>
                <div><span>Manual confirmations</span><span>{formatNumber(metrics.confirmedCurrent)}</span></div>
                <div><span>Archived confirmations</span><span>{formatNumber(metrics.confirmedArchived)}</span></div>
                <div><span>Export date</span><span>{snapshot.exportedAt ? formatDate(snapshot.exportedAt) : 'Unknown'}</span></div>
                <div><span>Imported</span><span>{formatDate(snapshot.importedAt)}</span></div>
                <div><span>Saved in this browser</span><span>{sizeLabel}</span></div>
              </div>
              <p class="rail-note">
                {snapshot.demo ? 'Demo accounts are invented. Your changes still stay local and can be cleared at any time.' : 'The raw ZIP is never stored. Only normalized usernames, URLs, dates, decisions, and notes are kept.'}
              </p>
            </div>
          </section>

          <section class="section" aria-labelledby="privacy-title">
            <div class="section__head">
              <h2 id="privacy-title">Privacy &amp; local storage</h2>
              <p>A promise that is enforced by the build, not just copy.</p>
            </div>
            <div class="section__body">
              <ul class="privacy-list">
                <li><Icon name="shield-check" size={15} /> No Instagram password, login, or account connection. FOLLOW/CUT never reads cookies; the optional preview is Instagram's own sandboxed page.</li>
                <li><Icon name="shield-check" size={15} /> No remote session server. The app's own code cannot fetch or upload data; the only allowed external frame is Instagram's opt-in card preview, mounted only for the current and next profile after you enable In-app. The optional phone handoff runs on your computer only.</li>
                <li><Icon name="shield-check" size={15} /> No analytics, remote fonts, image CDNs, or third-party SDKs in the app. The optional preview is Instagram's own sandboxed embed.</li>
                <li><Icon name="shield-check" size={15} /> The archive is parsed in this tab. Only normalized records are saved.</li>
                <li><Icon name="shield-check" size={15} /> Instagram pages load only when you enable In-app card previews or open a full profile.</li>
              </ul>
              <p class="rail-note">
                Storage policy: decisions, cleanup states, notes, target, theme, and snapshot metadata are kept in this
                browser's localStorage. Clearing site data or using private browsing can erase them. Download a backup if
                the session matters.
              </p>
            </div>
          </section>

          <section class="section" aria-labelledby="about-title">
            <div class="section__head">
              <h2 id="about-title">About FOLLOW/CUT</h2>
              <p>Version 1.0.0 · local-first · MIT licensed.</p>
            </div>
            <div class="section__body">
              <p class="rail-note">
                FOLLOW/CUT is an independent tool for curating a following list. It is not affiliated with Instagram or Meta.
                It never automates account actions—no console scripts, session cookies, private endpoints, or injected clicks—and does not promise that unfollowing is risk-free.
              </p>
              <div class="about-links">
                <a href="https://github.com/Mahmooodsaeed/IG-Cleanup-Tool" target="_blank" rel="noopener noreferrer">IG Cleanup Tool (parser lineage, MIT) <Icon name="external" size={11} /></a>
                <a href="https://accountscenter.instagram.com/info_and_permissions/dyi/" target="_blank" rel="noopener noreferrer">Instagram export settings <Icon name="external" size={11} /></a>
              </div>
              <details class="about-details">
                <summary>License &amp; attribution</summary>
                <p class="license-note">
                  FOLLOW/CUT is MIT licensed. Portions of the export discovery and normalization approach are adapted from
                  IG Cleanup Tool, Copyright (c) 2026 Mahmood Saeed, also MIT licensed. The full upstream license is
                  reproduced in THIRD_PARTY_NOTICES.md. Sift was used only as an interaction reference; no Sift code,
                  assets, branding, or visual design is used. Built with Preact and Vite.
                </p>
              </details>
            </div>
          </section>
        </div>
      </div>

      <p class="rail-note" style={{ marginTop: '28px' }}>
        Privacy promise: no login, no upload, no cloud account, no unzipping required, and every unfollow is manual and
        confirmed by you. If a browser feature is blocked, FOLLOW/CUT falls back to a file picker rather than claiming
        access it does not have.
      </p>

      <ConfirmDialog
        id="settings-clear"
        open={clearOpen}
        title="Clear this local session?"
        description="This cannot be undone unless you downloaded a backup."
        confirmLabel="Clear everything"
        danger
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          setClearOpen(false);
          store.clearSession();
          onNavigate('welcome');
        }}
      >
        <p class="rail-note">
          This removes {formatNumber(metrics.following)} snapshot accounts, {formatNumber(metrics.reviewed)} reviewed
          decisions, {formatNumber(metrics.confirmedCurrent)} manual confirmations, and any notes from this browser. The
          original ZIP was never stored, so it is not affected.
        </p>
      </ConfirmDialog>

      <Modal
        id="settings-restore"
        open={Boolean(restore)}
        onClose={() => setRestore(null)}
        title="Restore this backup?"
        description="This replaces the current local session. Nothing is uploaded."
        footer={
          <>
            <button type="button" class="btn" onClick={() => setRestore(null)}>Cancel</button>
            <button type="button" class="btn btn--ink" onClick={confirmRestore}>Restore session</button>
          </>
        }
      >
        {restore ? (
          <>
            <div class="meta-list">
              <div><span>Following</span><span>{formatNumber(restore.data.dataset.accounts.length)}</span></div>
              <div><span>Followers</span><span>{restore.data.dataset.snapshot.followerData === 'missing' ? 'Not included' : formatNumber(restore.data.dataset.followers.length)}</span></div>
              <div><span>Export date</span><span>{restore.data.dataset.snapshot.exportedAt ? formatDate(restore.data.dataset.snapshot.exportedAt) : 'Unknown'}</span></div>
              <div><span>Decisions</span><span>{formatNumber(restore.data.decisions.size)}</span></div>
              <div><span>Manual confirmations</span><span>{formatNumber([...restore.data.cleanup.values()].filter(c => c.state === 'confirmed').length)}</span></div>
              <div><span>Archived confirmations</span><span>{formatNumber(restore.data.history.confirmations.length)}</span></div>
            </div>
            <div class="callout callout--warn">
              <Icon name="alert" size={18} />
              <div>
                Your current session will be replaced. Download a backup of it first if you might want it back. Backup files
                contain no raw archive.
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
