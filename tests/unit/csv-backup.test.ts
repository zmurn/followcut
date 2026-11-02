import { describe, expect, it } from 'vitest';
import { FollowCutStore, type StorageLike } from '../../src/lib/store';
import { buildDecisionsCsv, buildQueueCsv, buildQueueJson } from '../../src/lib/csv';
import { parseBackup, sanitizeDataset, sanitizeStoredUi } from '../../src/lib/backup';
import { buildProfileUrl } from '../../src/lib/parse';
import { DEFAULT_UI, type DatasetCandidate } from '../../src/lib/types';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}

const NOW = new Date('2026-11-02T12:00:00Z');
const now = () => NOW;

function candidate(ids: string[]): DatasetCandidate {
  const accounts = ids.map((id, index) => ({
    id,
    username: id,
    display: id,
    profileUrl: buildProfileUrl(id),
    followedAt: 1600000000 + index,
    followsMe: index % 2 === 0
  }));
  return {
    label: 'Fixture',
    snapshot: {
      id: 'snap_fixture',
      importedAt: NOW.toISOString(),
      exportedAt: '2026-10-12T00:00:00.000Z',
      exportDateSource: 'filename',
      sourceLabel: 'Fixture',
      followingCount: accounts.length,
      followerCount: accounts.length,
      followerData: 'present',
      pendingCount: 0,
      warnings: []
    },
    accounts,
    followers: accounts.map(a => a.id),
    pending: [],
    warnings: []
  };
}

function setup() {
  const store = new FollowCutStore({ storage: new MemoryStorage(), now });
  store.importDataset(candidate(['note.person', 'second.person', 'third.person']));
  store.decide('note.person', 'unfollow');
  store.setNote('note.person', '=FORMULA(), "quotes"\nand a newline');
  store.decide('second.person', 'unfollow');
  store.confirmUnfollow('second.person');
  store.decide('third.person', 'unfollow');
  store.skipAccount('third.person');
  return store;
}

describe('CSV and JSON exports', () => {
  it('escapes notes and neutralizes spreadsheet formulas', () => {
    const store = setup();
    const csv = buildDecisionsCsv(store.state);
    expect(csv.startsWith('\uFEFFusername,profile_url')).toBe(true);
    expect(csv).toContain("'=FORMULA()");
    expect(csv).toContain('"\'=FORMULA(), ""quotes""');
    expect(csv).toContain('https://www.instagram.com/note.person/');
    expect(csv).toContain('Not following back');
  });

  it('lists skipped and confirmed rows once each', () => {
    const store = setup();
    const csv = buildQueueCsv(store.state);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines.filter(line => line.includes('third.person')).length).toBe(1);
    expect(lines.filter(line => line.includes('second.person')).length).toBe(1);
    expect(lines.filter(line => line.includes('note.person')).length).toBe(1);
    expect(lines[0]).toContain('cleanup_state');
  });

  it('produces a JSON cleanup plan with explicit summary', () => {
    const store = setup();
    const json = JSON.parse(buildQueueJson(store.state));
    expect(json.app).toBe('FOLLOW/CUT');
    expect(json.summary.planned).toBe(3);
    expect(json.summary.confirmed_current).toBe(1);
    expect(json.summary.pending).toBe(2);
    expect(json.confirmed).toHaveLength(1);
    expect(json.skipped_or_uncertain).toHaveLength(1);
    expect(json.queue).toHaveLength(2);
    expect(json.snapshot.demo).toBe(false);
  });
});

describe('backup sanitation', () => {
  it('recomputes counts and follow-back from actual data', () => {
    const dataset = sanitizeDataset({
      accounts: [
        { id: 'a.one', username: 'a.one', display: 'A.One', profileUrl: 'https://evil.example/' },
        { id: 'b.two', username: 'b.two', display: 'b.two' }
      ],
      followers: ['a.one', 'b.two'],
      pending: ['request.one'],
      snapshot: { followerData: 'present', followingCount: 999, followerCount: 999 }
    }, NOW);
    expect(dataset.accounts).toHaveLength(2);
    expect(dataset.accounts[0].profileUrl).toBe('https://www.instagram.com/a.one/');
    expect(dataset.accounts[0].followsMe).toBe(true);
    expect(dataset.snapshot.followingCount).toBe(2);
    expect(dataset.snapshot.followerCount).toBe(2);
    expect(dataset.snapshot.pendingCount).toBe(1);
  });

  it('drops decisions for accounts absent from the dataset and cleanup for non-cuts', () => {
    const store = setup();
    const raw = store.exportBackup();
    raw.data.cleanup.push(['second.person', { state: 'queued', queuedAt: NOW.toISOString(), updatedAt: NOW.toISOString() }]);
    raw.data.decisions.push(['ghost.account', { choice: 'keep', favorite: false, protected: false, updatedAt: NOW.toISOString() }]);
    // second.person is confirmed; a queued record overwrites it only in raw data order.
    const parsed = parseBackup(JSON.stringify(raw), NOW);
    expect(parsed.decisions.has('ghost.account')).toBe(false);
    expect(parsed.cleanup.get('second.person')?.state).toBe('queued');
    // A keep decision cannot retain cleanup.
    const keepRaw = store.exportBackup();
    keepRaw.data.decisions = [['second.person', { choice: 'keep', favorite: false, protected: false, reviewedAt: NOW.toISOString(), updatedAt: NOW.toISOString() }]];
    const keepParsed = parseBackup(JSON.stringify(keepRaw), NOW);
    expect(keepParsed.cleanup.has('second.person')).toBe(false);
  });

  it('resets an incompatible filter when follower data is missing', () => {
    const dataset = sanitizeDataset({
      accounts: [{ id: 'a.one', username: 'a.one', display: 'a.one' }],
      followers: [],
      snapshot: { followerData: 'missing' }
    }, NOW);
    const ui = sanitizeStoredUi({ ...DEFAULT_UI, filter: 'notBack' }, dataset);
    expect(ui.filter).toBe('all');
  });
});
