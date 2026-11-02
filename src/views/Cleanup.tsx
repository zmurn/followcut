import { useEffect, useRef, useState } from 'preact/hooks';
import type { QueueItem, View } from '../lib/types';
import { store } from '../lib/store';
import { useStore } from '../lib/hooks';
import {
  cleanupStateLabel,
  followBackLabel,
  formatDate,
  formatDateShort,
  formatNumber,
  getConfirmed,
  getMetrics,
  getOther,
  getQueue,
  initials
} from '../lib/selectors';
import { buildQueueCsv, buildQueueJson } from '../lib/csv';
import { downloadText, timestampSlug } from '../lib/download';
import { ProgressBar } from '../components/ProgressBar';
import { Icon } from '../components/Icon';
import { openProfileInTab } from '../lib/profileLink';

interface CleanupProps {
  onNavigate: (view: View) => void;
  onHelp: () => void;
}

const PAGE_SIZE = 50;

export function Cleanup({ onNavigate, onHelp }: CleanupProps) {
  const state = useStore();
  const metrics = getMetrics(state);
  const queue = getQueue(state);
  const confirmed = getConfirmed(state);
  const other = getOther(state);
  const tab = state.ui.cleanupTab;
  const mode = state.ui.cleanupMode;
  const active = tab === 'queue' ? queue[0] ?? null : null;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [note, setNote] = useState('');
  const openRef = useRef<HTMLAnchorElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);
  const deferredCount = queue.filter(item => item.deferred).length;

  useEffect(() => {
    setQuery('');
    setPage(0);
    shouldFocus.current = false;
  }, [tab, mode]);

  useEffect(() => {
    setNote(active?.decision.notes ?? '');
    if (shouldFocus.current) {
      shouldFocus.current = false;
      requestAnimationFrame(() => {
        if (active) openRef.current?.focus();
        else emptyHeadingRef.current?.focus();
      });
    }
  }, [active?.account.id]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (document.querySelector('dialog[open]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '?') {
        event.preventDefault();
        onHelp();
        return;
      }
      if (!active || tab !== 'queue' || mode !== 'focus' || event.repeat) return;
      if (event.key === 'Enter') {
        if (target?.closest('button, a, [role="button"]')) return;
        event.preventDefault();
        openActiveProfile();
        return;
      }
      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault();
          confirmActive();
          break;
        case 's':
          event.preventDefault();
          skipActive();
          break;
        case 'k':
          event.preventDefault();
          keepActive();
          break;
        case 'u':
          event.preventDefault();
          uncertainActive();
          break;
        case 'z':
          event.preventDefault();
          store.undoCleanup();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active?.account.id, tab, mode, onHelp]);

  function openProfileFor(item: QueueItem): boolean {
    store.markProfileOpened(item.account.id);
    return false;
  }

  function openActiveProfile() {
    if (!active) return;
    if (!openProfileFor(active)) openProfileInTab(active.account.profileUrl);
  }

  function confirmActive() {
    if (!active) return;
    const display = active.account.display;
    shouldFocus.current = true;
    store.confirmUnfollow(active.account.id);
    store.setNotice('success', `Confirmed @${display}. Press Z to undo the confirmation.`);
  }

  function skipActive() {
    if (!active) return;
    shouldFocus.current = true;
    store.skipAccount(active.account.id);
    store.setNotice('info', `Deferred @${active.account.display} to the back of the queue.`);
  }

  function keepActive() {
    if (!active) return;
    shouldFocus.current = true;
    store.actuallyKeep(active.account.id);
    store.setNotice('success', `@${active.account.display} is now kept and out of this queue.`);
  }

  function uncertainActive() {
    if (!active) return;
    shouldFocus.current = true;
    store.markUncertain(active.account.id);
    store.setNotice('info', `@${active.account.display} moved to Skipped / uncertain.`);
  }

  function exportCsv() {
    downloadText(`followcut-cleanup-${timestampSlug()}.csv`, buildQueueCsv(state), 'text/csv');
    store.setNotice('success', 'Cleanup CSV downloaded from this device.');
  }

  function exportJson() {
    downloadText(`followcut-cleanup-${timestampSlug()}.json`, buildQueueJson(state), 'application/json');
    store.setNotice('success', 'Cleanup JSON downloaded from this device.');
  }

  function setTab(next: typeof tab) {
    store.setCleanupTab(next);
  }

  const items = tab === 'queue' ? queue : tab === 'confirmed' ? confirmed : other;
  const filtered = query.trim()
    ? items.filter(item => item.account.display.toLowerCase().includes(query.trim().toLowerCase()) || item.account.id.includes(query.trim().toLowerCase()))
    : items;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  if (!state.dataset) return null;

  return (
    <div class="page">
      <div class="page-head">
        <div class="page-head__copy">
          <h1>The cleanup queue</h1>
          <p>
            These accounts are marked for cut. Open each profile, unfollow on Instagram if you still want to, then confirm
            it here yourself. Opening a profile is never treated as an unfollow.
          </p>
        </div>
        <div class="page-head__actions">
          <button type="button" class="btn" onClick={() => onNavigate('review')}>
            <Icon name="cards" size={15} /> Review more
          </button>
          <button type="button" class="btn" onClick={() => onNavigate('settings')}>
            <Icon name="settings" size={15} /> Data
          </button>
        </div>
      </div>

      <div class="cleanup-toolbar" role="group" aria-label="Cleanup actions">
        <div class="segmented" role="group" aria-label="Cleanup lists">
          <button type="button" aria-pressed={tab === 'queue'} onClick={() => setTab('queue')}>
            Queue <span class="count">{formatNumber(queue.length)}</span>
          </button>
          <button type="button" aria-pressed={tab === 'confirmed'} onClick={() => setTab('confirmed')}>
            Confirmed <span class="count">{formatNumber(confirmed.length)}</span>
          </button>
          <button type="button" aria-pressed={tab === 'other'} onClick={() => setTab('other')}>
            Skipped / uncertain <span class="count">{formatNumber(other.length)}</span>
          </button>
        </div>
        {tab === 'queue' ? (
          <div class="segmented" role="group" aria-label="Cleanup view">
            <button type="button" aria-pressed={mode === 'focus'} onClick={() => store.setCleanupMode('focus')}>
              <Icon name="cards" size={13} /> Focus
            </button>
            <button type="button" aria-pressed={mode === 'list'} onClick={() => store.setCleanupMode('list')}>
              <Icon name="list" size={13} /> List
            </button>
          </div>
        ) : null}
        <div class="cleanup-toolbar__spacer" />
        <div class="cleanup-toolbar__actions">
          <button type="button" class="btn btn--sm" onClick={exportCsv}><Icon name="download" size={13} /> CSV</button>
          <button type="button" class="btn btn--sm" onClick={exportJson}><Icon name="download" size={13} /> JSON</button>
        </div>
      </div>

      {tab === 'queue' && queue.length === 0 ? (
        <div class="empty-state">
          <div class="empty-state__mark" aria-hidden="true"><Icon name="check" size={24} /></div>
          <h2 ref={emptyHeadingRef} tabIndex={-1}>The pending queue is clear.</h2>
          <p>
            {confirmed.length > 0
              ? `You have confirmed ${formatNumber(confirmed.length)} manual unfollow${confirmed.length === 1 ? '' : 's'} in this snapshot.`
              : 'No accounts are marked for cut yet. Review a few cards and mark the ones you want to revisit.'}
          </p>
          <div class="empty-state__actions">
            {confirmed.length > 0 ? <button type="button" class="btn" onClick={() => setTab('confirmed')}>View confirmed</button> : null}
            <button type="button" class="btn btn--primary" onClick={() => onNavigate('review')}>Review following</button>
            <button type="button" class="btn btn--ghost" onClick={() => onNavigate('dashboard')}>Overview</button>
          </div>
        </div>
      ) : null}

      {tab === 'queue' && queue.length > 0 && mode === 'focus' && active ? (
        <div class="focus-shell">
          <div class="focus-card">
            <div class="focus-card__top">
              <span class="badge badge--accent"><Icon name="cut" size={11} /> Active row</span>
              <span class="mono">1 of {formatNumber(queue.length)} pending · {formatNumber(deferredCount)} deferred</span>
              <span class="badge badge--muted">Not confirmed</span>
            </div>
            <div class="focus-card__body">
              <div class="focus-identity">
                <div class="monogram" aria-hidden="true">{initials(active.account.display)}</div>
                <div>
                  <h2 class="focus-name">@{active.account.display}</h2>
                  <div class="focus-sub">
                    Initials, not a photo · {active.decision.reviewedAt ? `marked ${formatDate(active.decision.reviewedAt)}` : 'marked for cut'}
                  </div>
                </div>
              </div>

              <div class="deck-badges" style={{ marginTop: '14px' }}>
                <span class={`badge ${followBackLabel(active.account, state.dataset.snapshot).tone === 'notback' ? 'badge--accent' : active.account.followsMe ? 'badge--outline' : 'badge--muted'}`}>
                  {followBackLabel(active.account, state.dataset.snapshot).label}
                </span>
                {active.cleanup.state === 'profiled' ? <span class="badge badge--muted"><Icon name="eye" size={11} /> Profile opened</span> : null}
                {active.cleanup.state === 'skipped' ? <span class="badge badge--warn">Deferred</span> : null}
                {active.decision.favorite ? <span class="badge badge--muted"><Icon name="star" size={11} /> Starred</span> : null}
                {active.decision.protected ? <span class="badge badge--muted"><Icon name="lock" size={11} /> Locked</span> : null}
              </div>

              <dl class="focus-meta">
                <div class="deck-meta__item">
                  <dt>Followed</dt>
                  <dd>{active.account.followedAt ? new Date(active.account.followedAt * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not in export'}</dd>
                </div>
                <div class="deck-meta__item">
                  <dt>Marked</dt>
                  <dd>{active.decision.reviewedAt ? formatDate(active.decision.reviewedAt) : 'Unknown'}</dd>
                </div>
                <div class="deck-meta__item">
                  <dt>Snapshot</dt>
                  <dd>{state.dataset.snapshot.exportedAt ? formatDate(state.dataset.snapshot.exportedAt) : 'Date unknown'} <small>Not live data</small></dd>
                </div>
              </dl>

              <div class="focus-actions">
                <a
                  ref={openRef}
                  class="btn btn--primary btn--lg focus-primary"
                  href={active.account.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={event => { if (openProfileFor(active)) event.preventDefault(); }}
                >
                  Open @{active.account.display} on Instagram <Icon name="external" size={16} />
                </a>
                {active.cleanup.profileOpenedAt ? (
                  <p class="profile-opened" style={{ justifyContent: 'center' }}>
                    <Icon name="eye" size={13} /> Profile opened {formatDateShort(active.cleanup.profileOpenedAt)}. Opening is not a confirmation.
                  </p>
                ) : null}

                <div class="confirm-zone">
                  <div class="confirm-zone__head">
                    <Icon name="check" size={20} />
                    <div>
                      <h3>Only after you unfollow on Instagram</h3>
                      <p>
                        Confirm that you manually unfollowed this account. FOLLOW/CUT records your confirmation locally; it
                        never checks or changes Instagram, and it never confirms anything for you.
                      </p>
                    </div>
                  </div>
                  <div class="confirm-zone__actions">
                    <button type="button" class="btn btn--lg btn--confirm" onClick={confirmActive}>
                      <Icon name="check" size={17} /> I unfollowed this account
                    </button>
                  </div>
                </div>

                <div class="focus-secondary">
                  <button type="button" class="btn btn--sm" onClick={skipActive}>Skip for now</button>
                  <button type="button" class="btn btn--sm" onClick={keepActive}>Actually keep</button>
                  <button type="button" class="btn btn--sm" onClick={uncertainActive}>Mark uncertain</button>
                  <button type="button" class="btn btn--sm btn--ghost" onClick={() => onNavigate('review')}>Review more</button>
                </div>
                <p class="rail-note">
                  Keyboard: <kbd class="kbd kbd--plain">Enter</kbd> opens · <kbd class="kbd kbd--plain">C</kbd> confirms ·{' '}
                  <kbd class="kbd kbd--plain">S</kbd> skips · <kbd class="kbd kbd--plain">K</kbd> keeps ·{' '}
                  <kbd class="kbd kbd--plain">U</kbd> uncertain · <kbd class="kbd kbd--plain">Z</kbd> undo
                </p>
              </div>
            </div>

            <div class="focus-note">
              <label class="label" for="cleanup-note">Private note · only in this session and your backup</label>
              <textarea
                id="cleanup-note"
                key={active.account.id}
                class="textarea"
                maxLength={1000}
                value={note}
                placeholder="Why are you cutting this one? Optional."
                onInput={event => setNote((event.currentTarget as HTMLTextAreaElement).value)}
                onBlur={() => store.setNote(active.account.id, note)}
              />
              <p class="rail-note" style={{ marginTop: '6px' }}>Saved when you leave the field. No notes are uploaded.</p>
            </div>
          </div>

          <aside class="focus-side" aria-label="Cleanup progress">
            <div class="rail-block">
              <div class="rail-block__head">
                <h2>Confirmed</h2>
                <span class="mono">manual records</span>
              </div>
              <div class="focus-progress">
                <b>{formatNumber(metrics?.confirmedCurrent ?? 0)}</b>
                <span>of {formatNumber(metrics?.planned ?? 0)} intended</span>
              </div>
              <ProgressBar value={metrics?.cleanupProgress ?? 0} tone="confirm" label="Cleanup progress" />
              <p class="rail-note" style={{ marginTop: '8px' }}>
                {formatNumber(queue.length)} pending · {formatNumber(metrics?.uncertain ?? 0)} uncertain ·{' '}
                {formatNumber(metrics?.skipped ?? 0)} deferred
              </p>
            </div>
            <div class="rail-block">
              <h2 class="mono" style={{ color: 'var(--muted)', fontSize: '0.6875rem', letterSpacing: '0.1em' }}>The rules</h2>
              <ul class="cleanup-rules" style={{ marginTop: '10px' }}>
                <li><Icon name="eye" size={14} /> Opening a profile is recorded, but it is never a confirmation.</li>
                <li><Icon name="check" size={14} /> Only the explicit "I unfollowed this account" action confirms.</li>
                <li><Icon name="shield" size={14} /> Nothing is sent to Instagram. There is no automation.</li>
                <li><Icon name="undo" size={14} /> Confirmed counts can be undone locally at any time.</li>
              </ul>
            </div>
            <div class="rail-block">
              <button
                type="button"
                class="btn btn--sm btn--block"
                disabled={state.cleanupUndo.length === 0}
                onClick={() => store.undoCleanup()}
              >
                <Icon name="undo" size={14} /> Undo last cleanup action
              </button>
              <button type="button" class="btn btn--sm btn--block btn--ghost" style={{ marginTop: '6px' }} onClick={onHelp}>
                <Icon name="help" size={14} /> Keyboard & semantics
              </button>
            </div>
            {metrics && metrics.confirmedArchived > 0 ? (
              <p class="rail-note">
                {formatNumber(metrics.confirmedArchived)} earlier confirmation{metrics.confirmedArchived === 1 ? '' : 's'} archived when you replaced the snapshot.
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}

      {tab === 'queue' && queue.length > 0 && mode === 'list' ? (
        <>
          <div class="cleanup-toolbar" style={{ borderBottom: 0, marginBottom: 0, paddingBottom: '12px' }}>
            <div class="search-wrap" style={{ flex: '1 1 260px', maxWidth: '360px' }}>
              <Icon name="search" size={15} />
              <input
                class="input search-input"
                type="search"
                value={query}
                placeholder="Search the queue"
                aria-label="Search the cleanup queue"
                onInput={event => { setQuery((event.currentTarget as HTMLInputElement).value); setPage(0); }}
              />
            </div>
            <span class="mono">{formatNumber(filtered.length)} matching</span>
          </div>
          {renderTable(paged, tab, state, { onOpen: item => openProfileFor(item), onConfirm: id => { store.confirmUnfollow(id); }, onSkip: id => store.skipAccount(id), onUncertain: id => store.markUncertain(id), onKeep: id => store.actuallyKeep(id), onRequeue: id => store.requeue(id), onUndo: id => store.undoConfirmation(id) })}
          {filtered.length > PAGE_SIZE ? (
            <div class="pager">
              <span>Page {safePage + 1} of {pageCount}</span>
              <div class="pager__buttons">
                <button type="button" class="btn btn--sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
                <button type="button" class="btn btn--sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {tab !== 'queue' ? (
        items.length === 0 ? (
          <div class="empty-state">
            <div class="empty-state__mark" aria-hidden="true">
              <Icon name={tab === 'confirmed' ? 'check' : 'maybe'} size={24} />
            </div>
            <h2 ref={emptyHeadingRef} tabIndex={-1}>
              {tab === 'confirmed' ? 'No manual confirmations yet.' : 'Nothing skipped or uncertain.'}
            </h2>
            <p>
              {tab === 'confirmed'
                ? 'When you have unfollowed an account on Instagram, confirm it from the queue. It will appear here as your own record.'
                : 'Deferred and uncertain accounts will appear here, separate from confirmed removals.'}
            </p>
            <div class="empty-state__actions">
              <button type="button" class="btn btn--primary" onClick={() => setTab('queue')}>Back to queue</button>
              <button type="button" class="btn btn--ghost" onClick={() => onNavigate('review')}>Review more</button>
            </div>
          </div>
        ) : (
          <>
            <div class="cleanup-toolbar" style={{ borderBottom: 0, marginBottom: 0, paddingBottom: '12px' }}>
              <div class="search-wrap" style={{ flex: '1 1 260px', maxWidth: '360px' }}>
                <Icon name="search" size={15} />
                <input
                  class="input search-input"
                  type="search"
                  value={query}
                  placeholder="Search"
                  aria-label="Search this list"
                  onInput={event => { setQuery((event.currentTarget as HTMLInputElement).value); setPage(0); }}
                />
              </div>
              <span class="mono">{formatNumber(filtered.length)} matching</span>
              {tab === 'confirmed' ? <span class="rail-note">Your local records, not live Instagram state.</span> : null}
            </div>
            {renderTable(paged, tab, state, { onOpen: item => openProfileFor(item), onConfirm: id => store.confirmUnfollow(id), onSkip: id => store.skipAccount(id), onUncertain: id => store.markUncertain(id), onKeep: id => store.actuallyKeep(id), onRequeue: id => store.requeue(id), onUndo: id => store.undoConfirmation(id) })}
            {filtered.length > PAGE_SIZE ? (
              <div class="pager">
                <span>Page {safePage + 1} of {pageCount}</span>
                <div class="pager__buttons">
                  <button type="button" class="btn btn--sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
                  <button type="button" class="btn btn--sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}

      <p class="rail-note" style={{ marginTop: '24px', maxWidth: '78ch' }}>
        Confirmations are manual records stored only in this browser. They are not verified against Instagram, and they do
        not change live follower or following counts. Re-importing a newer export moves confirmations for accounts you no
        longer follow into an archived count.
      </p>
    </div>
  );
}

interface TableActions {
  onOpen: (item: QueueItem) => boolean;
  onConfirm: (id: string) => void;
  onSkip: (id: string) => void;
  onUncertain: (id: string) => void;
  onKeep: (id: string) => void;
  onRequeue: (id: string) => void;
  onUndo: (id: string) => void;
}

function renderTable(items: QueueItem[], tab: 'queue' | 'confirmed' | 'other', state: ReturnType<typeof useStore>, actions: TableActions) {
  if (items.length === 0) {
    return <p class="rail-note">No matches.</p>;
  }
  return (
    <div class="queue-table" role="table" aria-label={tab === 'queue' ? 'Pending cleanup queue' : tab === 'confirmed' ? 'Confirmed manual unfollows' : 'Skipped and uncertain accounts'}>
      <div class="queue-head" role="row">
        <span role="columnheader">Account</span>
        <span role="columnheader">Follow-back</span>
        <span role="columnheader">State</span>
        <span role="columnheader" style={{ textAlign: 'right' }}>Actions</span>
      </div>
      {items.map((item, index) => (
        <div class="queue-row" role="row" key={`${tab}-${item.account.id}-${index}`}>
          <div class="queue-who" role="cell">
            <div class="monogram" aria-hidden="true">{initials(item.account.display)}</div>
            <div style={{ minWidth: 0 }}>
              <b>@{item.account.display}</b>
              <span>{item.account.followedAt ? `Followed ${formatDate(new Date(item.account.followedAt * 1000).toISOString())}` : 'Follow date not in export'}</span>
              <span class="queue-note">Marked {formatDate(item.decision.reviewedAt)}</span>
              {item.decision.notes ? <span class="queue-note"><Icon name="note" size={10} /> {item.decision.notes}</span> : null}
            </div>
          </div>
          <div class="queue-mid" role="cell">
            <span class={`badge ${item.account.followsMe === false ? 'badge--accent' : item.account.followsMe ? 'badge--outline' : 'badge--muted'}`}>
              {followBackLabel(item.account, state.dataset!.snapshot).label}
            </span>
          </div>
          <div class="queue-mid" role="cell">
            <span class={`badge ${item.cleanup.state === 'confirmed' ? 'badge--confirm' : item.cleanup.state === 'uncertain' ? 'badge--warn' : 'badge--muted'}`}>
              {cleanupStateLabel(item.cleanup.state)}
            </span>
            {item.cleanup.confirmedAt ? <span class="queue-note">{formatDate(item.cleanup.confirmedAt)}</span> : null}
            {item.cleanup.state === 'skipped' ? <span class="queue-note">deferred</span> : null}
          </div>
          <div class="queue-actions" role="cell">
            <a class="btn btn--sm" href={item.account.profileUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open @${item.account.display} on Instagram`} onClick={event => { if (actions.onOpen(item)) event.preventDefault(); }}>Open</a>
            {tab === 'queue' ? (
              <>
                <button type="button" class="btn btn--sm" aria-label={`Confirm you unfollowed @${item.account.display}`} onClick={() => actions.onConfirm(item.account.id)}>Confirm</button>
                <button type="button" class="btn btn--sm btn--ghost" aria-label={`Defer @${item.account.display}`} onClick={() => actions.onSkip(item.account.id)}>Defer</button>
                <button type="button" class="btn btn--sm btn--ghost" aria-label={`Mark @${item.account.display} uncertain`} onClick={() => actions.onUncertain(item.account.id)}>Uncertain</button>
              </>
            ) : tab === 'confirmed' ? (
              <button type="button" class="btn btn--sm" aria-label={`Undo confirmation for @${item.account.display}`} onClick={() => actions.onUndo(item.account.id)}>Undo</button>
            ) : (
              <>
                <button type="button" class="btn btn--sm" aria-label={`Move @${item.account.display} back to the queue`} onClick={() => actions.onRequeue(item.account.id)}>Requeue</button>
                <button type="button" class="btn btn--sm btn--ghost" aria-label={`Actually keep @${item.account.display}`} onClick={() => actions.onKeep(item.account.id)}>Keep</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
