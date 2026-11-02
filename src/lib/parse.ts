/**
 * Instagram export discovery + normalization.
 *
 * Adapted from the tolerant parsing ideas in IG Cleanup Tool (MIT,
 * Copyright (c) 2026 Mahmood Saeed): filename classification, recursive entry
 * collection, and support for string_list_data / label_values / string_map_data.
 * Substantially rewritten for FOLLOW/CUT with dataset separation, validation,
 * schema reporting, and explicit "unknown" follow-back state.
 */
import {
  ImportError,
  type Account,
  type DatasetCandidate,
  type FollowerData,
  type ImportAnalysis,
  type ParsedAccount,
  type SchemaFileReport,
  type SchemaReport,
  type SourceKind
} from './types';
import { DEFAULT_ZIP_LIMITS, readExportZip, type ZipLimits } from './zip';

const MAX_ACCOUNTS = 100_000;
const MAX_FILES = 500;
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const APP_VERSION = 'FOLLOW/CUT 1.0';

export interface TextSource {
  /** Archive path or selected filename. */
  name: string;
  text: string;
}

export interface UploadFile {
  name: string;
  path?: string;
  bytes: Uint8Array;
}

export interface AnalyzeOptions {
  zipName?: string;
  skippedZipFiles?: string[];
  htmlEntries?: string[];
  entryCount?: number;
  now?: Date;
  zipLimits?: ZipLimits;
}

export interface ParsedFile {
  path: string;
  name: string;
  kind: SourceKind | null;
  entries: ParsedAccount[];
  invalid: number;
  duplicates: number;
  raw?: unknown;
  error?: string;
  html?: boolean;
  zero?: boolean;
}

/**
 * Normalize a username for comparison. Returns null for values that cannot be a
 * profile handle. Instagram handles are case-insensitive; display casing is kept
 * separately.
 */
export function normalizeUsername(raw: string): string | null {
  let value = String(raw ?? '').trim();
  if (!value) return null;
  value = value.replace(/^@+/, '');

  // Some exports put a full URL where a username belongs.
  if (/^https?:\/\//i.test(value) || /instagram\.com\//i.test(value)) {
    try {
      const url = new URL(value.startsWith('http') ? value : `https://${value}`);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === '_u') parts.shift();
      value = parts[0] ? decodeURIComponent(parts[0]) : '';
    } catch {
      return null;
    }
  }

  value = value.normalize('NFKC').trim().replace(/^@+/, '');
  if (!value || value.length > 80) return null;
  if (/[\s/\\?#<>"'`\u0000-\u001f\u007f]/.test(value)) return null;
  if (value === '.' || value === '..') return null;
  if (/^(null|undefined|none|n\/a|unknown)$/i.test(value)) return null;
  return value;
}

export function buildProfileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

export function normalizeTimestamp(value: unknown, now = Date.now()): number | undefined {
  let n: number | undefined;
  if (typeof value === 'number' && Number.isFinite(value)) n = value;
  else if (typeof value === 'string' && /^\d{9,15}$/.test(value.trim())) n = Number(value.trim());
  if (n === undefined || n <= 0) return undefined;
  if (n > 1e12) n = Math.round(n / 1000);
  const max = Math.floor(now / 1000) + 86400;
  if (n < 946684800 || n > max) return undefined; // before 2000 or implausibly future
  return Math.round(n);
}

interface ClassifiedName {
  kind: SourceKind | 'skip' | null;
  copy: boolean;
}

/** Filename classifier. Conservative: never let "received requests" look like following. */
export function classifyName(path: string): ClassifiedName {
  const base = (path.split(/[\\/]/).pop() ?? '').toLowerCase();
  const stem = base
    .replace(/\.json$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[\s-]+/g, '_');
  const copy = /\(\d+\)\.json$/i.test(base);
  if (/recent|unfollowed|hashtag|removed|close_friends|restricted|blocked|hide_story|received|suggest|favorit|custom_list|story_|stories|mute/.test(stem)) {
    return { kind: 'skip', copy };
  }
  if (/^(pending_follow_requests|follow_requests_sent|pending_requests|requested)(_\d+)?$/.test(stem)) {
    return { kind: 'pending', copy };
  }
  if (/^followers(_\d+)?$/.test(stem)) return { kind: 'followers', copy };
  if (/^following(_\d+)?$/.test(stem)) return { kind: 'following', copy };
  return { kind: null, copy: false };
}

/** Top-level JSON keys can identify a file when its name is unhelpful. */
export function classifyJson(json: unknown): SourceKind | 'skip' | null {
  if (!json || Array.isArray(json) || typeof json !== 'object') return null;
  const keys = Object.keys(json as Record<string, unknown>).map(k => k.toLowerCase());
  if (keys.some(k => /hashtags|unfollowed|received|follow_requests_received|suggested/.test(k))) return 'skip';
  if (keys.some(k => /^(relationships_pending_follow_requests|relationships_follow_requests_sent|pending_follow_requests)$/.test(k))) return 'pending';
  if (keys.includes('relationships_following')) return 'following';
  if (keys.includes('relationships_followers')) return 'followers';
  return null;
}

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function looksLikeEntry(v: JsonObject): boolean {
  return (
    Array.isArray(v.string_list_data) ||
    Array.isArray(v.label_values) ||
    isObject(v.string_map_data) ||
    typeof v.title === 'string' ||
    typeof v.username === 'string'
  );
}

/** Collect every account-shaped object, however deeply Instagram nested it. */
export function collectEntries(json: unknown): JsonObject[] {
  const out: JsonObject[] = [];
  const visited = new Set<unknown>();
  (function walk(value: unknown, depth: number): void {
    if (depth > 12 || out.length >= MAX_ACCOUNTS) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (!isObject(value) || visited.has(value)) return;
    visited.add(value);
    if (looksLikeEntry(value)) {
      out.push(value);
      return;
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  })(json, 0);
  return out;
}

interface RawNameParts {
  username?: string;
  href?: string;
  timestamp?: unknown;
}

function scanLabelValues(value: unknown, found: RawNameParts): void {
  if (Array.isArray(value)) {
    for (const item of value) scanLabelValues(item, found);
    return;
  }
  if (!isObject(value)) return;
  const label = String(value.label ?? value.name ?? '').toLowerCase();
  const rawValue = value.value;
  if (typeof rawValue === 'string') {
    if (!found.username && /user ?name|handle|account/.test(label)) found.username = rawValue;
    if (!found.href && /url|link|profile/.test(label)) found.href = rawValue;
    if (found.timestamp === undefined && /time|date/.test(label)) found.timestamp = rawValue;
  }
  if (Array.isArray(value.dict)) scanLabelValues(value.dict, found);
  if (Array.isArray(value.vec)) scanLabelValues(value.vec, found);
}

function readParts(entry: JsonObject): RawNameParts {
  const found: RawNameParts = {};

  const list = entry.string_list_data;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!isObject(item)) continue;
      if (!found.username && typeof item.value === 'string') found.username = item.value;
      if (!found.href && typeof item.href === 'string') found.href = item.href;
      if (found.timestamp === undefined && item.timestamp !== undefined) found.timestamp = item.timestamp;
    }
  } else if (isObject(list)) {
    if (typeof list.value === 'string') found.username = list.value;
    if (typeof list.href === 'string') found.href = list.href;
    if (list.timestamp !== undefined) found.timestamp = list.timestamp;
  }

  if (isObject(entry.string_map_data)) {
    for (const [key, value] of Object.entries(entry.string_map_data)) {
      if (!isObject(value)) continue;
      if (!found.username && /user ?name|handle/i.test(key) && typeof value.value === 'string') found.username = value.value;
      if (!found.href && typeof value.href === 'string') found.href = value.href;
      if (found.timestamp === undefined && value.timestamp !== undefined) found.timestamp = value.timestamp;
    }
  }

  if (Array.isArray(entry.label_values)) scanLabelValues(entry.label_values, found);

  if (!found.username && typeof entry.username === 'string') found.username = entry.username;
  if (!found.username && typeof entry.handle === 'string') found.username = entry.handle;
  if (!found.username && typeof entry.value === 'string') found.username = entry.value;
  if (!found.href && typeof entry.href === 'string') found.href = entry.href;
  if (found.timestamp === undefined && entry.timestamp !== undefined) found.timestamp = entry.timestamp;
  if (!found.username && typeof entry.title === 'string') found.username = entry.title;

  return found;
}

export function parseEntries(json: unknown, now = Date.now()): { accounts: ParsedAccount[]; invalid: number; duplicates: number } {
  const accounts: ParsedAccount[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  for (const entry of collectEntries(json)) {
    const parts = readParts(entry);
    let raw = parts.username ?? '';
    if (!raw && parts.href) raw = parts.href;
    const normalized = normalizeUsername(raw);
    if (!normalized) {
      invalid++;
      continue;
    }
    const id = normalized.toLowerCase();
    if (seen.has(id)) {
      duplicates++;
      continue;
    }
    seen.add(id);
    const display = raw.trim().replace(/^@+/, '').split('/').pop() || normalized;
    const timestamp = normalizeTimestamp(parts.timestamp, now);
    accounts.push(timestamp ? { username: normalized, display, timestamp } : { username: normalized, display });
  }
  return { accounts, invalid, duplicates };
}

function looksHtml(text: string): boolean {
  return /^\s*(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<table[\s>])/i.test(text.slice(0, 1024));
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Identify the archive root a file belongs to, so two accounts never merge. */
export function datasetRoot(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const connections = parts.indexOf('connections');
  if (connections >= 0) return parts.slice(0, connections).join('/');
  const faf = parts.indexOf('followers_and_following');
  if (faf >= 0) return parts.slice(0, faf).join('/');
  if (parts.length > 1) {
    // A top-level Instagram folder usually starts with "instagram-".
    if (/^instagram[-_]/i.test(parts[0])) return parts[0];
  }
  return '';
}

export function exportDateFrom(paths: string[], now = new Date()): { iso?: string; source: 'filename' | 'unknown' } {
  const future = now.getTime() + 7 * 86_400_000;
  for (const path of paths) {
    const matches = [...path.matchAll(/(20\d{2})[-_](\d{2})[-_](\d{2})/g)];
    for (const match of matches) {
      const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (!Number.isFinite(time) || time > future) continue;
      if (time < Date.UTC(2005, 0, 1)) continue;
      return { iso: new Date(time).toISOString(), source: 'filename' };
    }
  }
  return { source: 'unknown' };
}

function rootLabel(root: string): string {
  if (!root) return 'Selected files';
  const parts = root.split('/').filter(Boolean);
  return (parts[parts.length - 1] || 'Archive root').slice(0, 80);
}

function snapshotId(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `snap_${(h >>> 0).toString(36)}${Date.now().toString(36).slice(-5)}`;
}

function formatDate(iso?: string): string {
  if (!iso) return 'date unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date unknown';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function safeSchemaName(path: string): string {
  const base = basename(path).toLowerCase();
  if (/following/.test(base)) return 'following.json';
  if (/followers/.test(base)) return 'followers.json';
  if (/pending|request/.test(base)) return 'pending.json';
  return 'data.json';
}

function schemaForFile(path: string, text: string): SchemaFileReport {
  const name = safeSchemaName(path);
  const report: SchemaFileReport = { name, topLevel: 'unknown', keys: [], arrayPaths: [] };
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    report.topLevel = 'text';
    report.note = looksHtml(text) ? 'HTML, not JSON' : 'not valid JSON';
    return report;
  }
  if (Array.isArray(json)) {
    report.topLevel = 'array';
    report.arrayPaths.push({ path: '$', length: json.length, entryKeys: Object.keys((json[0] as JsonObject) || {}).slice(0, 20) });
  } else if (isObject(json)) {
    report.topLevel = 'object';
    report.keys = Object.keys(json).slice(0, 30);
    const visit = (value: unknown, path: string, depth: number): void => {
      if (depth > 4 || report.arrayPaths.length > 20) return;
      if (Array.isArray(value)) {
        report.arrayPaths.push({
          path,
          length: value.length,
          entryKeys: isObject(value[0]) ? Object.keys(value[0] as JsonObject).slice(0, 20) : []
        });
        for (const item of value.slice(0, 3)) visit(item, `${path}[]`, depth + 1);
      } else if (isObject(value)) {
        for (const [key, child] of Object.entries(value)) {
          if (key === 'string_list_data' || key === 'label_values' || key === 'string_map_data' || key === 'media_list_data') continue;
          visit(child, `${path}.${key}`, depth + 1);
        }
      }
    };
    for (const [key, value] of Object.entries(json)) visit(value, `$.${key}`, 0);
  } else {
    report.topLevel = 'unknown';
  }
  return report;
}

interface GroupedFile {
  path: string;
  name: string;
  kind: SourceKind | 'skip' | null;
  entries: ParsedAccount[];
  invalid: number;
  duplicates: number;
  error?: string;
  html: boolean;
  zero: boolean;
  copy: boolean;
  root: string;
  schema: SchemaFileReport;
}

function markdownSafeList(names: string[], max = 6): string {
  const shown = names.slice(0, max).map(basename);
  return shown.join(', ') + (names.length > max ? `, +${names.length - max} more` : '');
}

export function analyzeTextSources(sources: TextSource[], options: AnalyzeOptions = {}): ImportAnalysis {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const files: GroupedFile[] = [];
  const schemaFiles: SchemaFileReport[] = [];
  const htmlFiles = new Set<string>(options.htmlEntries ?? []);
  const skippedFiles: string[] = [...(options.skippedZipFiles ?? [])];

  if (sources.length > MAX_FILES) {
    throw new ImportError('ZIP_TOO_LARGE', `This selection has more than ${MAX_FILES} files.`, 'Choose the ZIP, or the following/followers JSON files only.');
  }

  for (const source of sources) {
    const name = basename(source.name);
    if (!name || name.startsWith('.') || /^__MACOSX\//i.test(source.name)) continue;
    const schema = schemaForFile(source.name, source.text);
    const root = datasetRoot(source.name);
    const classified = classifyName(source.name);
    const isHtmlName = /\.html?$/i.test(name);
    const text = source.text.replace(/^\uFEFF/, '');

    if (isHtmlName || (looksHtml(text) && !/\.json$/i.test(name))) {
      htmlFiles.add(source.name);
      schemaFiles.push(schema);
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      if (classified.kind !== 'skip') {
        files.push({
          path: source.name,
          name,
          kind: classified.kind,
          entries: [],
          invalid: 0,
          duplicates: 0,
          error: 'not valid JSON',
          html: looksHtml(text),
          zero: false,
          copy: classified.copy,
          root,
          schema
        });
      }
      schemaFiles.push(schema);
      continue;
    }

    const byName = classified.kind;
    const byJson = classifyJson(json);
    let kind: SourceKind | 'skip' | null = byName === 'skip' ? 'skip' : (byName ?? byJson);
    if (kind === 'skip' || kind === null) {
      schemaFiles.push(schema);
      continue;
    }

    const { accounts, invalid, duplicates } = parseEntries(json, nowMs);
    const zero = accounts.length === 0;
    files.push({
      path: source.name,
      name,
      kind,
      entries: accounts,
      invalid,
      duplicates,
      html: false,
      zero,
      copy: classified.copy,
      root,
      schema: { ...schema, parsedAs: kind }
    });
    schemaFiles.push({ ...schema, parsedAs: kind });
  }

  const roots = new Map<string, GroupedFile[]>();
  for (const file of files) {
    const list = roots.get(file.root) ?? [];
    list.push(file);
    roots.set(file.root, list);
  }

  const candidates: DatasetCandidate[] = [];
  const warnings: string[] = [];
  const fatalDetails: string[] = [];

  for (const [root, group] of roots) {
    const followingFiles = group.filter(f => f.kind === 'following');
    const followerFiles = group.filter(f => f.kind === 'followers');
    const pendingFiles = group.filter(f => f.kind === 'pending');
    const followingMap = new Map<string, ParsedAccount>();
    const followerSet = new Set<string>();
    const pendingSet = new Set<string>();
    let invalid = 0;
    let duplicates = 0;
    let followingParseError = false;
    let followerParseError = false;
    let followerZero = false;
    let followingZero = false;

    for (const file of group) {
      invalid += file.invalid;
      if (file.kind === 'following') duplicates += file.duplicates;
      if (file.error) {
        if (file.kind === 'followers' || /^followers?/i.test(file.name)) followerParseError = true;
        if (file.kind === 'following' || /^following/i.test(file.name)) followingParseError = true;
        continue;
      }
    }

    const allFollowingFiles = followingFiles.filter(f => !f.error);
    for (const file of allFollowingFiles) {
      if (file.zero) followingZero = true;
      for (const account of file.entries) {
        const id = account.username.toLowerCase();
        const existing = followingMap.get(id);
        if (existing) {
          duplicates++;
          if (!existing.timestamp && account.timestamp) existing.timestamp = account.timestamp;
          continue;
        }
        followingMap.set(id, account);
      }
    }

    for (const file of followerFiles) {
      if (file.error || file.zero) followerParseError = true;
      if (file.zero) followerZero = true;
      for (const account of file.entries) followerSet.add(account.username.toLowerCase());
    }
    for (const file of pendingFiles) {
      for (const account of file.entries) pendingSet.add(account.username.toLowerCase());
    }

    if (followingMap.size === 0) {
      if (followingFiles.length || followingParseError) fatalDetails.push(`${root || 'the archive'} has no readable following list`);
      continue;
    }
    if (followingMap.size > MAX_ACCOUNTS) {
      throw new ImportError('TOO_MANY_ACCOUNTS', `This export has ${followingMap.size.toLocaleString()} following accounts, above the ${MAX_ACCOUNTS.toLocaleString()} safety limit.`);
    }

    const followerData: FollowerData = followerFiles.length === 0 || followerZero
      ? (followerFiles.length ? 'incomplete' : 'missing')
      : (followerParseError ? 'incomplete' : 'present');

    const candidateWarnings: string[] = [];
    if (followerData === 'missing') {
      candidateWarnings.push('Only following data was found. Follow-back comparison is off, so nobody is labelled "not following back".');
    }
    if (followerData === 'incomplete') {
      candidateWarnings.push('Follower comparison may be incomplete. One or more follower files could not be read or contained no accounts.');
    }
    if (duplicates > 0) {
      candidateWarnings.push(`${duplicates.toLocaleString()} duplicate following entr${duplicates === 1 ? 'y was' : 'ies were'} merged.`);
    }
    if (invalid > 0) {
      candidateWarnings.push(`${invalid.toLocaleString()} entr${invalid === 1 ? 'y' : 'ies'} had no usable username and ${invalid === 1 ? 'was' : 'were'} skipped.`);
    }
    if (group.some(f => f.copy)) {
      candidateWarnings.push('Renamed copies of export files were detected and merged.');
    }
    if (followingZero) candidateWarnings.push('A following file was present but empty.');
    if (followingParseError) candidateWarnings.push('One following file could not be read; the following snapshot may be incomplete.');
    if (followerFiles.length > 0 && followerData === 'present') {
      candidateWarnings.push('Follow-back status assumes the export includes your complete follower list.');
    }

    const dates = exportDateFrom([root, options.zipName ?? ''], now);
    if (!dates.iso) {
      candidateWarnings.push('The export date was not found in the archive name. This snapshot is labelled with its import date.');
    }
    if (!followingMap.size) continue;

    const accounts: Account[] = [];
    for (const [id, parsed] of followingMap) {
      const account: Account = {
        id,
        username: id,
        display: parsed.display || parsed.username,
        profileUrl: buildProfileUrl(id)
      };
      if (parsed.timestamp) account.followedAt = parsed.timestamp;
      if (followerData === 'present') account.followsMe = followerSet.has(id);
      accounts.push(account);
    }
    accounts.sort((a, b) => a.id.localeCompare(b.id, 'en'));

    const sourceLabel = rootLabel(root);
    const snapshotIdValue = snapshotId(`${options.zipName ?? ''}|${root}|${accounts.length}|${followerSet.size}|${dates.iso ?? ''}|${nowMs}`);
    const label = `${sourceLabel} — ${accounts.length.toLocaleString()} following · ${followerData === 'missing' ? 'followers missing' : `${followerSet.size.toLocaleString()} followers`}${dates.iso ? ` · ${formatDate(dates.iso)}` : ''}`;

    candidates.push({
      label,
      snapshot: {
        id: snapshotIdValue,
        importedAt: now.toISOString(),
        exportedAt: dates.iso,
        exportDateSource: dates.source,
        sourceLabel,
        followingCount: accounts.length,
        followerCount: followerData === 'missing' ? undefined : followerSet.size,
        followerData,
        pendingCount: pendingFiles.length ? pendingSet.size : undefined,
        duplicateCount: duplicates,
        invalidCount: invalid,
        warnings: candidateWarnings
      },
      accounts,
      followers: [...followerSet].sort((a, b) => a.localeCompare(b, 'en')),
      pending: [...pendingSet].sort((a, b) => a.localeCompare(b, 'en')),
      warnings: candidateWarnings
    });
  }

  const htmlTarget = [...htmlFiles];
  if (candidates.length === 0) {
    if (htmlTarget.length > 0) {
      throw new ImportError(
        'HTML_EXPORT',
        'This is an HTML export. FOLLOW/CUT needs the JSON version.',
        'In Accounts Center, request your information again and choose "JSON" as the format. The HTML export cannot be read without guessing at page structure.'
      );
    }
    const badJson = files.filter(f => f.error);
    if (badJson.length > 0) {
      const error = new ImportError(
        'BAD_JSON',
        'The follower data is not valid JSON.',
        `We could read ${badJson.length} candidate file${badJson.length === 1 ? '' : 's'}, but none parsed. The download may be incomplete or from a newer export schema. Copy the anonymized schema report below if you want to investigate without sharing account names.`
      );
      error.schema = { generatedAt: now.toISOString(), app: APP_VERSION, files: schemaFiles };
      throw error;
    }
    const error = new ImportError(
      'NO_DATA',
      'No following list was found in this file.',
      `We examined ${sources.length} file${sources.length === 1 ? '' : 's'}${fatalDetails.length ? ` (${fatalDetails.join('; ')})` : ''}. A correct export includes a file named following.json inside connections/followers_and_following. Request "Followers and following" with date range All time and format JSON.`
    );
    error.schema = { generatedAt: now.toISOString(), app: APP_VERSION, files: schemaFiles };
    throw error;
  }

  if (candidates.length > 1) {
    warnings.push(`This archive contains ${candidates.length} separate account datasets. Choose the one that belongs to the account you want to review. They were not merged.`);
  } else {
    warnings.push(...candidates[0].warnings);
  }
  if (htmlFiles.size > 0 && candidates.length > 0) {
    warnings.push('HTML files were present and ignored; JSON data was used.');
  }
  if (skippedFiles.length > 0) {
    warnings.push(`${skippedFiles.length} file${skippedFiles.length === 1 ? '' : 's'} inside the ZIP used an unsupported compression method and ${skippedFiles.length === 1 ? 'was' : 'were'} skipped.`);
  }
  if (options.entryCount) warnings.push(`Read ${options.entryCount.toLocaleString()} entries from the archive; only follower/following data was parsed.`);

  const schema: SchemaReport = {
    generatedAt: now.toISOString(),
    app: APP_VERSION,
    files: schemaFiles
  };

  return {
    candidates,
    errors: [],
    warnings,
    schema,
    filesExamined: sources.length,
    skippedFiles
  };
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
}

export async function analyzeUploads(files: UploadFile[], options: AnalyzeOptions = {}): Promise<ImportAnalysis> {
  if (!files.length) {
    throw new ImportError('NO_DATA', 'No file was chosen.', 'Choose the ZIP Meta gave you, or the following.json and followers_1.json files.');
  }
  const sources: TextSource[] = [];
  const htmlEntries: string[] = [];
  let zipName: string | undefined;
  let skippedZipFiles: string[] = [];
  let entryCount = 0;

  for (const file of files) {
    const path = file.path || file.name;
    const isZip = /\.zip$/i.test(file.name) || (file.bytes.length >= 4 && file.bytes[0] === 0x50 && file.bytes[1] === 0x4b && (file.bytes[2] === 3 || file.bytes[2] === 5) && (file.bytes[3] === 4 || file.bytes[3] === 6));
    if (isZip) {
      if (zipName) {
        // Multiple ZIPs are not expected from one export; read the first and be explicit.
        throw new ImportError('ZIP_UNSUPPORTED', 'Choose one ZIP at a time.', 'If you have multiple exports, import them one at a time so datasets cannot be mixed.');
      }
      zipName = file.name;
      const result = await readExportZip(file.bytes, options.zipLimits ?? DEFAULT_ZIP_LIMITS);
      for (const entry of result.files) sources.push({ name: entry.name, text: entry.text });
      htmlEntries.push(...result.htmlEntries);
      skippedZipFiles = result.skipped;
      entryCount = result.entryCount;
      continue;
    }
    if (file.bytes.length > MAX_JSON_BYTES) {
      throw new ImportError('FILE_TOO_LARGE', `${file.name} is larger than the 32 MB JSON safety limit.`);
    }
    const text = decodeText(file.bytes);
    if (/\.html?$/i.test(file.name) || (looksHtml(text) && !/\.json$/i.test(file.name))) {
      htmlEntries.push(path);
      continue;
    }
    if (!/\.json$/i.test(file.name) && !/^\s*[[{]/.test(text)) continue;
    sources.push({ name: path, text });
  }

  return analyzeTextSources(sources, {
    zipName,
    skippedZipFiles,
    htmlEntries,
    entryCount,
    now: options.now,
    zipLimits: options.zipLimits
  });
}

/** Human-readable, account-name-free schema report for parser failures. */
export function schemaReportText(schema: SchemaReport): string {
  return JSON.stringify(schema, null, 2);
}

