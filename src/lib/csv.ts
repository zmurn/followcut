import type { ReadState } from './selectors';
import { followBackLabel, getConfirmed, getOther, getQueue, getMetrics } from './selectors';
import type { Cleanup, Decision } from './types';

function safeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // CSV formula injection guard for user-controlled notes/usernames.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return text;
}

function cell(value: unknown): string {
  const text = safeCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows: unknown[][]): string {
  return `\uFEFF${rows.map(row => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

function followBack(state: ReadState, accountId: string): string {
  const dataset = state.dataset;
  if (!dataset) return 'unknown';
  const account = dataset.accounts.find(a => a.id === accountId);
  if (!account) return 'unknown';
  return followBackLabel(account, dataset.snapshot).label;
}

export function buildDecisionsCsv(state: ReadState): string {
  const dataset = state.dataset;
  if (!dataset) return csv([['No session data']]);
  const rows: unknown[][] = [[
    'username', 'profile_url', 'follow_back', 'followed_at', 'choice', 'starred', 'locked',
    'reviewed_at', 'note', 'cleanup_state', 'profile_opened_at', 'confirmed_at'
  ]];
  for (const account of dataset.accounts) {
    const decision: Decision | undefined = state.decisions.get(account.id);
    const cleanup: Cleanup | undefined = state.cleanup.get(account.id);
    rows.push([
      account.display,
      account.profileUrl,
      followBackLabel(account, dataset.snapshot).label,
      account.followedAt ? new Date(account.followedAt * 1000).toISOString() : '',
      decision?.choice ?? 'undecided',
      decision?.favorite ? 'yes' : '',
      decision?.protected ? 'yes' : '',
      decision?.reviewedAt ?? '',
      decision?.notes ?? '',
      cleanup?.state ?? '',
      state.profileOpens.get(account.id) ?? '',
      cleanup?.confirmedAt ?? ''
    ]);
  }
  return csv(rows);
}

export function buildQueueCsv(state: ReadState): string {
  const rows: unknown[][] = [[
    'username', 'profile_url', 'follow_back', 'queued_at', 'cleanup_state', 'profile_opened_at',
    'confirmed_at', 'deferred_at', 'note', 'reviewed_at', 'snapshot_exported_at'
  ]];
  const seen = new Set<string>();
  const items = [...getQueue(state), ...getConfirmed(state), ...getOther(state)].filter(item => {
    if (seen.has(item.account.id)) return false;
    seen.add(item.account.id);
    return true;
  });
  for (const item of items) {
    rows.push([
      item.account.display,
      item.account.profileUrl,
      followBack(state, item.account.id),
      item.cleanup.queuedAt,
      item.cleanup.state,
      item.cleanup.profileOpenedAt ?? '',
      item.cleanup.confirmedAt ?? '',
      item.cleanup.deferredAt ?? '',
      item.decision.notes ?? '',
      item.decision.reviewedAt ?? '',
      state.dataset?.snapshot.exportedAt ?? ''
    ]);
  }
  return csv(rows);
}

export function buildQueueJson(state: ReadState): string {
  const dataset = state.dataset;
  const metrics = getMetrics(state);
  const collect = (items: ReturnType<typeof getQueue>) => items.map(item => ({
    username: item.account.display,
    profile_url: item.account.profileUrl,
    follow_back: followBack(state, item.account.id),
    state: item.cleanup.state,
    queued_at: item.cleanup.queuedAt,
    profile_opened_at: item.cleanup.profileOpenedAt ?? null,
    confirmed_at: item.cleanup.confirmedAt ?? null,
    deferred_at: item.cleanup.deferredAt ?? null,
    note: item.decision.notes ?? null,
    reviewed_at: item.decision.reviewedAt ?? null
  }));
  return JSON.stringify({
    app: 'FOLLOW/CUT',
    exported_at: new Date().toISOString(),
    snapshot: dataset
      ? {
          exported_at: dataset.snapshot.exportedAt ?? null,
          imported_at: dataset.snapshot.importedAt,
          following: dataset.accounts.length,
          followers: dataset.snapshot.followerCount ?? null,
          follower_data: dataset.snapshot.followerData,
          demo: Boolean(dataset.snapshot.demo)
        }
      : null,
    summary: metrics
      ? {
          planned: metrics.planned,
          pending: metrics.pendingQueue,
          confirmed_current: metrics.confirmedCurrent,
          confirmed_archived: metrics.confirmedArchived,
          uncertain: metrics.uncertain
        }
      : null,
    queue: collect(getQueue(state)),
    confirmed: collect(getConfirmed(state)),
    skipped_or_uncertain: collect(getOther(state))
  }, null, 2);
}

