import { useEffect, useRef, useState } from 'preact/hooks';
import type { HTMLAttributes } from 'preact';
import type { ReviewFilter, View } from '../lib/types';
import { store } from '../lib/store';
import { useReducedMotion, useStore } from '../lib/hooks';
import {
  deckInfo,
  filterCounts,
  filterLabel,
  formatDate,
  formatNumber,
  getMetrics
} from '../lib/selectors';
import { AccountCard, StaticCard, type CardStamps } from '../components/AccountCard';
import { ProgressBar } from '../components/ProgressBar';
import { Icon } from '../components/Icon';
import { openProfileInTab } from '../lib/profileLink';

interface ReviewProps {
  onNavigate: (view: View) => void;
  onHelp: () => void;
}

const FILTERS: ReviewFilter[] = ['all', 'unreviewed', 'notBack', 'mutual', 'unfollow', 'maybe', 'keep', 'favorites', 'protected'];

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function Review({ onNavigate, onHelp }: ReviewProps) {
  const state = useStore();
  const metrics = getMetrics(state);
  const info = deckInfo(state);
  const counts = filterCounts(state);
  const account = info.current;
  const current = account ? account : null;
  const reduceMotion = useReducedMotion() || state.settings.motion === 'reduce';
  const [drag, setDrag] = useState<{ dx: number; dy: number; active: boolean } | null>(null);
  const [exit, setExit] = useState<null | 'left' | 'right' | 'down'>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0, pointerId: 0 });
  const timerRef = useRef<number | null>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousId = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!current && previousId.current) {
      requestAnimationFrame(() => emptyHeadingRef.current?.focus());
    }
    previousId.current = current?.id ?? null;
  }, [current?.id]);

  function openProfileViaKeyboard() {
    if (!current) return;
    store.markProfileOpened(current.id);
    openProfileInTab(current.profileUrl);
  }

  function commit(choice: 'keep' | 'unfollow' | 'maybe', direction: 'left' | 'right' | 'down', animate: boolean) {
    if (!current || exit) return;
    const id = current.id;
    setDrag(null);
    dragRef.current.active = false;
    if (!animate || reduceMotion) {
      store.decide(id, choice);
      return;
    }
    setExit(direction);
    timerRef.current = window.setTimeout(() => {
      store.decide(id, choice);
      setExit(null);
      timerRef.current = null;
    }, 168);
  }

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
      if (!current || exit) return;
      if (event.repeat) return;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          commit('unfollow', 'left', true);
          break;
        case 'ArrowRight':
          event.preventDefault();
          commit('keep', 'right', true);
          break;
        case 'ArrowDown':
          event.preventDefault();
          commit('maybe', 'down', true);
          break;
        case ' ':
          if (target?.closest('button, a, [role="button"]')) return;
          event.preventDefault();
          openProfileViaKeyboard();
          break;
        case 's':
        case 'S':
          event.preventDefault();
          store.toggleFavorite(current.id);
          break;
        case 'l':
        case 'L':
          event.preventDefault();
          store.toggleProtected(current.id);
          break;
        case 'z':
        case 'Z':
          event.preventDefault();
          store.undoDecision();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current?.id, exit, reduceMotion, onHelp]);

  function handlePointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('a, button, input, textarea, select, [role="button"]')) return;
    if (exit || !current) return;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      pointerId: event.pointerId
    };
    setDrag({ dx: 0, dy: 0, active: true });
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    dragRef.current.dx = dx;
    dragRef.current.dy = dy;
    setDrag({ dx, dy, active: true });
  }

  function handlePointerUp(event: PointerEvent) {
    if (!dragRef.current.active) return;
    const element = event.currentTarget as HTMLElement;
    try {
      element.releasePointerCapture(dragRef.current.pointerId);
    } catch {
      // Pointer capture may already have been released.
    }
    const { dx, dy } = dragRef.current;
    dragRef.current.active = false;
    const threshold = Math.min(110, Math.max(64, element.clientWidth * 0.18));
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      commit(dx < 0 ? 'unfollow' : 'keep', dx < 0 ? 'left' : 'right', true);
    } else if (dy > threshold && Math.abs(dy) > Math.abs(dx)) {
      commit('maybe', 'down', true);
    } else {
      setDrag(null);
    }
  }

  function handlePointerCancel() {
    dragRef.current.active = false;
    setDrag(null);
  }

  const style: HTMLAttributes<HTMLElement>['style'] = drag?.active && !exit
    ? { transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0) rotate(${drag.dx / 26}deg)` }
    : undefined;
  const stamps: CardStamps = {
    cut: drag?.active ? clamp((-drag.dx - 20) / 85) : exit === 'left' ? 1 : 0,
    keep: drag?.active ? clamp((drag.dx - 20) / 85) : exit === 'right' ? 1 : 0,
    maybe: drag?.active ? clamp((drag.dy - 20) / 85) : exit === 'down' ? 1 : 0
  };
  const cardClass = exit ? `is-exiting is-exit-${exit}` : drag?.active ? 'is-dragging' : '';

  const currentDecision = current ? state.decisions.get(current.id) : undefined;
  const profileOpenedAt = current ? state.profileOpens.get(current.id) : undefined;
  const maybeCount = counts.maybe;
  const queueCount = metrics?.pendingQueue ?? 0;
  const unreviewedTotal = metrics?.unreviewed ?? 0;
  const followBackAvailable = state.dataset?.snapshot.followerData === 'present';
  const isDemo = Boolean(state.dataset?.snapshot.demo);
  const previewEnabled = state.settings.profileOpen === 'preview' && !isDemo;

  function selectFilter(filter: ReviewFilter) {
    store.setFilter(filter);
    if (window.matchMedia('(max-width: 860px)').matches) setFiltersOpen(false);
  }

  function resetFilters() {
    store.setFilter('all');
    store.setSort('oldest');
    setFiltersOpen(false);
  }

  if (!state.dataset) return null;

  return (
    <div class="page review-page">
      <h1 class="sr-only">Review your Instagram following</h1>
      <div class="review-layout">
        <aside class={`review-rail${filtersOpen ? ' is-open' : ''}`} aria-label="Review filters">
          <div class="rail-block">
            <div class="rail-block__head">
              <h2>Review progress</h2>
              <span class="mono">{formatNumber(info.total)} in view</span>
            </div>
            <div class="rail-progress__line">
              <b>{formatNumber(metrics?.reviewed ?? 0)}<span class="muted" style={{ fontSize: '0.9rem' }}> / {formatNumber(metrics?.following ?? 0)}</span></b>
              <span>{formatNumber(unreviewedTotal)} left overall</span>
            </div>
            <ProgressBar value={metrics?.reviewProgress ?? 0} label="Review progress" />
            <p class="rail-note" style={{ marginTop: '8px' }}>
              {current ? `Card ${info.index} of ${formatNumber(info.total)} in this view.` : 'All cards in this view reviewed.'} Saved after every card.
            </p>
          </div>

          <div class="rail-block">
            <div class="rail-block__head">
              <h2>Find a card</h2>
              <span class="mono">all following</span>
            </div>
            <div class="search-wrap">
              <Icon name="search" size={15} />
              <input
                class="input search-input"
                type="search"
                value={state.ui.query}
                placeholder="Search username"
                aria-label="Search your following by username"
                onInput={event => store.setQuery((event.currentTarget as HTMLInputElement).value)}
              />
              {state.ui.query ? (
                <button type="button" class="search-clear" aria-label="Clear search" onClick={() => store.setQuery('')}>
                  <Icon name="x" size={14} />
                </button>
              ) : null}
            </div>
            <ul class="filter-list">
              {FILTERS.map(filter => {
                const disabled = (filter === 'notBack' || filter === 'mutual') && !followBackAvailable;
                return (
                  <li key={filter}>
                    <button
                      type="button"
                      class="filter-btn"
                      aria-pressed={state.ui.filter === filter}
                      disabled={disabled}
                      onClick={() => selectFilter(filter)}
                    >
                      <span>{filterLabel(filter)}</span>
                      <span class="count">{formatNumber(counts[filter])}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!followBackAvailable ? (
              <p class="filter-hint">
                Follow-back comparison needs a follower list. This export {state.dataset.snapshot.followerData === 'incomplete' ? 'has an incomplete one' : 'does not have one'}.
              </p>
            ) : null}
            <div class="field" style={{ marginTop: '12px' }}>
              <label for="review-sort">Order</label>
              <select
                id="review-sort"
                class="select sort-select"
                value={state.ui.sort}
                onChange={event => store.setSort((event.currentTarget as HTMLSelectElement).value as typeof state.ui.sort)}
              >
                <option value="oldest">Oldest follows first</option>
                <option value="newest">Newest follows first</option>
                <option value="az">A–Z</option>
                <option value="shuffle">Shuffle (stable)</option>
              </select>
            </div>
            <div class="rail-foot" style={{ marginTop: '10px' }}>
              <button type="button" class="btn btn--sm btn--ghost" onClick={resetFilters}>Reset filters</button>
              <button type="button" class="btn btn--sm btn--ghost" onClick={onHelp}>Keys</button>
            </div>
          </div>

          <div class="rail-block">
            <div class="rail-block__head">
              <h2>This snapshot</h2>
            </div>
            <p class="rail-note">
              <strong>{state.dataset.snapshot.exportedAt ? `Exported ${formatDate(state.dataset.snapshot.exportedAt)}` : 'Export date unknown'}</strong><br />
              Not live Instagram data. Counts can be out of date.
            </p>
            {state.dataset.snapshot.demo ? <p class="badge badge--warn" style={{ marginTop: '8px' }}>Demo · fictional</p> : null}
          </div>
        </aside>

        <section class="deck-area" aria-label="Review deck">
          <div class="deck-toolbar">
            <button
              type="button"
              class="btn btn--sm mobile-filter-btn"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(open => !open)}
            >
              <Icon name="filter" size={14} /> Filters · {formatNumber(counts[state.ui.filter])}
            </button>
            <div class="deck-pos">
              <span class="deck-pos__full">
                {current ? `Card ${String(info.index).padStart(3, '0')} of ${String(info.total).padStart(3, '0')}` : 'Deck complete'}
                <span aria-hidden="true"> · </span>
                {filterLabel(state.ui.filter)}
              </span>
              <span class="deck-pos__compact">{current ? `${info.index} / ${info.total}` : 'Complete'}</span>
            </div>
            <div class="deck-toolbar__spacer" />
            <div class="deck-toolbar__group">
              {!isDemo ? (
                <button
                  type="button"
                  class="btn btn--sm"
                  aria-pressed={state.settings.profileOpen === 'preview'}
                  aria-label={state.settings.profileOpen === 'preview' ? 'Turn off card previews' : 'Load card previews'}
                  onClick={() => store.setProfileOpen(state.settings.profileOpen === 'preview' ? 'tab' : 'preview')}
                >
                  <Icon name={state.settings.profileOpen === 'preview' ? 'check' : 'eye'} size={14} />
                  <span class="toolbar-label toolbar-label--desktop">{state.settings.profileOpen === 'preview' ? 'Previews on' : 'Load previews'}</span>
                  <span class="toolbar-label toolbar-label--mobile">Preview</span>
                </button>
              ) : null}
              <button type="button" class="icon-btn deck-prev" aria-label="Previous card" title="Previous card" disabled={!current || info.index <= 1} onClick={() => store.back()}>
                <Icon name="chevron-left" size={18} />
              </button>
              <button type="button" class="icon-btn deck-next" aria-label="Next card" title="Next card" disabled={!current || info.index >= info.total} onClick={() => store.next()}>
                <Icon name="chevron-right" size={18} />
              </button>
              <button type="button" class="btn btn--sm" disabled={state.undo.length === 0} onClick={() => store.undoDecision()}>
                <Icon name="undo" size={14} /> Undo
              </button>
              <button type="button" class="icon-btn deck-help" aria-label="Keyboard shortcuts and help" onClick={onHelp}>
                <Icon name="help" size={18} />
              </button>
            </div>
          </div>

          <div class="deck-stage">
            <div class="deck-stack">
              {info.next[1] ? <StaticCard account={info.next[1]} index={info.index + 2} total={info.total} second /> : null}
              {info.next[0] ? <StaticCard account={info.next[0]} index={info.index + 1} total={info.total} /> : null}
              {current ? (
                <AccountCard
                  state={state}
                  account={current}
                  decision={currentDecision}
                  snapshot={state.dataset.snapshot}
                  profileOpenedAt={profileOpenedAt}
                  index={info.index}
                  total={info.total}
                  stamps={stamps}
                  style={style}
                  class={cardClass}
                  onStar={() => store.toggleFavorite(current.id)}
                  onLock={() => store.toggleProtected(current.id)}
                  onOpenProfile={() => store.markProfileOpened(current.id)}
                  previewEnabled={previewEnabled}
                  upcoming={info.next.slice(0, 1)}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                />
              ) : (
                <DeckEmpty
                  state={state}
                  emptyHeadingRef={emptyHeadingRef}
                  maybeCount={maybeCount}
                  queueCount={queueCount}
                  unreviewedTotal={unreviewedTotal}
                  filter={state.ui.filter}
                  totalInFilter={info.total}
                  onNavigate={onNavigate}
                  onReset={resetFilters}
                  onShowAll={() => selectFilter('all')}
                  onShowMaybe={() => selectFilter('maybe')}
                  onBack={() => store.back()}
                />
              )}
            </div>
          </div>

          {current ? (
            <>
              <div class="deck-actions" aria-label="Decide on this account">
                <button type="button" class="deck-action deck-action--cut" disabled={Boolean(exit)} onClick={() => commit('unfollow', 'left', true)} aria-keyshortcuts="ArrowLeft">
                  <span class="row"><Icon name="cut" size={18} /> Cut</span>
                  <span class="tiny">← mark for cleanup</span>
                </button>
                <button type="button" class="deck-action deck-action--maybe" disabled={Boolean(exit)} onClick={() => commit('maybe', 'down', true)} aria-keyshortcuts="ArrowDown">
                  <span class="row"><Icon name="maybe" size={18} /> Maybe</span>
                  <span class="tiny">↓ revisit later</span>
                </button>
                <button type="button" class="deck-action deck-action--keep" disabled={Boolean(exit)} onClick={() => commit('keep', 'right', true)} aria-keyshortcuts="ArrowRight">
                  <span class="row"><Icon name="keep" size={18} /> Keep</span>
                  <span class="tiny">→ keep following</span>
                </button>
              </div>
              <div class="deck-secondary">
                <div class="deck-secondary__left">
                  <button type="button" class="btn btn--sm" aria-pressed={Boolean(currentDecision?.favorite)} onClick={() => store.toggleFavorite(current.id)}>
                    <Icon name="star" size={15} filled={Boolean(currentDecision?.favorite)} /> {currentDecision?.favorite ? 'Starred' : 'Star'}
                  </button>
                  <button type="button" class="btn btn--sm" aria-pressed={Boolean(currentDecision?.protected)} onClick={() => store.toggleProtected(current.id)}>
                    <Icon name={currentDecision?.protected ? 'lock' : 'unlock'} size={15} /> {currentDecision?.protected ? 'Locked' : 'Lock'}
                  </button>
                  <a
                    class="btn btn--sm"
                    href={current.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => store.markProfileOpened(current.id)}
                  >
                    <Icon name="external" size={14} /> Open full profile
                  </a>
                </div>
                <div class="deck-secondary__right">
                  <span class="rail-note">Cut is a plan. It never unfollows.</span>
                </div>
              </div>
              <div class="deck-hints" aria-hidden="true">
                <span><kbd>←</kbd> Cut</span>
                <span><kbd>→</kbd> Keep</span>
                <span><kbd>↓</kbd> Maybe</span>
                <span><kbd>Space</kbd> Open profile</span>
                <span><kbd>S</kbd> Star</span>
                <span><kbd>Z</kbd> Undo</span>
                <span><kbd>?</kbd> Help</span>
              </div>
            </>
          ) : null}
        </section>

        <aside class="review-side" aria-label="Review context">
          <div class="side-block">
            <h2>Card previews</h2>
            <div class="segmented" style={{ marginTop: '8px' }} role="group" aria-label="Card previews">
              <button type="button" aria-pressed={state.settings.profileOpen === 'preview'} onClick={() => store.setProfileOpen('preview')}>In-app</button>
              <button type="button" aria-pressed={state.settings.profileOpen === 'tab'} onClick={() => store.setProfileOpen('tab')}>Off</button>
            </div>
            <p class="side-note">
              {isDemo
                ? 'Demo accounts are fictional. Card previews need a real export.'
                : 'In-app puts a low-resolution Instagram post strip in the current card and preloads the next profile. Off keeps cards offline; Open full profile still opens Instagram.'}
            </p>
          </div>
          <div class="side-block">
            <h2>Shortcuts</h2>
            <ul class="shortcut-list">
              <li><span>Cut · mark for cleanup</span><kbd>←</kbd></li>
              <li><span>Keep</span><kbd>→</kbd></li>
              <li><span>Maybe</span><kbd>↓</kbd></li>
              <li><span>Open profile</span><kbd>Space</kbd></li>
              <li><span>Star</span><kbd>S</kbd></li>
              <li><span>Lock</span><kbd>L</kbd></li>
              <li><span>Undo</span><kbd>Z</kbd></li>
            </ul>
          </div>
          <div class="side-block">
            <h2>Cleanup queue</h2>
            <div class="side-queue">
              <b>{formatNumber(queueCount)}</b>
              <span>waiting</span>
            </div>
            <p class="side-note">A cut enters the queue. You confirm each unfollow yourself on Instagram.</p>
            <button type="button" class="btn btn--sm btn--block" style={{ marginTop: '8px' }} onClick={() => onNavigate('cleanup')}>
              Open cleanup <Icon name="chevron-right" size={14} />
            </button>
          </div>
          <div class="side-block">
            <h2>Maybe later</h2>
            <div class="side-queue">
              <b>{formatNumber(maybeCount)}</b>
              <span>to revisit</span>
            </div>
            <p class="side-note">Maybes are neither kept nor queued. They stay out of cleanup until you decide.</p>
            <button type="button" class="btn btn--sm btn--block" onClick={() => selectFilter('maybe')}>
              Review maybes
            </button>
          </div>
          <div class="side-block">
            <p class="side-note">
              <strong>Snapshot:</strong> {state.dataset.snapshot.exportedAt ? formatDate(state.dataset.snapshot.exportedAt) : 'date unknown'}. Not live data.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface DeckEmptyProps {
  state: ReturnType<typeof useStore>;
  emptyHeadingRef: { current: HTMLHeadingElement | null };
  maybeCount: number;
  queueCount: number;
  unreviewedTotal: number;
  filter: ReviewFilter;
  totalInFilter: number;
  onNavigate: (view: View) => void;
  onReset: () => void;
  onShowAll: () => void;
  onShowMaybe: () => void;
  onBack: () => void;
}

function DeckEmpty({
  state,
  emptyHeadingRef,
  maybeCount,
  queueCount,
  unreviewedTotal,
  filter,
  totalInFilter,
  onNavigate,
  onReset,
  onShowAll,
  onShowMaybe,
  onBack
}: DeckEmptyProps) {
  const emptyFilter = totalInFilter === 0;
  const allReviewed = unreviewedTotal === 0;
  const title = emptyFilter
    ? 'No accounts in this filter.'
    : allReviewed
      ? 'Every card reviewed.'
      : 'Nothing unreviewed in this filter.';
  return (
    <div class="deck-empty">
      <div class="deck-empty__mark" aria-hidden="true">
        <Icon name={allReviewed ? 'check' : 'cards'} size={28} />
      </div>
      <h2 ref={emptyHeadingRef} tabIndex={-1}>{title}</h2>
      <p>
        {emptyFilter
          ? `The ${filterLabel(filter)} filter has nothing in it right now. Try another filter or clear the search.`
          : allReviewed
            ? `You reviewed all ${formatNumber(state.dataset?.accounts.length ?? 0)} accounts in this snapshot. The review is finished; the cleanup queue waits at your pace.`
            : `${formatNumber(unreviewedTotal)} account${unreviewedTotal === 1 ? ' is' : 's are'} still unreviewed outside this filter.`}
      </p>
      <div class="deck-empty__actions">
        {allReviewed && queueCount > 0 ? (
          <button type="button" class="btn btn--primary" onClick={() => onNavigate('cleanup')}>
            Clean up {formatNumber(queueCount)} <Icon name="arrow-right" size={15} />
          </button>
        ) : null}
        {allReviewed && maybeCount > 0 ? (
          <button type="button" class="btn" onClick={onShowMaybe}>Review {formatNumber(maybeCount)} in Maybe</button>
        ) : null}
        {!allReviewed && unreviewedTotal > 0 ? (
          <button type="button" class="btn btn--ink" onClick={onShowAll}>Show all following</button>
        ) : null}
        {!emptyFilter ? (
          <button type="button" class="btn" onClick={onBack}>
            <Icon name="chevron-left" size={15} /> Back one card
          </button>
        ) : null}
        <button type="button" class="btn btn--ghost" onClick={onReset}>Reset filters</button>
        {!allReviewed ? (
          <button type="button" class="btn btn--ghost" onClick={() => onNavigate('dashboard')}>Overview</button>
        ) : null}
      </div>
      <p class="rail-note" style={{ marginTop: '4px' }}>
        {allReviewed ? 'Completing a review is the milestone. Removing people is not a score.' : 'Your decisions are saved.'}
      </p>
    </div>
  );
}
