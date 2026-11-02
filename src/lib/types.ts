/** Shared data model for FOLLOW/CUT. Keep this file free of DOM and storage code. */

export const BACKUP_FORMAT = 'followcut-backup';
export const BACKUP_VERSION = 1;
export const STORAGE_PREFIX = 'followcut:v1:';

export type Theme = 'system' | 'light' | 'dark';
export type MotionPref = 'system' | 'reduce';
export type View = 'welcome' | 'dashboard' | 'review' | 'cleanup' | 'settings';

export type Choice = 'undecided' | 'keep' | 'unfollow' | 'maybe';
export type CleanupState = 'queued' | 'profiled' | 'skipped' | 'uncertain' | 'confirmed';

export type ReviewFilter =
  | 'all'
  | 'unreviewed'
  | 'notBack'
  | 'mutual'
  | 'unfollow'
  | 'maybe'
  | 'keep'
  | 'favorites'
  | 'protected';

export type ReviewSort = 'oldest' | 'newest' | 'az' | 'shuffle';

/** One person you follow, normalized from the export. */
export interface Account {
  /** Lower-cased, normalized username. Used as the provisional export identity. */
  id: string;
  /** Lower-cased username used for comparisons. */
  username: string;
  /** Display casing from the export, preserved where the export had it. */
  display: string;
  /** Always built by us: https://www.instagram.com/<encoded>/ */
  profileUrl: string;
  /** Unix epoch seconds, only when the export actually included a timestamp. */
  followedAt?: number;
  /** undefined when follower data was not available, so no one is mislabelled. */
  followsMe?: boolean;
}

export type FollowerData = 'present' | 'incomplete' | 'missing';

export interface Snapshot {
  id: string;
  importedAt: string;
  exportedAt?: string;
  exportDateSource?: 'filename' | 'unknown';
  /** A safe, short label. Not used for identity. */
  sourceLabel?: string;
  followingCount: number;
  followerCount?: number;
  followerData: FollowerData;
  pendingCount?: number;
  duplicateCount?: number;
  invalidCount?: number;
  warnings: string[];
  demo?: boolean;
}

export interface Dataset {
  snapshot: Snapshot;
  accounts: Account[];
  /** Normalized usernames, deduplicated. */
  followers: string[];
  /** Normalized usernames of follow requests you sent, if the export had them. */
  pending: string[];
}

export interface Decision {
  /** 'undecided' lets a star/note exist before a card has been reviewed. */
  choice: Choice;
  favorite: boolean;
  protected: boolean;
  notes?: string;
  /** Set only when the user made a Keep/Cut/Maybe decision. */
  reviewedAt?: string;
  updatedAt: string;
}

export interface Cleanup {
  state: CleanupState;
  queuedAt: string;
  updatedAt: string;
  profileOpenedAt?: string;
  confirmedAt?: string;
  deferredAt?: string;
}

export interface ArchivedConfirmation {
  username: string;
  confirmedAt: string;
  snapshotId: string;
}

export interface SnapshotHistoryItem {
  id: string;
  importedAt: string;
  exportedAt?: string;
  followingCount: number;
  followerCount?: number;
  confirmedCount: number;
}

export interface History {
  /** Confirmations for accounts that disappeared from a later export. */
  confirmations: ArchivedConfirmation[];
  /** Previous snapshots, newest first, capped. */
  snapshots: SnapshotHistoryItem[];
}

export interface Settings {
  theme: Theme;
  motion: MotionPref;
  /** Target following count. null means no target beyond the live 1:1 hint. */
  goal: number | null;
  /** Profile preview: an in-app review mode, or a normal full-profile tab. */
  profileOpen: 'tab' | 'preview';
}

export type CleanupTab = 'queue' | 'confirmed' | 'other';

export interface UiState {
  view: View;
  /** Account the deck is currently showing, so reload resumes exactly here. */
  cursorId: string | null;
  filter: ReviewFilter;
  sort: ReviewSort;
  query: string;
  cleanupTab: CleanupTab;
  cleanupMode: 'focus' | 'list';
  /** Last meaningful save, used to show a resume checkpoint. */
  lastActiveAt: string | null;
  /** Milestones already acknowledged, so they don't repeat. */
  milestonesShown: number[];
}

export type ImportErrorCode =
  | 'ZIP_INVALID'
  | 'ZIP_ENCRYPTED'
  | 'ZIP_TOO_LARGE'
  | 'ZIP_CORRUPT'
  | 'ZIP_UNSUPPORTED'
  | 'ZIP64_UNSUPPORTED'
  | 'FILE_TOO_LARGE'
  | 'HTML_EXPORT'
  | 'NO_DATA'
  | 'EMPTY_FOLLOWING'
  | 'BAD_JSON'
  | 'TOO_MANY_ACCOUNTS'
  | 'UNSUPPORTED_BROWSER'
  | 'READ_FAILED';

export class ImportError extends Error {
  code: ImportErrorCode;
  detail?: string;
  /** Anonymized structure summary, when the failure was a parser failure. */
  schema?: SchemaReport;
  constructor(code: ImportErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.detail = detail;
  }
}

export interface ParsedAccount {
  username: string;
  display: string;
  timestamp?: number;
}

export type SourceKind = 'following' | 'followers' | 'pending';

export interface DatasetCandidate {
  /** A non-identifying label for the dataset picker. */
  label: string;
  snapshot: Snapshot;
  accounts: Account[];
  followers: string[];
  pending: string[];
  warnings: string[];
}

export interface SchemaReport {
  generatedAt: string;
  app: string;
  files: SchemaFileReport[];
}

export interface SchemaFileReport {
  name: string;
  topLevel: 'array' | 'object' | 'text' | 'unknown';
  keys: string[];
  arrayPaths: { path: string; length: number; entryKeys: string[] }[];
  parsedAs?: SourceKind | 'skipped';
  note?: string;
}

export interface ImportAnalysis {
  candidates: DatasetCandidate[];
  errors: string[];
  warnings: string[];
  schema: SchemaReport;
  filesExamined: number;
  skippedFiles: string[];
}

export interface MergePreview {
  oldFollowing: number;
  newFollowing: number;
  added: number;
  removed: number;
  decisionsPreserved: number;
  decisionsDropped: number;
  confirmationsPreserved: number;
  confirmationsArchived: number;
  oldExportedAt?: string;
  newExportedAt?: string;
  warnings: string[];
}

export interface Metrics {
  followers: number | null;
  following: number;
  ratio: number | null;
  mutuals: number | null;
  notFollowingBack: number | null;
  fans: number | null;
  reviewed: number;
  unreviewed: number;
  planned: number;
  pendingQueue: number;
  confirmedCurrent: number;
  confirmedArchived: number;
  confirmedAllTime: number;
  uncertain: number;
  skipped: number;
  estimatedFollowing: number;
  projectedFollowing: number;
  estimatedRatio: number | null;
  projectedRatio: number | null;
  parityRemaining: number | null;
  goalRemaining: number | null;
  reviewProgress: number;
  cleanupProgress: number;
  snapshot: Snapshot;
}

export interface QueueItem {
  account: Account;
  decision: Decision;
  cleanup: Cleanup;
  deferred: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  motion: 'system',
  goal: null,
  profileOpen: 'tab'
};

export const DEFAULT_UI: UiState = {
  view: 'welcome',
  cursorId: null,
  filter: 'all',
  sort: 'oldest',
  query: '',
  cleanupTab: 'queue',
  cleanupMode: 'focus',
  lastActiveAt: null,
  milestonesShown: []
};

export const EMPTY_HISTORY: History = { confirmations: [], snapshots: [] };
