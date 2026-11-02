import { describe, expect, it } from 'vitest';
import { FollowCutStore, type StorageLike } from '../../src/lib/store';
import { parseBackup, buildBackup } from '../../src/lib/backup';
import { buildProfileUrl } from '../../src/lib/parse';
import type { DatasetCandidate } from '../../src/lib/types';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string): void { this.map.delete(key); }
}

const NOW = new Date('2026-11-02T12:00:00Z');
const now = () => NOW;

function candidate(ids: string[], followers: string[] = [], options: { exportedAt?: string; demo?: boolean } = {}): DatasetCandidate {
  const accounts = ids.map((id, index) => ({
    id,
    username: id,
    display: id,
    profileUrl: buildProfileUrl(id),
    followedAt: 1600000000 + index * 1000,
    followsMe: followers.includes(id) ? true : followers.length ? false : undefined
  }));
  return {
    label: 'Test export',
    snapshot: {
      id: `snap_${ids.join('_')}`,
      importedAt: NOW.toISOString(),
      exportedAt: options.exportedAt ?? '2026-10-12T00:00:00.000Z',
      exportDateSource: 'filename',
      sourceLabel: 'Test export',
      followingCount: accounts.length,
      followerCount: followers.length || undefined,
      followerData: followers.length ? 'present' : 'missing',
      pendingCount: 0,
      warnings: [],
      demo: options.demo
    },
    accounts,
    followers,
    pending: [],
    warnings: []
  };
}

describe('persistent store', () => {
  it('saves and restores decisions, notes, cleanup and cursor', () => {
    const memory = new MemoryStorage();
    const store = new FollowCutStore({ storage: memory, now });
    store.importDataset(candidate(['a.one', 'b.two', 'c.three', 'd.four'], ['a.one']));
    store.setView('review');
    store.decide('a.one', 'keep');
    store.decide('b.two', 'unfollow');
    store.toggleFavorite('b.two');
    store.setNote('b.two', 'Client, but the work ended.');
    store.confirmUnfollow('b.two');
    store.setGoal(1200);
    store.setTheme('dark');
    store.setProfileOpen('preview');
    const cursorAfter = store.state.ui.cursorId;
    expect(store.state.decisions.get('a.one')?.choice).toBe('keep');
    expect(store.state.cleanup.get('b.two')?.state).toBe('confirmed');
    expect(memory.map.has('followcut:v1:dataset')).toBe(true);

    const restored = new FollowCutStore({ storage: memory, now });
    expect(restored.state.dataset?.accounts).toHaveLength(4);
    expect(restored.state.decisions.get('a.one')?.choice).toBe('keep');
    expect(restored.state.decisions.get('b.two')?.notes).toContain('Client');
    expect(restored.state.decisions.get('b.two')?.favorite).toBe(true);
    expect(restored.state.cleanup.get('b.two')?.state).toBe('confirmed');
    expect(restored.state.ui.cursorId).toBe(cursorAfter);
    expect(restored.state.ui.view).toBe('review');
    expect(restored.state.settings.goal).toBe(1200);
    expect(restored.state.settings.theme).toBe('dark');
    expect(restored.state.settings.profileOpen).toBe('preview');
  });

  it('remembers the last active time, view and cursor across a reload', () => {
    const memory = new MemoryStorage();
    const store = new FollowCutStore({ storage: memory, now });
    store.importDataset(candidate(['a.one', 'b.two', 'c.three']));
    store.setView('review');
    store.decide('a.one', 'keep');
    const lastActiveAt = store.state.ui.lastActiveAt;
    const cursor = store.state.ui.cursorId;
    expect(lastActiveAt).toBe(NOW.toISOString());
    expect(cursor).toBe('b.two');

    const restored = new FollowCutStore({ storage: memory, now });
    expect(restored.state.ui.lastActiveAt).toBe(lastActiveAt);
    expect(restored.state.ui.view).toBe('review');
    expect(restored.state.ui.cursorId).toBe(cursor);
  });

  it('undoes a decision and clears a confirmation when reverting', () => {
    const store = new FollowCutStore({ storage: new MemoryStorage(), now });
    store.importDataset(candidate(['a.one', 'b.two']));
    store.decide('a.one', 'unfollow');
    store.confirmUnfollow('a.one');
    expect(store.state.cleanup.get('a.one')?.state).toBe('confirmed');
    store.decide('a.one', 'keep');
    expect(store.state.cleanup.has('a.one')).toBe(false);
    store.undoDecision();
    expect(store.state.decisions.get('a.one')?.choice).toBe('unfollow');
    expect(store.state.cleanup.get('a.one')?.state).toBe('confirmed');
    expect(store.state.ui.cursorId).toBe('a.one');
  });

  it('returns a deferred or uncertain account to the active queue when re-cut', () => {
    const store = new FollowCutStore({ storage: new MemoryStorage(), now });
    store.importDataset(candidate(['a.one']));
    store.decide('a.one', 'unfollow');
    store.skipAccount('a.one');
    expect(store.state.cleanup.get('a.one')?.state).toBe('skipped');
    store.decide('a.one', 'unfollow');
    expect(store.state.cleanup.get('a.one')?.state).toBe('queued');
    expect(store.state.cleanup.get('a.one')?.deferredAt).toBeUndefined();
    store.markUncertain('a.one');
    expect(store.state.cleanup.get('a.one')?.state).toBe('uncertain');
    store.decide('a.one', 'unfollow');
    expect(store.state.cleanup.get('a.one')?.state).toBe('queued');
  });

  it('opens a reviewed-state filter to its first card instead of an empty deck', () => {
    const store = new FollowCutStore({ storage: new MemoryStorage(), now });
    store.importDataset(candidate(['a.one', 'b.two']));
    store.decide('a.one', 'maybe');
    store.decide('b.two', 'keep');
    store.setFilter('maybe');
    expect(store.state.ui.cursorId).toBe('a.one');
    store.setFilter('keep');
    expect(store.state.ui.cursorId).toBe('b.two');
  });

  it('clears the session but keeps appearance preferences', () => {
    const memory = new MemoryStorage();
    const store = new FollowCutStore({ storage: memory, now });
    store.importDataset(candidate(['a.one']));
    store.setTheme('light');
    store.setMotion('reduce');
    store.setGoal(1500);
    store.clearSession();
    expect(store.state.dataset).toBeNull();
    expect(store.state.decisions.size).toBe(0);
    expect(store.state.settings.theme).toBe('light');
    expect(store.state.settings.motion).toBe('reduce');
    expect(store.state.settings.goal).toBeNull();
    expect(store.state.ui.view).toBe('welcome');
    expect(memory.map.has('followcut:v1:dataset')).toBe(false);
    expect(memory.map.has('followcut:v1:session')).toBe(false);
  });

  it('reports a save failure instead of throwing', () => {
    const memory = new MemoryStorage();
    const store = new FollowCutStore({ storage: memory, now });
    memory.failWrites = true;
    store.importDataset(candidate(['a.one']));
    expect(store.state.storageWarning).toMatch(/Could not save/i);
    expect(store.state.dataset?.accounts).toHaveLength(1);
  });

  it('starts clean when stored data cannot be read', () => {
    const memory = new MemoryStorage();
    memory.setItem('followcut:v1:dataset', JSON.stringify({ v: 1, dataset: { accounts: [] } }));
    const store = new FollowCutStore({ storage: memory, now });
    expect(store.state.dataset).toBeNull();
    expect(store.state.storageWarning).toMatch(/could not be read/i);
  });

  it('previews and merges a newer snapshot without moving renamed decisions', () => {
    const memory = new MemoryStorage();
    const store = new FollowCutStore({ storage: memory, now });
    store.importDataset(candidate(['a.one', 'b.two', 'c.three', 'd.four', 'e.five'], ['a.one', 'b.two']));
    store.decide('a.one', 'keep');
    store.decide('b.two', 'unfollow');
    store.confirmUnfollow('b.two');
    store.decide('c.three', 'unfollow');
    store.decide('d.four', 'maybe');
    const next = candidate(['c.three', 'd.four', 'e.five', 'new.one'], ['c.three', 'd.four', 'e.five']);
    const preview = store.previewMerge(next);
    expect(preview.oldFollowing).toBe(5);
    expect(preview.newFollowing).toBe(4);
    expect(preview.removed).toBe(2);
    expect(preview.added).toBe(1);
    expect(preview.decisionsPreserved).toBe(2);
    expect(preview.decisionsDropped).toBe(2);
    expect(preview.confirmationsArchived).toBe(1);

    const merged = store.mergeDataset(next);
    expect(merged.confirmationsArchived).toBe(1);
    expect(store.state.dataset?.accounts.map(a => a.id)).toEqual(['c.three', 'd.four', 'e.five', 'new.one']);
    expect(store.state.decisions.has('a.one')).toBe(false);
    expect(store.state.decisions.has('b.two')).toBe(false);
    expect(store.state.decisions.get('c.three')?.choice).toBe('unfollow');
    expect(store.state.decisions.get('d.four')?.choice).toBe('maybe');
    expect(store.state.cleanup.has('b.two')).toBe(false);
    expect(store.state.history.confirmations).toHaveLength(1);
    expect(store.state.history.confirmations[0].username).toBe('b.two');
    expect(store.state.history.snapshots).toHaveLength(1);
    expect(store.state.history.snapshots[0].followingCount).toBe(5);
  });

  it('warns when a new snapshot is dated earlier', () => {
    const store = new FollowCutStore({ storage: new MemoryStorage(), now });
    store.importDataset(candidate(['a.one'], [], { exportedAt: '2026-10-20T00:00:00.000Z' }));
    const preview = store.previewMerge(candidate(['a.one'], [], { exportedAt: '2026-10-01T00:00:00.000Z' }));
    expect(preview.warnings.join(' ')).toMatch(/earlier/i);
  });

  it('round-trips a portable backup and rejects the wrong format', () => {
    const store = new FollowCutStore({ storage: new MemoryStorage(), now });
    store.importDataset(candidate(['a.one', 'b.two'], ['b.two']));
    store.decide('a.one', 'unfollow');
    store.confirmUnfollow('a.one');
    store.setNote('a.one', 'Old brand account');
    store.setGoal(900);
    const backup = store.exportBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toMatch(/PK\\x03\\x04/);
    const parsed = parseBackup(text, NOW);
    expect(parsed.dataset.accounts).toHaveLength(2);
    expect(parsed.decisions.size).toBe(1);
    expect(parsed.cleanup.get('a.one')?.state).toBe('confirmed');
    expect(parsed.settings.goal).toBe(900);

    const second = new FollowCutStore({ storage: new MemoryStorage(), now });
    second.restoreBackupText(text);
    expect(second.state.dataset?.accounts).toHaveLength(2);
    expect(second.state.cleanup.get('a.one')?.state).toBe('confirmed');
    expect(second.state.ui.view).toBe('dashboard');

    expect(() => parseBackup(JSON.stringify({ format: 'not-followcut', version: 1, data: {} }), NOW)).toThrow(/not a FOLLOW\/CUT/i);
    expect(() => buildBackup({ ...parsed, dataset: parsed.dataset })).not.toThrow();
  });

  it('rebuilds profile URLs and drops unknown decisions when restoring', () => {
    const store = new FollowCutStore({ storage: new MemoryStorage(), now });
    store.importDataset(candidate(['a.one', 'b.two']));
    store.decide('a.one', 'keep');
    const raw = store.exportBackup();
    raw.data.dataset.accounts[0].profileUrl = 'https://evil.example/attacker';
    raw.data.decisions.push(['not.in.snapshot', { choice: 'unfollow', favorite: false, protected: false, updatedAt: NOW.toISOString() }]);
    const parsed = parseBackup(JSON.stringify(raw), NOW);
    expect(parsed.dataset.accounts.find(a => a.id === 'a.one')?.profileUrl).toBe('https://www.instagram.com/a.one/');
    expect(parsed.decisions.has('not.in.snapshot')).toBe(false);
  });

  it('does not pollute Object.prototype from a hostile backup key', () => {
    const store = new FollowCutStore({ storage: new MemoryStorage(), now });
    store.importDataset(candidate(['a.one']));
    const raw = store.exportBackup();
    raw.data.dataset.accounts = [{
      id: '__proto__',
      username: '__proto__',
      display: '__proto__',
      profileUrl: 'https://www.instagram.com/__proto__/'
    }];
    raw.data.dataset.snapshot.followingCount = 1;
    raw.data.decisions = [['__proto__', { choice: 'keep', favorite: false, protected: false, updatedAt: NOW.toISOString() }]];
    raw.data.cleanup = [];
    const parsed = parseBackup(JSON.stringify(raw), NOW);
    expect(parsed.decisions.get('__proto__')?.choice).toBe('keep');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('persists settings and ui independently of the dataset', () => {
    const memory = new MemoryStorage();
    const store = new FollowCutStore({ storage: memory, now });
    store.setTheme('light');
    store.setMotion('reduce');
    const second = new FollowCutStore({ storage: memory, now });
    expect(second.state.settings.theme).toBe('light');
    expect(second.state.settings.motion).toBe('reduce');
    expect(second.state.dataset).toBeNull();
    expect(second.state.ui.view).toBe('welcome');
  });
});
