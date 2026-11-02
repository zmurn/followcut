import {
  DEFAULT_SETTINGS,
  DEFAULT_UI,
  EMPTY_HISTORY,
  STORAGE_PREFIX,
  type Cleanup,
  type Dataset,
  type DatasetCandidate,
  type Decision,
  type MergePreview,
  type Settings,
  type Theme,
  type UiState,
  type View
} from './types';
import {
  accountIndex,
  cleanupFor,
  currentAccount,
  defaultCleanup,
  getMetrics,
  isReviewed,
  MILESTONES,
  nextMilestone,
  nextUnreviewedAfter,
  orderedAccounts,
  orderedIds,
  showsReviewedState,
  type ReadState
} from './selectors';
import {
  buildBackup,
  parseBackup,
  sanitizeStoredDataset,
  sanitizeStoredSession,
  sanitizeStoredSettings,
  sanitizeStoredUi,
  type BackupData,
  type BackupFile
} from './backup';
import { buildDemoDataset } from './demo';

const KEYS = {
  dataset: `${STORAGE_PREFIX}dataset`,
  session: `${STORAGE_PREFIX}session`,
  settings: `${STORAGE_PREFIX}settings`,
  ui: `${STORAGE_PREFIX}ui`
} as const;

const WRAPPER_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type NoticeTone = 'info' | 'success' | 'warn' | 'error';

export interface Notice {
  id: number;
  tone: NoticeTone;
  message: string;
}

export interface UndoDecisionEntry {
  accountId: string;
  decisionBefore?: Decision;
  cleanupBefore?: Cleanup;
  cursorBefore: string | null;
}

export interface UndoCleanupEntry {
  accountId: string;
  decisionBefore?: Decision;
  cleanupBefore?: Cleanup;
  label: string;
}

export interface AppState extends ReadState {
  undo: UndoDecisionEntry[];
  cleanupUndo: UndoCleanupEntry[];
  storageWarning: string | null;
  notice: Notice | null;
  status: string;
}

export interface StoreOptions {
  storage?: StorageLike | null;
  now?: () => Date;
}

function cloneDecision(decision?: Decision): Decision | undefined {
  return decision ? { ...decision } : undefined;
}

function cloneCleanup(cleanup?: Cleanup): Cleanup | undefined {
  return cleanup ? { ...cleanup } : undefined;
}

function readJson(storage: StorageLike, key: string): unknown | null {
  try {
    const value = storage.getItem(key);
    if (!value) return null;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.v === WRAPPER_VERSION && 'dataset' in record) return record.dataset;
    if (record.v === WRAPPER_VERSION && 'decisions' in record) return record;
    if (record.v === WRAPPER_VERSION && 'settings' in record) return record.settings;
    if (record.v === WRAPPER_VERSION && 'view' in record) return record;
  }
  return null;
}

function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__followcut_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export class FollowCutStore {
  state: AppState;
  private listeners = new Set<() => void>();
  private storage: StorageLike | null;
  private now: () => Date;
  private noticeCounter = 0;

  constructor(options: StoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    const explicit = Object.prototype.hasOwnProperty.call(options, 'storage');
    this.storage = explicit ? (options.storage ?? null) : safeLocalStorage();
    this.state = {
      dataset: null,
      decisions: new Map(),
      cleanup: new Map(),
      profileOpens: new Map(),
      settings: { ...DEFAULT_SETTINGS },
      ui: { ...DEFAULT_UI },
      history: { ...EMPTY_HISTORY },
      undo: [],
      cleanupUndo: [],
      storageWarning: this.storage ? null : 'This browser is blocking local storage. FOLLOW/CUT still works, but your progress will disappear when you close the tab.',
      notice: null,
      status: ''
    };
    this.load();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private load(): void {
    if (!this.storage) return;
    let dataset: Dataset | null = null;
    try {
      const rawDataset = unwrap(readJson(this.storage, KEYS.dataset));
      if (rawDataset) dataset = sanitizeStoredDataset(rawDataset, this.now());
    } catch {
      this.state.storageWarning = 'Saved account data could not be read, so FOLLOW/CUT started clean. You can still restore a backup.';
      this.safeRemove(KEYS.dataset);
    }
    if (dataset) {
      this.state.dataset = dataset;
      try {
        const session = sanitizeStoredSession(unwrap(readJson(this.storage, KEYS.session)), dataset, this.now());
        this.state.decisions = session.decisions;
        this.state.cleanup = session.cleanup;
        this.state.profileOpens = session.profileOpens;
        this.state.history = session.history;
      } catch {
        this.state.storageWarning = 'Saved decisions could not be read, so the snapshot loaded with an empty review history.';
        this.safeRemove(KEYS.session);
      }
    }
    const settingsRaw = unwrap(readJson(this.storage, KEYS.settings));
    if (settingsRaw) this.state.settings = sanitizeStoredSettings(settingsRaw);
    const uiRaw = unwrap(readJson(this.storage, KEYS.ui));
    if (uiRaw) this.state.ui = sanitizeStoredUi(uiRaw, dataset);
    if (!dataset) this.state.ui.view = 'welcome';
  }

  private safeRemove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // Nothing useful to do.
    }
  }

  private write(key: string, value: unknown): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(key, JSON.stringify(value));
      if (this.state.storageWarning?.startsWith('Could not save')) this.state.storageWarning = null;
      return true;
    } catch {
      this.state.storageWarning = 'Could not save to this browser (storage may be full or blocked). Export a backup before closing the tab.';
      return false;
    }
  }

  private saveDataset(): void {
    if (!this.state.dataset) {
      this.safeRemove(KEYS.dataset);
      return;
    }
    this.write(KEYS.dataset, { v: WRAPPER_VERSION, dataset: this.state.dataset });
  }

  private saveSession(): void {
    this.write(KEYS.session, {
      v: WRAPPER_VERSION,
      decisions: [...this.state.decisions.entries()],
      cleanup: [...this.state.cleanup.entries()],
      profileOpens: [...this.state.profileOpens.entries()],
      history: this.state.history
    });
  }

  private saveSettings(): void {
    this.write(KEYS.settings, { v: WRAPPER_VERSION, settings: this.state.settings });
  }

  private saveUi(): void {
    this.state.ui.lastActiveAt = this.nowIso();
    this.write(KEYS.ui, { v: WRAPPER_VERSION, ...this.state.ui });
  }

  /** Flush the state that can change without a decision (cursor, filters, notes). */
  flush(): void {
    if (!this.state.dataset) return;
    this.saveSession();
    this.saveUi();
  }

  private saveAll(): void {
    this.saveDataset();
    this.saveSession();
    this.saveSettings();
    this.saveUi();
  }

  clearNotice(id?: number): void {
    if (!this.state.notice) return;
    if (id !== undefined && this.state.notice.id !== id) return;
    this.state.notice = null;
    this.emit();
  }

  setNotice(tone: NoticeTone, message: string): void {
    this.state.notice = { id: ++this.noticeCounter, tone, message };
    this.emit();
  }

  dismissStorageWarning(): void {
    this.state.storageWarning = null;
    this.emit();
  }

  announce(message: string): void {
    this.state.status = message;
    this.emit();
  }

  setView(view: View): void {
    if (this.state.ui.view === view) return;
    this.state.ui.view = view;
    this.saveUi();
    this.emit();
  }

  setTheme(theme: Theme): void {
    this.state.settings.theme = theme;
    this.saveSettings();
    this.emit();
  }

  setMotion(motion: Settings['motion']): void {
    this.state.settings.motion = motion;
    this.saveSettings();
    this.emit();
  }

  setGoal(goal: number | null): void {
    let next: number | null = null;
    if (goal !== null && Number.isFinite(goal)) next = Math.max(0, Math.min(1_000_000, Math.round(goal)));
    this.state.settings.goal = next;
    this.saveSettings();
    this.emit();
  }

  setProfileOpen(mode: Settings['profileOpen']): void {
    this.state.settings.profileOpen = mode === 'preview' ? 'preview' : 'tab';
    this.saveSettings();
    this.emit();
  }

  private ensureCursor(): void {
    const list = orderedAccounts(this.state);
    const cursor = this.state.ui.cursorId;
    if (cursor && list.some(account => account.id === cursor)) return;
    const firstUnreviewed = list.find(account => !isReviewed(this.state.decisions.get(account.id)));
    this.state.ui.cursorId = firstUnreviewed?.id
      ?? (showsReviewedState(this.state.ui.filter) ? list[0]?.id ?? null : null);
  }

  setFilter(filter: UiState['filter']): void {
    if ((filter === 'notBack' || filter === 'mutual') && this.state.dataset?.snapshot.followerData !== 'present') return;
    this.state.ui.filter = filter;
    this.state.ui.query = '';
    this.ensureCursor();
    this.saveUi();
    this.emit();
  }

  setSort(sort: UiState['sort']): void {
    this.state.ui.sort = sort;
    this.ensureCursor();
    this.saveUi();
    this.emit();
  }

  setQuery(query: string): void {
    this.state.ui.query = query.slice(0, 100);
    this.ensureCursor();
    this.saveUi();
    this.emit();
  }

  setCleanupTab(tab: UiState['cleanupTab']): void {
    this.state.ui.cleanupTab = tab;
    this.saveUi();
    this.emit();
  }

  setCleanupMode(mode: UiState['cleanupMode']): void {
    this.state.ui.cleanupMode = mode;
    this.saveUi();
    this.emit();
  }

  goTo(accountId: string): void {
    const account = accountIndex(this.state.dataset).get(accountId);
    if (!account) return;
    this.state.ui.cursorId = accountId;
    this.saveUi();
    this.emit();
  }

  back(): void {
    const list = orderedAccounts(this.state);
    if (list.length === 0) return;
    const current = currentAccount(this.state);
    const index = current ? list.findIndex(a => a.id === current.id) : -1;
    const target = index < 0 ? list.length - 1 : Math.max(0, index - 1);
    this.state.ui.cursorId = list[target].id;
    this.announce(`Showing @${list[target].display}. No decision changed.`);
    this.saveUi();
  }

  next(): void {
    const list = orderedAccounts(this.state);
    if (list.length === 0) return;
    const current = currentAccount(this.state);
    const index = current ? list.findIndex(a => a.id === current.id) : -1;
    const target = index < 0 ? 0 : Math.min(list.length - 1, index + 1);
    this.state.ui.cursorId = list[target].id;
    this.announce(`Showing @${list[target].display}. No decision changed.`);
    this.saveUi();
  }

  importDataset(candidate: DatasetCandidate): void {
    const dataset: Dataset = {
      snapshot: {
        ...candidate.snapshot,
        followingCount: candidate.accounts.length,
        followerCount: candidate.snapshot.followerData === 'missing' ? undefined : candidate.followers.length,
        pendingCount: candidate.pending.length || undefined,
        warnings: [...candidate.warnings]
      },
      accounts: candidate.accounts,
      followers: candidate.followers,
      pending: candidate.pending
    };
    this.state.dataset = dataset;
    this.state.decisions = new Map();
    this.state.cleanup = new Map();
    this.state.profileOpens = new Map();
    this.state.history = { confirmations: [], snapshots: [] };
    this.state.undo = [];
    this.state.cleanupUndo = [];
    this.state.ui = { ...DEFAULT_UI, view: this.state.ui.view, cursorId: null, filter: 'all', sort: 'oldest', query: '' };
    this.state.status = `Imported ${dataset.accounts.length.toLocaleString()} following accounts.`;
    this.saveAll();
    this.emit();
  }

  loadDemo(): void {
    const dataset = buildDemoDataset(this.now());
    this.state.dataset = dataset;
    this.state.decisions = new Map();
    this.state.cleanup = new Map();
    this.state.profileOpens = new Map();
    this.state.history = { confirmations: [], snapshots: [] };
    this.state.undo = [];
    this.state.cleanupUndo = [];
    this.state.ui = { ...DEFAULT_UI, view: this.state.ui.view, cursorId: null, filter: 'all', sort: 'oldest', query: '' };
    this.state.status = 'Demo deck loaded. These accounts are fictional.';
    this.saveAll();
    this.emit();
  }

  previewMerge(next: Dataset | DatasetCandidate): MergePreview {
    const old = this.state.dataset;
    const nextDataset: Dataset = 'accounts' in next
      ? (next as Dataset)
      : {
          snapshot: (next as DatasetCandidate).snapshot,
          accounts: (next as DatasetCandidate).accounts,
          followers: (next as DatasetCandidate).followers,
          pending: (next as DatasetCandidate).pending
        };
    if (!old) {
      return {
        oldFollowing: 0,
        newFollowing: nextDataset.accounts.length,
        added: nextDataset.accounts.length,
        removed: 0,
        decisionsPreserved: 0,
        decisionsDropped: 0,
        confirmationsPreserved: 0,
        confirmationsArchived: 0,
        oldExportedAt: undefined,
        newExportedAt: nextDataset.snapshot.exportedAt,
        warnings: []
      };
    }
    const oldIds = new Set(old.accounts.map(a => a.id));
    const newIds = new Set(nextDataset.accounts.map(a => a.id));
    let added = 0;
    let removed = 0;
    for (const id of newIds) if (!oldIds.has(id)) added++;
    for (const id of oldIds) if (!newIds.has(id)) removed++;
    let decisionsPreserved = 0;
    let decisionsDropped = 0;
    for (const id of this.state.decisions.keys()) {
      if (newIds.has(id)) decisionsPreserved++;
      else decisionsDropped++;
    }
    let confirmationsPreserved = 0;
    let confirmationsArchived = 0;
    for (const [id, cleanup] of this.state.cleanup) {
      if (cleanup.state !== 'confirmed') continue;
      if (newIds.has(id)) confirmationsPreserved++;
      else confirmationsArchived++;
    }
    const warnings: string[] = [];
    if (removed > 0) {
      warnings.push(`${removed.toLocaleString()} account${removed === 1 ? '' : 's'} from your current snapshot ${removed === 1 ? 'is' : 'are'} not in the new one. Matching is exact: a changed username looks like one removal and one addition, and its decisions are not transferred.`);
    }
    if (nextDataset.snapshot.followerData !== 'present' && old.snapshot.followerData === 'present') {
      warnings.push('The new export has no usable follower list. Follow-back labels will turn off.');
    }
    if (old.snapshot.exportedAt && nextDataset.snapshot.exportedAt && nextDataset.snapshot.exportedAt < old.snapshot.exportedAt) {
      warnings.push('The new snapshot is dated earlier than the current one. Check that you chose the newest export.');
    }
    if (confirmationsArchived > 0) {
      warnings.push(`${confirmationsArchived} manual confirmation${confirmationsArchived === 1 ? '' : 's'} will be archived because those accounts are no longer in your following list.`);
    }
    return {
      oldFollowing: old.accounts.length,
      newFollowing: nextDataset.accounts.length,
      added,
      removed,
      decisionsPreserved,
      decisionsDropped,
      confirmationsPreserved,
      confirmationsArchived,
      oldExportedAt: old.snapshot.exportedAt,
      newExportedAt: nextDataset.snapshot.exportedAt,
      warnings
    };
  }

  mergeDataset(candidate: DatasetCandidate): MergePreview {
    const preview = this.previewMerge(candidate);
    const old = this.state.dataset;
    if (!old) {
      this.importDataset(candidate);
      return preview;
    }
    const newIds = new Set(candidate.accounts.map(a => a.id));
    const newDecisions = new Map<string, Decision>();
    for (const [id, decision] of this.state.decisions) {
      if (newIds.has(id)) newDecisions.set(id, decision);
    }
    const newCleanup = new Map<string, Cleanup>();
    const archived = [...this.state.history.confirmations];
    for (const [id, cleanup] of this.state.cleanup) {
      if (newIds.has(id)) {
        newCleanup.set(id, cleanup);
      } else if (cleanup.state === 'confirmed') {
        const account = old.accounts.find(a => a.id === id);
        if (account) {
          archived.push({ username: account.username, confirmedAt: cleanup.confirmedAt ?? cleanup.updatedAt, snapshotId: old.snapshot.id });
        }
      }
    }
    const profileOpens = new Map<string, string>();
    for (const [id, when] of this.state.profileOpens) {
      if (newIds.has(id)) profileOpens.set(id, when);
    }
    for (const [id, cleanup] of newCleanup) {
      if (cleanup.state !== 'confirmed') continue;
      if (newDecisions.get(id)?.choice !== 'unfollow') newCleanup.delete(id);
    }
    const confirmedAtImport = [...this.state.cleanup.values()].filter(c => c.state === 'confirmed').length;
    const snapshots = [
      {
        id: old.snapshot.id,
        importedAt: old.snapshot.importedAt,
        exportedAt: old.snapshot.exportedAt,
        followingCount: old.accounts.length,
        followerCount: old.snapshot.followerCount,
        confirmedCount: confirmedAtImport
      },
      ...this.state.history.snapshots
    ].slice(0, 10);
    this.state.dataset = {
      snapshot: {
        ...candidate.snapshot,
        followingCount: candidate.accounts.length,
        followerCount: candidate.snapshot.followerData === 'missing' ? undefined : candidate.followers.length,
        pendingCount: candidate.pending.length || undefined,
        warnings: [...candidate.warnings]
      },
      accounts: candidate.accounts,
      followers: candidate.followers,
      pending: candidate.pending
    };
    this.state.decisions = newDecisions;
    this.state.cleanup = newCleanup;
    this.state.profileOpens = profileOpens;
    this.state.history = { confirmations: archived.slice(-20_000), snapshots };
    this.state.ui.cursorId = null;
    this.state.ui.query = '';
    this.state.ui.filter = this.state.ui.filter === 'notBack' || this.state.ui.filter === 'mutual'
      ? (candidate.snapshot.followerData === 'present' ? this.state.ui.filter : 'all')
      : this.state.ui.filter;
    this.state.undo = [];
    this.state.cleanupUndo = [];
    this.ensureCursor();
    this.state.status = `Snapshot replaced. ${preview.decisionsPreserved.toLocaleString()} decisions kept.`;
    this.saveAll();
    this.emit();
    return preview;
  }

  decide(accountId: string, choice: Exclude<Decision['choice'], 'undecided'>): void {
    if (!this.state.dataset) return;
    const account = accountIndex(this.state.dataset).get(accountId);
    if (!account) return;
    const orderBefore = orderedIds(this.state);
    const before = this.state.decisions.get(accountId);
    const cleanupBefore = this.state.cleanup.get(accountId);
    const hadConfirmed = cleanupBefore?.state === 'confirmed';
    const nowIso = this.nowIso();
    const nextDecision: Decision = {
      choice,
      favorite: before?.favorite ?? false,
      protected: before?.protected ?? false,
      updatedAt: nowIso,
      reviewedAt: nowIso
    };
    if (before?.notes) nextDecision.notes = before.notes;
    this.state.decisions.set(accountId, nextDecision);
    if (choice === 'unfollow') {
      const existingCleanup = this.state.cleanup.get(accountId);
      if (!existingCleanup) {
        this.state.cleanup.set(accountId, defaultCleanup(nowIso));
      } else if (existingCleanup.state === 'uncertain' || existingCleanup.state === 'skipped') {
        // Re-cutting an account that was parked should put it back in the active queue.
        existingCleanup.state = 'queued';
        delete existingCleanup.deferredAt;
        existingCleanup.updatedAt = nowIso;
      }
    } else {
      this.state.cleanup.delete(accountId);
    }
    this.state.undo.push({ accountId, decisionBefore: cloneDecision(before), cleanupBefore: cloneCleanup(cleanupBefore), cursorBefore: this.state.ui.cursorId });
    if (this.state.undo.length > 40) this.state.undo.shift();
    const nextId = nextUnreviewedAfter(this.state, accountId, orderBefore);
    this.state.ui.cursorId = nextId;
    const metrics = getMetrics(this.state);
    const reviewed = metrics?.reviewed ?? 0;
    const milestone = nextMilestone(reviewed, this.state.ui.milestonesShown);
    if (milestone) {
      this.state.ui.milestonesShown = [...new Set([...this.state.ui.milestonesShown, ...MILESTONES.filter(n => n <= reviewed)])];
      this.setNotice('success', `${milestone.label}. Progress saves after every card.`);
    }
    const verb = choice === 'unfollow' ? 'marked for cut' : choice === 'keep' ? 'kept' : 'put in Maybe';
    this.state.status = `@${account.display} ${verb}. ${reviewed.toLocaleString()} reviewed.${choice === 'unfollow' ? ' Cut does not unfollow.' : ''}`;
    if (hadConfirmed) this.state.notice = { id: ++this.noticeCounter, tone: 'warn', message: `Manual confirmation cleared for @${account.display}.` };
    this.saveSession();
    this.saveUi();
    this.emit();
  }

  undoDecision(): void {
    let entry = this.state.undo.pop();
    while (entry && !accountIndex(this.state.dataset).has(entry.accountId)) entry = this.state.undo.pop();
    if (!entry) {
      this.setNotice('info', 'Nothing to undo in this session.');
      return;
    }
    const account = accountIndex(this.state.dataset).get(entry.accountId)!;
    const wasConfirmed = this.state.cleanup.get(entry.accountId)?.state === 'confirmed';
    if (entry.decisionBefore) this.state.decisions.set(entry.accountId, entry.decisionBefore);
    else this.state.decisions.delete(entry.accountId);
    if (entry.cleanupBefore) this.state.cleanup.set(entry.accountId, entry.cleanupBefore);
    else this.state.cleanup.delete(entry.accountId);
    this.state.ui.cursorId = entry.accountId;
    this.state.status = `Undone. @${account.display} is back at the same spot.${wasConfirmed ? ' The manual confirmation was also reverted.' : ''}`;
    this.setNotice('info', `Undone: @${account.display}.${wasConfirmed ? ' Manual confirmation reverted.' : ''}`);
    this.saveSession();
    this.saveUi();
    this.emit();
  }

  private ensureDecision(accountId: string): Decision {
    const existing = this.state.decisions.get(accountId);
    if (existing) return existing;
    const decision: Decision = { choice: 'undecided', favorite: false, protected: false, updatedAt: this.nowIso() };
    this.state.decisions.set(accountId, decision);
    return decision;
  }

  toggleFavorite(accountId: string): void {
    const account = accountIndex(this.state.dataset).get(accountId);
    if (!account) return;
    const decision = this.ensureDecision(accountId);
    decision.favorite = !decision.favorite;
    decision.updatedAt = this.nowIso();
    this.state.status = decision.favorite ? `Starred @${account.display}.` : `Removed star from @${account.display}.`;
    this.saveSession();
    this.emit();
  }

  toggleProtected(accountId: string): void {
    const account = accountIndex(this.state.dataset).get(accountId);
    if (!account) return;
    const decision = this.ensureDecision(accountId);
    decision.protected = !decision.protected;
    decision.updatedAt = this.nowIso();
    this.state.status = decision.protected ? `Locked @${account.display} against bulk operations.` : `Unlocked @${account.display}.`;
    this.saveSession();
    this.emit();
  }

  setNote(accountId: string, note: string): void {
    const decision = this.ensureDecision(accountId);
    const trimmed = note.slice(0, 1000);
    if (trimmed.trim()) decision.notes = trimmed;
    else delete decision.notes;
    decision.updatedAt = this.nowIso();
    this.saveSession();
    this.emit();
  }

  markProfileOpened(accountId: string): void {
    if (!accountIndex(this.state.dataset).has(accountId)) return;
    const nowIso = this.nowIso();
    this.state.profileOpens.set(accountId, nowIso);
    const cleanup = this.state.cleanup.get(accountId);
    if (cleanup && (cleanup.state === 'queued' || cleanup.state === 'skipped')) {
      cleanup.state = 'profiled';
      cleanup.profileOpenedAt = nowIso;
      cleanup.updatedAt = nowIso;
    } else if (cleanup) {
      cleanup.profileOpenedAt = nowIso;
      cleanup.updatedAt = nowIso;
    }
    this.state.status = 'Profile opened in a new tab. Opening is not a confirmation.';
    this.saveSession();
    this.emit();
  }

  private pushCleanupUndo(accountId: string, label: string): void {
    this.state.cleanupUndo.push({
      accountId,
      decisionBefore: cloneDecision(this.state.decisions.get(accountId)),
      cleanupBefore: cloneCleanup(this.state.cleanup.get(accountId)),
      label
    });
    if (this.state.cleanupUndo.length > 30) this.state.cleanupUndo.shift();
  }

  private cleanupForAction(accountId: string): Cleanup | null {
    const decision = this.state.decisions.get(accountId);
    if (!decision || decision.choice !== 'unfollow') return null;
    let cleanup = this.state.cleanup.get(accountId);
    if (!cleanup) {
      cleanup = defaultCleanup(decision.updatedAt);
      this.state.cleanup.set(accountId, cleanup);
    }
    return cleanup;
  }

  confirmUnfollow(accountId: string): void {
    const account = accountIndex(this.state.dataset).get(accountId);
    const cleanup = this.cleanupForAction(accountId);
    if (!account || !cleanup) return;
    if (cleanup.state === 'confirmed') return;
    this.pushCleanupUndo(accountId, 'confirm');
    const nowIso = this.nowIso();
    cleanup.state = 'confirmed';
    cleanup.confirmedAt = nowIso;
    cleanup.updatedAt = nowIso;
    this.state.status = `Confirmed manually: @${account.display}. This is your record, not live Instagram state.`;
    this.saveSession();
    this.emit();
  }

  skipAccount(accountId: string): void {
    const cleanup = this.cleanupForAction(accountId);
    if (!cleanup) return;
    this.pushCleanupUndo(accountId, 'skip');
    const nowIso = this.nowIso();
    cleanup.state = 'skipped';
    cleanup.deferredAt = nowIso;
    cleanup.updatedAt = nowIso;
    this.state.status = 'Deferred to the back of the queue. It stays in cleanup.';
    this.saveSession();
    this.emit();
  }

  markUncertain(accountId: string): void {
    const cleanup = this.cleanupForAction(accountId);
    if (!cleanup) return;
    this.pushCleanupUndo(accountId, 'uncertain');
    const nowIso = this.nowIso();
    cleanup.state = 'uncertain';
    cleanup.updatedAt = nowIso;
    this.state.status = 'Moved to Skipped / uncertain. It is out of the active queue.';
    this.saveSession();
    this.emit();
  }

  actuallyKeep(accountId: string): void {
    const account = accountIndex(this.state.dataset).get(accountId);
    const decision = this.state.decisions.get(accountId);
    if (!account || !decision) return;
    this.pushCleanupUndo(accountId, 'keep');
    decision.choice = 'keep';
    decision.reviewedAt = this.nowIso();
    decision.updatedAt = this.nowIso();
    this.state.cleanup.delete(accountId);
    this.state.status = `@${account.display} is now kept and out of the cleanup queue.`;
    this.saveSession();
    this.emit();
  }

  requeue(accountId: string): void {
    const cleanup = this.state.cleanup.get(accountId);
    if (!cleanup) return;
    this.pushCleanupUndo(accountId, 'requeue');
    cleanup.state = 'queued';
    delete cleanup.confirmedAt;
    delete cleanup.deferredAt;
    cleanup.updatedAt = this.nowIso();
    this.state.status = 'Moved back to the active queue.';
    this.saveSession();
    this.emit();
  }

  undoConfirmation(accountId: string): void {
    const cleanup = this.state.cleanup.get(accountId);
    if (!cleanup || cleanup.state !== 'confirmed') return;
    this.pushCleanupUndo(accountId, 'undo-confirm');
    cleanup.state = 'queued';
    delete cleanup.confirmedAt;
    cleanup.updatedAt = this.nowIso();
    this.state.status = 'Confirmation undone. The account is back in the queue.';
    this.saveSession();
    this.emit();
  }

  undoCleanup(): void {
    let entry = this.state.cleanupUndo.pop();
    while (entry && !accountIndex(this.state.dataset).has(entry.accountId)) entry = this.state.cleanupUndo.pop();
    if (!entry) {
      this.setNotice('info', 'No cleanup action to undo.');
      return;
    }
    if (entry.decisionBefore) this.state.decisions.set(entry.accountId, entry.decisionBefore);
    else this.state.decisions.delete(entry.accountId);
    if (entry.cleanupBefore) this.state.cleanup.set(entry.accountId, entry.cleanupBefore);
    else this.state.cleanup.delete(entry.accountId);
    this.state.status = 'Cleanup action undone.';
    this.setNotice('info', 'Cleanup action undone.');
    this.saveSession();
    this.emit();
  }

  exportBackup(): BackupFile {
    if (!this.state.dataset) throw new Error('There is no session to back up.');
    return buildBackup({
      dataset: this.state.dataset,
      decisions: this.state.decisions,
      cleanup: this.state.cleanup,
      profileOpens: this.state.profileOpens,
      settings: this.state.settings,
      ui: this.state.ui,
      history: this.state.history
    });
  }

  restoreBackupText(text: string): BackupData {
    const data = parseBackup(text, this.now());
    this.state.dataset = data.dataset;
    this.state.decisions = data.decisions;
    this.state.cleanup = data.cleanup;
    this.state.profileOpens = data.profileOpens;
    this.state.settings = data.settings;
    this.state.ui = { ...data.ui, view: data.ui.view === 'welcome' ? 'dashboard' : data.ui.view };
    this.state.history = data.history;
    this.state.undo = [];
    this.state.cleanupUndo = [];
    this.ensureCursor();
    const metrics = getMetrics(this.state);
    if (metrics) {
      this.state.ui.milestonesShown = [...new Set([...this.state.ui.milestonesShown, ...MILESTONES.filter(n => n <= metrics.reviewed)])];
    }
    this.state.status = 'Session restored from backup.';
    this.saveAll();
    this.emit();
    return data;
  }

  /** Apply the phone's latest session without changing this computer's view or theme. */
  applyRemoteBackup(text: string): boolean {
    const data = parseBackup(text, this.now());
    const localView = this.state.ui.view;
    const localFilter = this.state.ui.filter;
    const localSort = this.state.ui.sort;
    const localQuery = this.state.ui.query;
    this.state.dataset = data.dataset;
    this.state.decisions = data.decisions;
    this.state.cleanup = data.cleanup;
    this.state.profileOpens = data.profileOpens;
    this.state.history = data.history;
    this.state.undo = [];
    this.state.cleanupUndo = [];
    this.state.ui = {
      ...this.state.ui,
      view: localView,
      filter: localFilter,
      sort: localSort,
      query: localQuery,
      cursorId: data.ui.cursorId
    };
    this.ensureCursor();
    this.state.status = 'Phone synced.';
    this.saveAll();
    this.emit();
    return true;
  }

  clearSession(): void {
    this.state.dataset = null;
    this.state.decisions = new Map();
    this.state.cleanup = new Map();
    this.state.profileOpens = new Map();
    this.state.history = { confirmations: [], snapshots: [] };
    this.state.undo = [];
    this.state.cleanupUndo = [];
    this.state.ui = { ...DEFAULT_UI, view: 'welcome' };
    this.state.settings = { ...this.state.settings, goal: null };
    this.state.status = 'Local session cleared.';
    this.state.notice = { id: ++this.noticeCounter, tone: 'success', message: 'Local session cleared. Nothing was sent anywhere.' };
    this.safeRemove(KEYS.dataset);
    this.safeRemove(KEYS.session);
    this.saveSettings();
    this.saveUi();
    this.emit();
  }

  storageBytes(): number {
    if (!this.storage) return 0;
    let total = 0;
    for (const key of Object.values(KEYS)) {
      try {
        total += (this.storage.getItem(key) ?? '').length * 2;
      } catch {
        // ignore
      }
    }
    return total;
  }

  savedDecisions(): number {
    let count = 0;
    for (const id of this.state.decisions.keys()) {
      if (accountIndex(this.state.dataset).has(id)) count++;
    }
    return count;
  }
}

export const store = new FollowCutStore();
