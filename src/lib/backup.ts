import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_UI,
  type Account,
  type ArchivedConfirmation,
  type Cleanup,
  type CleanupState,
  type Choice,
  type Dataset,
  type Decision,
  type History,
  type Settings,
  type Snapshot,
  type SnapshotHistoryItem,
  type UiState
} from './types';
import { buildProfileUrl, normalizeTimestamp, normalizeUsername } from './parse';

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface BackupData {
  dataset: Dataset;
  decisions: Map<string, Decision>;
  cleanup: Map<string, Cleanup>;
  profileOpens: Map<string, string>;
  settings: Settings;
  ui: UiState;
  history: History;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  app: string;
  exportedAt: string;
  data: {
    dataset: Dataset;
    decisions: [string, Decision][];
    cleanup: [string, Cleanup][];
    profileOpens: [string, string][];
    settings: Settings;
    ui: UiState;
    history: History;
  };
}

const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const MAX_ACCOUNTS = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isoOr(value: unknown, fallback: string): string {
  return isIso(value) ? value : fallback;
}

function str(value: unknown, max = 200): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function cleanDisplay(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/^@+/, '').slice(0, 80);
  return trimmed || fallback;
}

function isChoice(value: unknown): value is Choice {
  return value === 'undecided' || value === 'keep' || value === 'unfollow' || value === 'maybe';
}

const CLEANUP_STATES: CleanupState[] = ['queued', 'profiled', 'skipped', 'uncertain', 'confirmed'];

function isCleanupState(value: unknown): value is CleanupState {
  return typeof value === 'string' && (CLEANUP_STATES as string[]).includes(value);
}

/** Rebuild a dataset from untrusted storage/backup input, failing closed. */
export function sanitizeDataset(raw: unknown, now = new Date()): Dataset {
  if (!isRecord(raw)) throw new BackupError('The session has no valid dataset.');
  const accountsRaw = Array.isArray(raw.accounts) ? raw.accounts : [];
  if (accountsRaw.length === 0) throw new BackupError('The saved dataset has no following accounts.');
  if (accountsRaw.length > MAX_ACCOUNTS) throw new BackupError('The saved dataset is larger than the safety limit.');

  const accounts: Account[] = [];
  const seen = new Set<string>();
  for (const item of accountsRaw) {
    if (!isRecord(item)) continue;
    const normalized = normalizeUsername(typeof item.username === 'string' ? item.username : typeof item.id === 'string' ? item.id : '');
    if (!normalized) continue;
    const id = normalized.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const account: Account = {
      id,
      username: id,
      display: cleanDisplay(typeof item.display === 'string' ? item.display : normalized, normalized),
      profileUrl: buildProfileUrl(id)
    };
    const timestamp = normalizeTimestamp(item.followedAt, now.getTime());
    if (timestamp) account.followedAt = timestamp;
    accounts.push(account);
  }
  if (accounts.length === 0) throw new BackupError('The saved dataset has no usable account records.');
  accounts.sort((a, b) => a.id.localeCompare(b.id, 'en'));

  const followers: string[] = [];
  const followerSeen = new Set<string>();
  if (Array.isArray(raw.followers)) {
    for (const value of raw.followers) {
      if (value === null || value === undefined) continue;
      const normalized = normalizeUsername(String(value));
      if (!normalized) continue;
      const id = normalized.toLowerCase();
      if (followerSeen.has(id)) continue;
      followerSeen.add(id);
      followers.push(id);
    }
  }
  followers.sort((a, b) => a.localeCompare(b, 'en'));

  const pending: string[] = [];
  const pendingSeen = new Set<string>();
  if (Array.isArray(raw.pending)) {
    for (const value of raw.pending) {
      if (value === null || value === undefined) continue;
      const normalized = normalizeUsername(String(value));
      if (!normalized) continue;
      const id = normalized.toLowerCase();
      if (pendingSeen.has(id)) continue;
      pendingSeen.add(id);
      pending.push(id);
    }
  }
  pending.sort((a, b) => a.localeCompare(b, 'en'));

  const rawSnapshot = isRecord(raw.snapshot) ? raw.snapshot : {};
  const rawFollowerData = rawSnapshot.followerData;
  let followerData: Snapshot['followerData'];
  if (rawFollowerData === 'incomplete' && followers.length > 0) followerData = 'incomplete';
  else if (followers.length > 0) followerData = 'present';
  else if (rawFollowerData === 'incomplete') followerData = 'incomplete';
  else followerData = 'missing';

  for (const account of accounts) {
    if (followerData === 'present') account.followsMe = followerSeen.has(account.id);
  }

  const warnings = Array.isArray(rawSnapshot.warnings)
    ? rawSnapshot.warnings.filter((w): w is string => typeof w === 'string').slice(0, 100).map(w => w.slice(0, 300))
    : [];

  const snapshot: Snapshot = {
    id: str(rawSnapshot.id, 100) ?? `snap_restored_${now.getTime().toString(36)}`,
    importedAt: isoOr(rawSnapshot.importedAt, now.toISOString()),
    exportedAt: isIso(rawSnapshot.exportedAt) ? rawSnapshot.exportedAt : undefined,
    exportDateSource: rawSnapshot.exportDateSource === 'filename' ? 'filename' : 'unknown',
    sourceLabel: str(rawSnapshot.sourceLabel, 120),
    followingCount: accounts.length,
    followerCount: followerData === 'missing' ? undefined : followers.length,
    followerData,
    pendingCount: pending.length || undefined,
    duplicateCount: typeof rawSnapshot.duplicateCount === 'number' ? rawSnapshot.duplicateCount : undefined,
    invalidCount: typeof rawSnapshot.invalidCount === 'number' ? rawSnapshot.invalidCount : undefined,
    warnings,
    demo: rawSnapshot.demo === true
  };

  return { snapshot, accounts, followers, pending };
}

function pairsFrom(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is unknown[] => Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string')
      .map(entry => [entry[0] as string, entry[1]]);
  }
  if (isRecord(value)) return Object.entries(value);
  return [];
}

function sanitizeDecision(raw: unknown, nowIso: string): Decision | null {
  if (!isRecord(raw) || !isChoice(raw.choice)) return null;
  const updatedAt = isoOr(raw.updatedAt, nowIso);
  const reviewedAt = isIso(raw.reviewedAt) ? raw.reviewedAt : raw.choice !== 'undecided' ? updatedAt : undefined;
  const notes = typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : undefined;
  const decision: Decision = {
    choice: raw.choice,
    favorite: raw.favorite === true,
    protected: raw.protected === true,
    reviewedAt,
    updatedAt
  };
  if (notes) decision.notes = notes;
  return decision;
}

function sanitizeCleanup(raw: unknown, decision: Decision, nowIso: string): Cleanup | null {
  if (!isRecord(raw) || !isCleanupState(raw.state)) return null;
  if (decision.choice !== 'unfollow') return null;
  const updatedAt = isoOr(raw.updatedAt, decision.updatedAt || nowIso);
  const cleanup: Cleanup = {
    state: raw.state,
    queuedAt: isoOr(raw.queuedAt, decision.updatedAt || nowIso),
    updatedAt
  };
  if (isIso(raw.profileOpenedAt)) cleanup.profileOpenedAt = raw.profileOpenedAt;
  if (isIso(raw.confirmedAt)) cleanup.confirmedAt = raw.confirmedAt;
  if (isIso(raw.deferredAt)) cleanup.deferredAt = raw.deferredAt;
  if (cleanup.state === 'confirmed') cleanup.confirmedAt = cleanup.confirmedAt ?? updatedAt;
  if (cleanup.state === 'profiled') cleanup.profileOpenedAt = cleanup.profileOpenedAt ?? updatedAt;
  if (cleanup.state === 'skipped') cleanup.deferredAt = cleanup.deferredAt ?? updatedAt;
  return cleanup;
}

function sanitizeHistory(raw: unknown, nowIso: string): History {
  if (!isRecord(raw)) return { confirmations: [], snapshots: [] };
  const confirmations: ArchivedConfirmation[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.confirmations)) {
    for (const item of raw.confirmations) {
      if (!isRecord(item)) continue;
      const normalized = normalizeUsername(typeof item.username === 'string' ? item.username : '');
      if (!normalized) continue;
      const confirmedAt = isoOr(item.confirmedAt, nowIso);
      const snapshotId = str(item.snapshotId, 100) ?? 'unknown';
      const key = `${normalized.toLowerCase()}|${confirmedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      confirmations.push({ username: normalized, confirmedAt, snapshotId });
      if (confirmations.length >= 20_000) break;
    }
  }
  const snapshots: SnapshotHistoryItem[] = [];
  if (Array.isArray(raw.snapshots)) {
    for (const item of raw.snapshots.slice(0, 10)) {
      if (!isRecord(item)) continue;
      snapshots.push({
        id: str(item.id, 100) ?? 'snapshot',
        importedAt: isoOr(item.importedAt, nowIso),
        exportedAt: isIso(item.exportedAt) ? item.exportedAt : undefined,
        followingCount: typeof item.followingCount === 'number' ? item.followingCount : 0,
        followerCount: typeof item.followerCount === 'number' ? item.followerCount : undefined,
        confirmedCount: typeof item.confirmedCount === 'number' ? item.confirmedCount : 0
      });
    }
  }
  return { confirmations, snapshots };
}

function sanitizeSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };
  const theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : 'system';
  const motion = raw.motion === 'reduce' ? 'reduce' : 'system';
  const goalRaw = raw.goal;
  const goal = typeof goalRaw === 'number' && Number.isFinite(goalRaw) ? Math.max(0, Math.min(1_000_000, Math.round(goalRaw))) : null;
  const profileOpen = raw.profileOpen === 'preview' || raw.profileOpen === 'window' ? 'preview' : 'tab';
  return { theme, motion, goal, profileOpen };
}

function sanitizeUi(raw: unknown, dataset: Dataset): UiState {
  const ui: UiState = { ...DEFAULT_UI };
  if (!isRecord(raw)) return ui;
  const views: UiState['view'][] = ['welcome', 'dashboard', 'review', 'cleanup', 'settings'];
  if (typeof raw.view === 'string' && (views as string[]).includes(raw.view)) ui.view = raw.view as UiState['view'];
  const filters: UiState['filter'][] = ['all', 'unreviewed', 'notBack', 'mutual', 'unfollow', 'maybe', 'keep', 'favorites', 'protected'];
  if (typeof raw.filter === 'string' && (filters as string[]).includes(raw.filter)) ui.filter = raw.filter as UiState['filter'];
  if (ui.filter === 'notBack' || ui.filter === 'mutual') {
    if (dataset.snapshot.followerData !== 'present') ui.filter = 'all';
  }
  const sorts: UiState['sort'][] = ['oldest', 'newest', 'az', 'shuffle'];
  if (typeof raw.sort === 'string' && (sorts as string[]).includes(raw.sort)) ui.sort = raw.sort as UiState['sort'];
  ui.query = str(raw.query, 100) ?? '';
  ui.cleanupTab = raw.cleanupTab === 'confirmed' || raw.cleanupTab === 'other' ? raw.cleanupTab : 'queue';
  ui.cleanupMode = raw.cleanupMode === 'list' ? 'list' : 'focus';
  if (isIso(raw.lastActiveAt)) ui.lastActiveAt = raw.lastActiveAt;
  ui.milestonesShown = Array.isArray(raw.milestonesShown)
    ? raw.milestonesShown.filter((n): n is number => typeof n === 'number' && n >= 0).slice(0, 20)
    : [];
  const cursor = str(raw.cursorId, 100);
  ui.cursorId = cursor && dataset.accounts.some(a => a.id === cursor) ? cursor : null;
  return ui;
}

export function buildBackup(data: BackupData): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'FOLLOW/CUT',
    exportedAt: new Date().toISOString(),
    data: {
      dataset: data.dataset,
      decisions: [...data.decisions.entries()],
      cleanup: [...data.cleanup.entries()],
      profileOpens: [...data.profileOpens.entries()],
      settings: data.settings,
      ui: data.ui,
      history: data.history
    }
  };
}

/** Parse a user-chosen backup. Never trusts the file; rebuilds every URL. */
export function parseBackup(text: string, now = new Date()): BackupData {
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError('This backup is larger than the 32 MB safety limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('This is not a valid JSON backup.');
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) throw new BackupError('This is not a FOLLOW/CUT session backup.');
  if (parsed.version !== BACKUP_VERSION) throw new BackupError(`This backup uses version ${String(parsed.version)}, but this build expects version ${BACKUP_VERSION}.`);
  if (!isRecord(parsed.data)) throw new BackupError('The backup has no session data.');
  const raw = parsed.data;
  const dataset = sanitizeDataset(raw.dataset, now);
  const ids = new Set(dataset.accounts.map(a => a.id));
  const nowIso = now.toISOString();

  const decisions = new Map<string, Decision>();
  for (const [id, value] of pairsFrom(raw.decisions)) {
    const key = id.toLowerCase();
    if (!ids.has(key)) continue;
    const decision = sanitizeDecision(value, nowIso);
    if (decision) decisions.set(key, decision);
  }

  const cleanup = new Map<string, Cleanup>();
  for (const [id, value] of pairsFrom(raw.cleanup)) {
    const key = id.toLowerCase();
    if (!ids.has(key)) continue;
    const decision = decisions.get(key);
    if (!decision) continue;
    const record = sanitizeCleanup(value, decision, nowIso);
    if (record) cleanup.set(key, record);
  }

  const profileOpens = new Map<string, string>();
  for (const [id, value] of pairsFrom(raw.profileOpens)) {
    const key = id.toLowerCase();
    if (!ids.has(key) || !isIso(value)) continue;
    profileOpens.set(key, value);
  }

  return {
    dataset,
    decisions,
    cleanup,
    profileOpens,
    settings: sanitizeSettings(raw.settings),
    ui: sanitizeUi(raw.ui, dataset),
    history: sanitizeHistory(raw.history, nowIso)
  };
}

/** Storage load helpers reuse the same validation. */
export function sanitizeStoredDataset(raw: unknown, now = new Date()): Dataset {
  return sanitizeDataset(raw, now);
}

export function sanitizeStoredSession(raw: unknown, dataset: Dataset, now = new Date()): Pick<BackupData, 'decisions' | 'cleanup' | 'profileOpens' | 'history'> {
  if (!isRecord(raw)) throw new BackupError('Saved session is not an object.');
  const ids = new Set(dataset.accounts.map(a => a.id));
  const nowIso = now.toISOString();
  const decisions = new Map<string, Decision>();
  for (const [id, value] of pairsFrom(raw.decisions)) {
    const key = id.toLowerCase();
    if (!ids.has(key)) continue;
    const decision = sanitizeDecision(value, nowIso);
    if (decision) decisions.set(key, decision);
  }
  const cleanup = new Map<string, Cleanup>();
  for (const [id, value] of pairsFrom(raw.cleanup)) {
    const key = id.toLowerCase();
    if (!ids.has(key)) continue;
    const decision = decisions.get(key);
    if (!decision) continue;
    const record = sanitizeCleanup(value, decision, nowIso);
    if (record) cleanup.set(key, record);
  }
  const profileOpens = new Map<string, string>();
  for (const [id, value] of pairsFrom(raw.profileOpens)) {
    const key = id.toLowerCase();
    if (!ids.has(key) || !isIso(value)) continue;
    profileOpens.set(key, value);
  }
  const history = sanitizeHistory(raw.history, nowIso);
  return { decisions, cleanup, profileOpens, history };
}

export function sanitizeStoredSettings(raw: unknown): Settings {
  return sanitizeSettings(raw);
}

export function sanitizeStoredUi(raw: unknown, dataset: Dataset | null): UiState {
  if (!dataset) {
    const ui = { ...DEFAULT_UI };
    if (isRecord(raw) && raw.view === 'welcome') ui.view = 'welcome';
    return ui;
  }
  return sanitizeUi(raw, dataset);
}

