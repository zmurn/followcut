import { useRef, useState } from 'preact/hooks';
import type { View } from '../lib/types';
import { store } from '../lib/store';
import { useReducedMotion, useStore } from '../lib/hooks';
import { currentAccount, formatDate, formatNumber, formatRatio, getMetrics, relativeAge } from '../lib/selectors';
import { ImportFlow } from '../components/ImportFlow';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { parseBackup, BackupError, type BackupData } from '../lib/backup';
import { Icon } from '../components/Icon';

interface WelcomeProps {
  onNavigate: (view: View) => void;
}

const EXPORT_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/';
const EXPORT_FALLBACK = 'https://accountscenter.facebook.com/info_and_permissions/dyi/';
const HELP_URL = 'https://help.instagram.com/181231772500920';

export function Welcome({ onNavigate }: WelcomeProps) {
  const state = useStore();
  const metrics = getMetrics(state);
  const reduceMotion = useReducedMotion();
  const [demoOpen, setDemoOpen] = useState(false);
  const step3Ref = useRef<HTMLHeadingElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<{ text: string; data: BackupData } | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const resume = currentAccount(state);
  const hasData = Boolean(state.dataset && metrics);

  function scrollToImport() {
    const step = document.getElementById('step-2');
    step?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('choose-zip')?.focus(), reduceMotion ? 0 : 360);
  }

  function afterImport() {
    window.requestAnimationFrame(() => {
      const step = document.getElementById('step-3');
      step?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      window.setTimeout(() => step3Ref.current?.focus(), reduceMotion ? 0 : 300);
    });
  }

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

  function startDemo() {
    if (state.dataset) {
      setDemoOpen(true);
      return;
    }
    store.loadDemo();
    store.setNotice('info', 'Demo deck loaded. Every account is fictional.');
    onNavigate('dashboard');
  }

  return (
    <div class="welcome">
      <div class="page">
        <section class="hero" aria-labelledby="welcome-title">
          <div class="hero__copy">
            <h1 id="welcome-title">A deck of everyone you follow.</h1>
            <p class="hero__lede">
              Import the Instagram export you already requested. Sort all of it with the arrow keys, build a cleanup queue,
              and confirm every unfollow yourself. Nothing leaves this device.
            </p>
            <div class="hero__actions">
              <a class="btn btn--primary btn--lg" href={EXPORT_URL} target="_blank" rel="noopener noreferrer">
                Open Instagram export settings <Icon name="external" size={15} />
              </a>
              <button type="button" class="btn btn--lg" onClick={scrollToImport}>
                I have the ZIP <Icon name="arrow-down" size={15} />
              </button>
            </div>
            <div class="hero__trust">
              <span><Icon name="shield-check" size={14} /> Read on this device</span>
              <span><Icon name="shield-check" size={14} /> No Instagram password</span>
              <span><Icon name="shield-check" size={14} /> Every unfollow is manual</span>
            </div>
            <p class="hero__note">
              No unzipping. No cloud account. Profiles open in a new tab or Instagram's first-party embed preview when
              you ask; the app never reads the page.
            </p>
          </div>

          <div class="deck-illustration" aria-hidden="true">
            <div class="ill-card ill-card--back">
              <div class="ill-card__top"><span class="mono">Preview</span></div>
              <div class="ill-monogram">nw</div>
              <div class="ill-handle">north.window</div>
              <div class="ill-sub">mutual</div>
            </div>
            <div class="ill-card ill-card--mid">
              <div class="ill-card__top"><span class="mono">Preview</span></div>
              <div class="ill-monogram">sd</div>
              <div class="ill-handle">slow.desk</div>
              <div class="ill-sub">not following back</div>
            </div>
            <div class="ill-card ill-card--front">
              <div class="ill-card__top">
                <span class="mono">Example card</span>
                <span class="badge badge--accent">Not following back</span>
              </div>
              <div class="ill-monogram">qa</div>
              <div class="ill-handle">quiet.archive</div>
              <div class="ill-sub">Followed June 2019 · not live data</div>
              <div class="ill-rule" />
              <div class="ill-meta"><span>← CUT</span><span>↓ MAYBE</span><span>KEEP →</span></div>
              <div class="ill-tabs">
                <span class="ill-tab">Card 042 / 1,733</span>
                <span class="ill-tab ill-tab--cut">A plan, not an action</span>
              </div>
            </div>
            <div class="ill-caption">Illustration · fictional account</div>
          </div>
        </section>

        <div class="steps">
          <section class="step" id="step-1" aria-labelledby="step-1-title">
            <div class="step__rail">
              <span class="step__num">01</span>
              <span class="step__railline" />
              <span class="mono">Request</span>
            </div>
            <div class="step__body">
              <div class="step__head">
                <div>
                  <h2 id="step-1-title">Get the right Instagram export</h2>
                  <p>
                    One click opens Meta's official Accounts Center. Meta builds the archive in the background; it can take
                    minutes or hours, and you download it when it is ready.
                  </p>
                </div>
                <span class="badge badge--muted">JSON · All time</span>
              </div>

              <a class="btn btn--primary" href={EXPORT_URL} target="_blank" rel="noopener noreferrer">
                Open Instagram Export Settings <Icon name="external" size={15} />
              </a>

              <ol class="export-checklist">
                <li>
                  <span class="n">01</span>
                  <span>Choose your Instagram profile in Accounts Center.</span>
                </li>
                <li>
                  <span class="n">02</span>
                  <span>Choose <b>Export to device</b> or <b>Download to device</b>.</span>
                </li>
                <li>
                  <span class="n">03</span>
                  <span>
                    Choose <b>Followers and following</b> only.
                    <span class="alt">Some accounts call this “Connections” → “Followers and following”.</span>
                  </span>
                </li>
                <li>
                  <span class="n">04</span>
                  <span>
                    Set <b>Date range: All time</b> and <b>Format: JSON</b>.
                    <span class="alt">A shorter range can make people look like they do not follow you back.</span>
                  </span>
                </li>
                <li>
                  <span class="n">05</span>
                  <span>Submit the request. When Meta makes the ZIP available, download it.</span>
                </li>
              </ol>

              <div class="callout" style={{ marginTop: '16px' }}>
                <Icon name="info" size={18} />
                <div><strong>You do not need to unzip anything.</strong> Drop Meta's ZIP into step 2 as it is.</div>
              </div>
              <div class="help-links">
                <a href={EXPORT_FALLBACK} target="_blank" rel="noopener noreferrer">Accounts Center not opening? Try the Facebook route <Icon name="external" size={11} /></a>
                <a href={HELP_URL} target="_blank" rel="noopener noreferrer">Meta's “review and export your information” help <Icon name="external" size={11} /></a>
              </div>
              <p class="rail-note" style={{ marginTop: '10px' }}>
                Meta can change labels or routes. Neither link can request an export or fetch a finished download for you;
                they only open the official settings after you click. FOLLOW/CUT never sees your login.
              </p>
            </div>
          </section>

          <section class={`step${hasData ? ' step--done' : ''}`} id="step-2" aria-labelledby="step-2-title">
            <div class="step__rail">
              <span class="step__num">{hasData ? <Icon name="check" size={16} /> : '02'}</span>
              <span class="step__railline" />
              <span class="mono">Import</span>
            </div>
            <div class="step__body">
              <div class="step__head">
                <div>
                  <h2 id="step-2-title">Bring the archive into this tab</h2>
                  <p>
                    Read locally, never uploaded. FOLLOW/CUT finds following and follower files inside the archive, even
                    when they are nested or split.
                  </p>
                </div>
                <span class="badge badge--muted">ZIP · JSON · folder</span>
              </div>
              <ImportFlow onImported={afterImport} />
              <div class="rail-foot" style={{ marginTop: '14px' }}>
                <button type="button" class="btn btn--sm btn--ghost" onClick={startDemo}>
                  <Icon name="spark" size={14} /> No export handy? Try a demo deck
                </button>
                <button type="button" class="btn btn--sm btn--ghost" onClick={() => restoreRef.current?.click()}>
                  <Icon name="upload" size={14} /> Restore a saved backup
                </button>
                <span class="rail-note">Demo accounts are fictional. A backup restores a previous local session.</span>
                <input
                  ref={restoreRef}
                  type="file"
                  accept=".json,application/json"
                  class="sr-only"
                  aria-label="Choose a FOLLOW/CUT session backup"
                  onChange={onRestoreFile}
                />
              </div>
              {restoreError ? (
                <p class="callout callout--warn" style={{ marginTop: '12px' }} role="alert">
                  <Icon name="alert" size={16} /> {restoreError}
                </p>
              ) : null}
            </div>
          </section>

          <section class={`step${hasData ? '' : ' step--locked'}`} id="step-3" aria-labelledby="step-3-title">
            <div class="step__rail">
              <span class="step__num">03</span>
              <span class="step__railline" />
              <span class="mono">Review</span>
            </div>
            <div class="step__body">
              <div class="step__head">
                <div>
                  <h2 id="step-3-title" tabIndex={-1} ref={step3Ref}>Start with the deck</h2>
                  <p>
                    Arrow keys decide one card at a time. Back and Next move without changing a decision. Progress saves
                    after every card.
                  </p>
                </div>
                {hasData ? <span class="badge badge--confirm">Snapshot ready</span> : <span class="badge badge--muted">Waiting for import</span>}
              </div>

              {hasData && metrics && state.dataset ? (
                <>
                  <div class="snapshot-head" style={{ marginTop: '14px' }}>
                    <span class="not-live">Not live data</span>
                    <span>
                      Snapshot from <strong>{state.dataset.snapshot.exportedAt ? formatDate(state.dataset.snapshot.exportedAt) : formatDate(state.dataset.snapshot.importedAt)}</strong>
                      {state.dataset.snapshot.exportedAt ? ` · ${relativeAge(state.dataset.snapshot.exportedAt)}` : ' · export date unknown'}
                    </span>
                  </div>
                  <div class="summary-grid">
                    <div><b>{formatNumber(metrics.following)}</b><span>Following</span></div>
                    <div><b>{metrics.followers === null ? '—' : formatNumber(metrics.followers)}</b><span>Followers</span></div>
                    <div><b>{metrics.ratio === null ? '—' : `${formatRatio(metrics.ratio)} : 1`}</b><span>Follower ratio</span></div>
                    <div><b>{metrics.mutuals === null ? '—' : formatNumber(metrics.mutuals)}</b><span>Mutuals</span></div>
                    <div class="accent"><b>{metrics.notFollowingBack === null ? '—' : formatNumber(metrics.notFollowingBack)}</b><span>Not following back</span></div>
                  </div>
                  {state.dataset.snapshot.followerData !== 'present' ? (
                    <div class="callout callout--warn" style={{ marginTop: '14px' }}>
                      <Icon name="alert" size={18} />
                      <div>
                        <strong>Follower comparison {state.dataset.snapshot.followerData === 'missing' ? 'is off.' : 'may be incomplete.'}</strong>{' '}
                        Review still works, but mutual and non-mutual labels are not guessed.
                      </div>
                    </div>
                  ) : null}
                  {state.dataset.snapshot.warnings.length > 0 ? (
                    <ul class="import-warnings" style={{ marginTop: '14px' }}>
                      {state.dataset.snapshot.warnings.map(warning => <li key={warning}>{warning}</li>)}
                    </ul>
                  ) : null}
                  <div class="hero__actions" style={{ marginTop: '18px' }}>
                    <button type="button" class="btn btn--primary btn--lg" onClick={() => onNavigate('review')}>
                      {metrics.reviewed > 0 ? 'Resume your session' : 'Start reviewing'} <Icon name="arrow-right" size={15} />
                    </button>
                    <button type="button" class="btn btn--lg" onClick={() => onNavigate('dashboard')}>
                      Open overview
                    </button>
                  </div>
                  <p class="rail-note" style={{ marginTop: '10px' }}>
                    {metrics.reviewed > 0
                      ? `${formatNumber(metrics.reviewed)} reviewed · ${resume ? `next at @${resume.display}` : 'no unreviewed cards left'}.`
                      : `${formatNumber(metrics.following)} cards ready. Cut marks for cleanup; it does not unfollow.`}
                  </p>
                </>
              ) : (
                <div class="callout callout--quiet" style={{ marginTop: '16px' }}>
                  <Icon name="lock" size={18} />
                  <div>
                    <strong>The deck unlocks after a readable export is imported.</strong> If Meta's labels moved, the
                    checklist above is the current path; you can also choose the unzipped folder.
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <footer class="welcome-footer">
          <div>
            <p>
              <strong>Privacy is the architecture.</strong> No cloud server, no login, no analytics, no remote fonts or images in
              the app. The app's own code cannot fetch or upload data; the optional profile preview opens Instagram's
              first-party embed in optional card previews only after you enable them. The ZIP is parsed in this tab. Instagram or Meta pages open only when
              you ask.
            </p>
            <p style={{ marginTop: '6px' }}>
              Not affiliated with Instagram or Meta. Unfollowing is a manual action you perform; FOLLOW/CUT cannot promise
              that any account action is risk-free.
            </p>
          </div>
          <div>
            <p>
              Portions adapted from{' '}
              <a href="https://github.com/Mahmooodsaeed/IG-Cleanup-Tool" target="_blank" rel="noopener noreferrer">IG Cleanup Tool</a>{' '}
              (MIT, Copyright © 2026 Mahmood Saeed).
            </p>
            <p style={{ marginTop: '6px' }}>FOLLOW/CUT 1.0 · MIT · local-first</p>
          </div>
        </footer>
      </div>

      <Modal
        id="welcome-restore"
        open={Boolean(restore)}
        onClose={() => setRestore(null)}
        title="Restore this saved session?"
        description="This replaces the current local session in this browser. Nothing is uploaded."
        footer={
          <>
            <button type="button" class="btn" onClick={() => setRestore(null)}>Cancel</button>
            <button
              type="button"
              class="btn btn--ink"
              onClick={() => {
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
              }}
            >
              Restore session
            </button>
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
            </div>
            <p class="rail-note">The backup contains normalized account data and decisions, not the original ZIP or photos.</p>
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        id="welcome-demo"
        open={demoOpen}
        title="Replace this session with demo data?"
        description="The demo deck uses fictional accounts and clears the current dataset from this browser. Download a backup first if you want the current session back."
        confirmLabel="Load demo deck"
        cancelLabel="Keep my session"
        onCancel={() => setDemoOpen(false)}
        onConfirm={() => {
          setDemoOpen(false);
          const previous = state.dataset;
          store.loadDemo();
          store.setNotice('info', previous ? 'Demo deck loaded. Your previous dataset was replaced.' : 'Demo deck loaded. Every account is fictional.');
          onNavigate('dashboard');
        }}
      >
        <p class="rail-note">
          The demo has 1,733 following, 1,336 followers, and 397 confirmed removals needed for a 1:1 ratio. It exercises
          the entire review, cleanup, and backup flow without any private data.
        </p>
      </ConfirmDialog>
    </div>
  );
}
