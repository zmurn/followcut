import type {
  Account,
  Cleanup,
  CleanupState,
  Dataset,
  Decision,
  History,
  Metrics,
  QueueItem,
  ReviewFilter,
  Settings,
  Snapshot,
  UiState
} from './types';

/** The read-only shape selectors need. Both the store and tests can satisfy it. */
export interface ReadState {
  dataset: Dataset | null;
  decisions: Map<string, Decision>;
  cleanup: Map<string, Cleanup>;
  profileOpens: Map<string, string>;
  settings: Settings;
  ui: UiState;
  history: History;
}

const indexCache = new WeakMap<Dataset, Map<string, Account>>();
const followerCache = new WeakMap<Dataset, Set<string>>();

export function accountIndex(dataset: Dataset | null): Map<string, Account> {
  if (!dataset) return new Map();
  let index = indexCache.get(dataset);
  if (!index) {
    index = new Map(dataset.accounts.map(a => [a.id, a]));
    indexCache.set(dataset, index);
  }
  return index;
}

export function followerSet(dataset: Dataset | null): Set<string> {
  if (!dataset) return new Set();
  let set = followerCache.get(dataset);
  if (!set) {
    set = new Set(dataset.followers);
    followerCache.set(dataset, set);
  }
  return set;
}

export function getDecision(state: ReadState, id: string): Decision | undefined {
  return state.decisions.get(id);
}

export function isReviewed(decision: Decision | undefined): boolean {
  return Boolean(decision && decision.reviewedAt && decision.choice !== 'undecided');
}

export function defaultCleanup(at: string): Cleanup {
  return { state: 'queued', queuedAt: at, updatedAt: at };
}

/** A cleanup record only means something while the decision is "unfollow". */
export function cleanupFor(state: ReadState, accountId: string): Cleanup | null {
  const decision = state.decisions.get(accountId);
  if (!decision || decision.choice !== 'unfollow') return null;
  return state.cleanup.get(accountId) ?? defaultCleanup(decision.updatedAt);
}

export function choiceOf(state: ReadState, id: string): Decision['choice'] {
  return state.decisions.get(id)?.choice ?? 'undecided';
}

export function isMutual(account: Account): boolean | undefined {
  return account.followsMe;
}

export function showsReviewedState(filter: ReviewFilter): boolean {
  return filter === 'unfollow' || filter === 'maybe' || filter === 'keep' || filter === 'favorites' || filter === 'protected';
}

export function filterLabel(filter: ReviewFilter): string {
  const labels: Record<ReviewFilter, string> = {
    all: 'All following',
    unreviewed: 'Unreviewed',
    notBack: 'Not following back',
    mutual: 'Mutuals',
    unfollow: 'Marked for cut',
    maybe: 'Maybe',
    keep: 'Kept',
    favorites: 'Starred',
    protected: 'Locked'
  };
  return labels[filter];
}

export function sortLabel(sort: UiState['sort']): string {
  return sort === 'oldest' ? 'Oldest follows first' : sort === 'newest' ? 'Newest follows first' : sort === 'az' ? 'A–Z' : 'Shuffle';
}

function matchesFilter(state: ReadState, account: Account, filter: ReviewFilter): boolean {
  const decision = state.decisions.get(account.id);
  const snapshot = state.dataset?.snapshot;
  const followerKnown = snapshot?.followerData === 'present';
  switch (filter) {
    case 'all':
      return true;
    case 'unreviewed':
      return !isReviewed(decision);
    case 'notBack':
      return followerKnown && account.followsMe === false;
    case 'mutual':
      return followerKnown && account.followsMe === true;
    case 'unfollow':
      return decision?.choice === 'unfollow';
    case 'maybe':
      return decision?.choice === 'maybe';
    case 'keep':
      return decision?.choice === 'keep';
    case 'favorites':
      return Boolean(decision?.favorite);
    case 'protected':
      return Boolean(decision?.protected);
    default:
      return true;
  }
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function orderedAccounts(state: ReadState): Account[] {
  const dataset = state.dataset;
  if (!dataset) return [];
  const query = state.ui.query.trim().toLowerCase().replace(/^@/, '');
  const list = dataset.accounts.filter(account => {
    if (!matchesFilter(state, account, state.ui.filter)) return false;
    if (!query) return true;
    return account.id.includes(query) || account.display.toLowerCase().includes(query);
  });
  const sort = state.ui.sort;
  const seed = dataset.snapshot.id;
  list.sort((a, b) => {
    if (sort === 'az') return a.id.localeCompare(b.id, 'en');
    if (sort === 'shuffle') {
      const d = hashString(a.id + seed) - hashString(b.id + seed);
      return d || a.id.localeCompare(b.id, 'en');
    }
    const at = a.followedAt;
    const bt = b.followedAt;
    if (at === undefined && bt === undefined) return a.id.localeCompare(b.id, 'en');
    if (at === undefined) return 1;
    if (bt === undefined) return -1;
    return sort === 'newest' ? bt - at || a.id.localeCompare(b.id, 'en') : at - bt || a.id.localeCompare(b.id, 'en');
  });
  return list;
}

export function orderedIds(state: ReadState): string[] {
  return orderedAccounts(state).map(a => a.id);
}

export function firstUnreviewed(state: ReadState, list = orderedAccounts(state)): Account | null {
  return list.find(account => !isReviewed(state.decisions.get(account.id))) ?? null;
}

export function currentAccount(state: ReadState): Account | null {
  const list = orderedAccounts(state);
  if (list.length === 0) return null;
  const cursor = state.ui.cursorId;
  if (cursor) {
    const found = list.find(account => account.id === cursor);
    if (found) return found;
  }
  return firstUnreviewed(state, list);
}

export interface DeckInfo {
  current: Account | null;
  index: number;
  total: number;
  next: Account[];
  unreviewedInFilter: number;
  hasUnreviewed: boolean;
}

export function deckInfo(state: ReadState): DeckInfo {
  const list = orderedAccounts(state);
  const current = currentAccount(state);
  const index = current ? list.findIndex(a => a.id === current.id) : -1;
  const next = index >= 0 ? list.slice(index + 1, index + 3) : [];
  const unreviewedInFilter = list.filter(a => !isReviewed(state.decisions.get(a.id))).length;
  return { current, index: index + 1, total: list.length, next, unreviewedInFilter, hasUnreviewed: unreviewedInFilter > 0 };
}

/** The next unreviewed card after a decision, staying inside the visible order. */
export function nextUnreviewedAfter(state: ReadState, decidedId: string, orderBefore: string[]): string | null {
  const start = orderBefore.indexOf(decidedId);
  if (start < 0) {
    const first = orderedAccounts(state).find(a => a.id !== decidedId && !isReviewed(state.decisions.get(a.id)));
    return first?.id ?? null;
  }
  for (let i = start + 1; i < orderBefore.length; i++) {
    const id = orderBefore[i];
    if (id !== decidedId && !isReviewed(state.decisions.get(id))) return id;
  }
  for (let i = 0; i < start; i++) {
    const id = orderBefore[i];
    if (id !== decidedId && !isReviewed(state.decisions.get(id))) return id;
  }
  return null;
}

export function getQueue(state: ReadState): QueueItem[] {
  const dataset = state.dataset;
  if (!dataset) return [];
  const items: QueueItem[] = [];
  for (const account of dataset.accounts) {
    const cleanup = cleanupFor(state, account.id);
    if (!cleanup) continue;
    if (cleanup.state === 'confirmed' || cleanup.state === 'uncertain') continue;
    const decision = state.decisions.get(account.id)!;
    items.push({ account, decision, cleanup, deferred: cleanup.state === 'skipped' });
  }
  items.sort((a, b) => {
    if (a.deferred !== b.deferred) return a.deferred ? 1 : -1;
    const aTime = a.cleanup.deferredAt ?? a.cleanup.queuedAt;
    const bTime = b.cleanup.deferredAt ?? b.cleanup.queuedAt;
    const byTime = aTime.localeCompare(bTime);
    return byTime || a.account.id.localeCompare(b.account.id, 'en');
  });
  return items;
}

export function getConfirmed(state: ReadState): QueueItem[] {
  const dataset = state.dataset;
  if (!dataset) return [];
  const items: QueueItem[] = [];
  for (const account of dataset.accounts) {
    const decision = state.decisions.get(account.id);
    const cleanup = state.cleanup.get(account.id);
    if (!decision || decision.choice !== 'unfollow' || !cleanup || cleanup.state !== 'confirmed') continue;
    items.push({ account, decision, cleanup, deferred: false });
  }
  items.sort((a, b) => (b.cleanup.confirmedAt ?? '').localeCompare(a.cleanup.confirmedAt ?? ''));
  return items;
}

export function getOther(state: ReadState): QueueItem[] {
  const dataset = state.dataset;
  if (!dataset) return [];
  const items: QueueItem[] = [];
  for (const account of dataset.accounts) {
    const decision = state.decisions.get(account.id);
    const cleanup = state.cleanup.get(account.id);
    if (!decision || decision.choice !== 'unfollow' || !cleanup) continue;
    if (cleanup.state !== 'uncertain' && cleanup.state !== 'skipped') continue;
    items.push({ account, decision, cleanup, deferred: cleanup.state === 'skipped' });
  }
  items.sort((a, b) => b.cleanup.updatedAt.localeCompare(a.cleanup.updatedAt));
  return items;
}

export function getMetrics(state: ReadState): Metrics | null {
  const dataset = state.dataset;
  if (!dataset) return null;
  const snapshot = dataset.snapshot;
  const index = accountIndex(dataset);
  const followerKnown = snapshot.followerData === 'present';
  const followers = snapshot.followerData === 'missing'
    ? null
    : followerKnown
      ? dataset.followers.length
      : dataset.followers.length || null;
  const accounts = dataset.accounts;

  let reviewed = 0;
  let planned = 0;
  let confirmedCurrent = 0;
  let uncertain = 0;
  let skipped = 0;
  let pendingQueue = 0;
  let mutuals = 0;
  let notFollowingBack = 0;

  for (const account of accounts) {
    const decision = state.decisions.get(account.id);
    if (isReviewed(decision)) reviewed++;
    if (followerKnown) {
      if (account.followsMe === true) mutuals++;
      if (account.followsMe === false) notFollowingBack++;
    }
    if (decision?.choice === 'unfollow') {
      planned++;
      const cleanup = cleanupFor(state, account.id);
      if (cleanup?.state === 'confirmed') confirmedCurrent++;
      else if (cleanup?.state === 'uncertain') uncertain++;
      else {
        pendingQueue++;
        if (cleanup?.state === 'skipped') skipped++;
      }
    }
  }

  const followersSet = followerSet(dataset);
  const fans = followerKnown ? [...followersSet].filter(id => !index.has(id)).length : null;
  const following = accounts.length;
  const ratio = followerKnown && followers !== null && following > 0 ? followers / following : null;
  const estimatedFollowing = Math.max(0, following - confirmedCurrent);
  const projectedFollowing = Math.max(0, estimatedFollowing - pendingQueue);
  const estimatedRatio = followerKnown && followers !== null && estimatedFollowing > 0 ? followers / estimatedFollowing : null;
  const projectedRatio = followerKnown && followers !== null && projectedFollowing > 0 ? followers / projectedFollowing : null;
  const parityRemaining = followerKnown && followers !== null ? Math.max(0, estimatedFollowing - followers) : null;
  const goalRemaining = state.settings.goal !== null ? Math.max(0, estimatedFollowing - state.settings.goal) : null;
  const cleanupTotal = confirmedCurrent + pendingQueue + uncertain;
  const confirmedArchived = state.history.confirmations.length;

  return {
    followers,
    following,
    ratio,
    mutuals: followerKnown ? mutuals : null,
    notFollowingBack: followerKnown ? notFollowingBack : null,
    fans,
    reviewed,
    unreviewed: Math.max(0, following - reviewed),
    planned,
    pendingQueue,
    confirmedCurrent,
    confirmedArchived,
    confirmedAllTime: confirmedCurrent + confirmedArchived,
    uncertain,
    skipped,
    estimatedFollowing,
    projectedFollowing,
    estimatedRatio,
    projectedRatio,
    parityRemaining,
    goalRemaining,
    reviewProgress: following > 0 ? reviewed / following : 0,
    cleanupProgress: cleanupTotal > 0 ? confirmedCurrent / cleanupTotal : 0,
    snapshot
  };
}

export function getCounts(state: ReadState): { following: number; unreviewed: number; queue: number; maybe: number; confirmed: number } {
  const metrics = getMetrics(state);
  if (!metrics || !state.dataset) return { following: 0, unreviewed: 0, queue: 0, maybe: 0, confirmed: 0 };
  let maybe = 0;
  for (const decision of state.decisions.values()) {
    if (decision.choice === 'maybe') maybe++;
  }
  return {
    following: metrics.following,
    unreviewed: metrics.unreviewed,
    queue: metrics.pendingQueue,
    maybe,
    confirmed: metrics.confirmedCurrent
  };
}

export interface Milestone {
  count: number;
  label: string;
}

export const MILESTONES = [50, 100, 250, 500, 1000, 1500] as const;

export function nextMilestone(reviewed: number, shown: number[]): Milestone | null {
  for (const count of MILESTONES) {
    if (reviewed >= count && !shown.includes(count)) return { count, label: `${count.toLocaleString()} reviewed` };
  }
  return null;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat().format(value);
}

export function formatRatio(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(2);
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value?: string): string {
  const date = parseDate(value);
  if (!date) return 'Unknown date';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(value?: string): string {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatSnapshotDate(snapshot: Snapshot): string {
  if (snapshot.exportedAt) return formatDate(snapshot.exportedAt);
  return `Imported ${formatDate(snapshot.importedAt)}`;
}

export function daysSince(value?: string): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

export function relativeAge(value?: string): string {
  const days = daysSince(value);
  if (days === null) return 'date unknown';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function relativeTime(value?: string | null): string {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function followAge(timestamp?: number): string {
  if (!timestamp) return 'Follow date not in export';
  const then = new Date(timestamp * 1000);
  const months = Math.max(0, Math.floor((Date.now() - then.getTime()) / (30.44 * 86_400_000)));
  if (months < 1) return 'Followed this month';
  if (months < 12) return `Followed ${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `Followed ${years} year${years === 1 ? '' : 's'} ago`;
  return `Followed ${years}y ${rem}m ago`;
}

export function followedOn(timestamp?: number): string {
  if (!timestamp) return 'Date not in export';
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(display: string): string {
  const parts = display.split(/[._\-\s]+/).filter(Boolean);
  const chars = parts.slice(0, 2).map(part => Array.from(part)[0] ?? '');
  const joined = chars.join('');
  return (joined || Array.from(display)[0] || '?').toUpperCase();
}

export function statusFor(state: ReadState, account: Account): { label: string; tone: string; detail?: string } {
  const decision = state.decisions.get(account.id);
  const cleanup = cleanupFor(state, account.id);
  if (decision?.choice === 'unfollow') {
    if (cleanup?.state === 'confirmed') return { label: 'Cut · confirmed', tone: 'confirmed', detail: 'You confirmed this unfollow manually.' };
    if (cleanup?.state === 'uncertain') return { label: 'Cut · uncertain', tone: 'uncertain', detail: 'Moved out of the active queue.' };
    if (cleanup?.state === 'skipped') return { label: 'Cut · deferred', tone: 'deferred', detail: 'Waiting at the back of the queue.' };
    if (cleanup?.state === 'profiled') return { label: 'Cut · profile opened', tone: 'queued', detail: 'Opening a profile is not a confirmation.' };
    return { label: 'Cut · in queue', tone: 'queued', detail: 'Marked for cleanup. Not unfollowed.' };
  }
  if (decision?.choice === 'keep') return { label: 'Kept', tone: 'keep' };
  if (decision?.choice === 'maybe') return { label: 'Maybe', tone: 'maybe' };
  if (decision?.favorite) return { label: 'Starred · unreviewed', tone: 'star' };
  return { label: 'Unreviewed', tone: 'new' };
}

export function followBackLabel(account: Account, snapshot: Snapshot): { label: string; tone: string } {
  if (snapshot.followerData === 'missing') return { label: 'Follow-back unknown', tone: 'unknown' };
  if (snapshot.followerData === 'incomplete') return { label: 'Follow-back unclear', tone: 'unknown' };
  if (account.followsMe === true) return { label: 'Mutual', tone: 'mutual' };
  if (account.followsMe === false) return { label: 'Not following back', tone: 'notback' };
  return { label: 'Follow-back unknown', tone: 'unknown' };
}

export function cleanupStateLabel(state: CleanupState): string {
  switch (state) {
    case 'queued':
      return 'In queue';
    case 'profiled':
      return 'Profile opened';
    case 'skipped':
      return 'Deferred';
    case 'uncertain':
      return 'Uncertain';
    case 'confirmed':
      return 'Confirmed';
  }
}

/** Count for a filter chip, respecting the current search but not the current filter. */
export function countForFilter(state: ReadState, filter: ReviewFilter): number {
  const dataset = state.dataset;
  if (!dataset) return 0;
  if ((filter === 'notBack' || filter === 'mutual') && dataset.snapshot.followerData !== 'present') return 0;
  const query = state.ui.query.trim().toLowerCase().replace(/^@/, '');
  return dataset.accounts.reduce((count, account) => {
    if (!matchesFilter(state, account, filter)) return count;
    if (query && !account.id.includes(query) && !account.display.toLowerCase().includes(query)) return count;
    return count + 1;
  }, 0);
}

export function filterCounts(state: ReadState): Record<ReviewFilter, number> {
  const filters: ReviewFilter[] = ['all', 'unreviewed', 'notBack', 'mutual', 'unfollow', 'maybe', 'keep', 'favorites', 'protected'];
  return Object.fromEntries(filters.map(filter => [filter, countForFilter(state, filter)])) as Record<ReviewFilter, number>;
}
