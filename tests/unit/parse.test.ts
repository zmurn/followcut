import { describe, expect, it } from 'vitest';
import { analyzeTextSources, analyzeUploads, normalizeUsername, buildProfileUrl, normalizeTimestamp, classifyName } from '../../src/lib/parse';
import { ImportError } from '../../src/lib/types';
import { getMetrics } from '../../src/lib/selectors';
import { DEFAULT_SETTINGS, DEFAULT_UI, EMPTY_HISTORY } from '../../src/lib/types';
import { exportZip, exportFiles, fixture } from '../helpers/fixtures';
import { makeZip } from '../helpers/zip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXPORT_DIR = 'instagram-demoaccount-2026-10-12/connections/followers_and_following';
const now = new Date('2026-11-02T12:00:00Z');

function source(name: string, text: string) {
  return { name, text };
}

function fixtureSource(name: string) {
  return source(`${EXPORT_DIR}/${name}`, readFileSync(join(process.cwd(), 'tests/fixtures/instagram-export/instagram-demoaccount-2026-10-12/connections/followers_and_following', name), 'utf8'));
}

function readState(dataset: ReturnType<typeof analyzeTextSources>['candidates'][number]) {
  return {
    dataset: {
      snapshot: { ...dataset.snapshot, followingCount: dataset.accounts.length, followerCount: dataset.snapshot.followerData === 'missing' ? undefined : dataset.followers.length },
      accounts: dataset.accounts,
      followers: dataset.followers,
      pending: dataset.pending
    },
    decisions: new Map(),
    cleanup: new Map(),
    profileOpens: new Map(),
    settings: DEFAULT_SETTINGS,
    ui: DEFAULT_UI,
    history: EMPTY_HISTORY
  };
}

describe('Instagram export parsing', () => {
  it('reads a full nested export and separates unrelated files', async () => {
    const analysis = await analyzeUploads([{ name: 'export.zip', bytes: new Uint8Array(exportZip()) }]);
    expect(analysis.candidates).toHaveLength(1);
    const candidate = analysis.candidates[0];
    expect(candidate.accounts).toHaveLength(8);
    expect(candidate.followers).toHaveLength(5);
    expect(candidate.pending).toHaveLength(2);
    expect(candidate.snapshot.followerData).toBe('present');
    expect(candidate.snapshot.pendingCount).toBe(2);
    expect(candidate.snapshot.exportedAt).toBe('2026-10-12T00:00:00.000Z');
    expect(candidate.accounts.map(a => a.id).sort()).toEqual([
      'atlas_studio', 'moss.room', 'new.account', 'paper.press', 'quiet.archive', 'slow.field', 'umber.house', 'zephyr.co'
    ]);
    const atlas = candidate.accounts.find(a => a.id === 'atlas_studio')!;
    expect(atlas.display).toBe('Atlas_Studio');
    expect(atlas.followsMe).toBe(true);
    expect(candidate.accounts.find(a => a.id === 'moss.room')?.followsMe).toBe(false);
    expect(candidate.accounts.find(a => a.id === 'zephyr.co')?.display).toBe('Zephyr.Co');
    const metrics = getMetrics(readState(candidate));
    expect(metrics?.mutuals).toBe(4);
    expect(metrics?.notFollowingBack).toBe(4);
    expect(metrics?.fans).toBe(1);
  });

  it('supports string_list_data, title-only, label_values and string_map_data forms', async () => {
    const analysis = analyzeTextSources([
      fixtureSource('following.json'),
      fixtureSource('following_label_values.json'),
      fixtureSource('followers_1.json'),
      fixtureSource('followers_2.json'),
      fixtureSource('followers_3.json')
    ], { now });
    const candidate = analysis.candidates[0];
    const byId = new Map(candidate.accounts.map(a => [a.id, a]));
    expect(byId.has('new.account')).toBe(true);
    expect(byId.has('umber.house')).toBe(true);
    expect(byId.has('moss.room')).toBe(true);
    expect(byId.get('quiet.archive')?.followedAt).toBe(1600000000);
    expect(byId.get('new.account')?.followedAt).toBe(1700000000);
    expect(byId.get('umber.house')?.followedAt).toBe(1680000000);
  });

  it('deduplicates split followers and renamed copies', () => {
    const following = JSON.stringify({
      relationships_following: [
        { title: 'one.person', string_list_data: [{ value: 'one.person', timestamp: 1600000000 }] },
        { title: 'two.person', string_list_data: [{ value: 'two.person', timestamp: 1610000000 }] }
      ]
    });
    const copy = JSON.stringify({
      relationships_following: [
        { title: 'one.person', string_list_data: [{ value: 'one.person', timestamp: 1600000000 }] },
        { title: 'three.person', string_list_data: [{ value: 'three.person', timestamp: 1620000000 }] }
      ]
    });
    const followers = JSON.stringify([
      { title: '', string_list_data: [{ value: 'one.person' }] },
      { title: '', string_list_data: [{ value: 'one.person' }] }
    ]);
    const analysis = analyzeTextSources([
      source('root/connections/followers_and_following/following.json', following),
      source('root/connections/followers_and_following/following (1).json', copy),
      source('root/connections/followers_and_following/followers_1.json', followers)
    ], { now });
    const candidate = analysis.candidates[0];
    expect(candidate.accounts.map(a => a.id)).toEqual(['one.person', 'three.person', 'two.person']);
    expect(candidate.snapshot.duplicateCount).toBe(1);
    expect(candidate.snapshot.followerCount).toBe(1);
    expect(candidate.warnings.join(' ')).toMatch(/Renamed copies/i);
  });

  it('turns follow-back comparison off when the follower list is missing', () => {
    const analysis = analyzeTextSources([
      fixtureSource('following.json'),
      fixtureSource('following_label_values.json')
    ], { now });
    const candidate = analysis.candidates[0];
    expect(candidate.snapshot.followerData).toBe('missing');
    expect(candidate.accounts.every(a => a.followsMe === undefined)).toBe(true);
    const metrics = getMetrics(readState(candidate));
    expect(metrics?.followers).toBeNull();
    expect(metrics?.ratio).toBeNull();
    expect(metrics?.mutuals).toBeNull();
    expect(metrics?.notFollowingBack).toBeNull();
    expect(metrics?.parityRemaining).toBeNull();
    expect(metrics?.reviewed).toBe(0);
  });

  it('marks an incomplete follower list as incomplete and refuses to guess follow-back', () => {
    const analysis = analyzeTextSources([
      fixtureSource('following.json'),
      fixtureSource('followers_1.json'),
      source(`${EXPORT_DIR}/followers_2.json`, '{ this is broken')
    ], { now });
    const candidate = analysis.candidates[0];
    expect(candidate.snapshot.followerData).toBe('incomplete');
    expect(candidate.accounts.every(a => a.followsMe === undefined)).toBe(true);
    const metrics = getMetrics(readState(candidate));
    expect(metrics?.mutuals).toBeNull();
    expect(metrics?.notFollowingBack).toBeNull();
    expect(metrics?.ratio).toBeNull();
  });

  it('splits multiple account datasets instead of merging them', () => {
    const entries = (name: string) => JSON.stringify({ relationships_following: [{ title: name, string_list_data: [{ value: name }] }] });
    const analysis = analyzeTextSources([
      source('instagram-alice-2026-10-01/connections/followers_and_following/following.json', entries('alice.person')),
      source('instagram-bob-2026-10-02/connections/followers_and_following/following.json', entries('bob.person'))
    ], { now });
    expect(analysis.candidates).toHaveLength(2);
    expect(analysis.candidates.map(c => c.accounts[0].id).sort()).toEqual(['alice.person', 'bob.person']);
    expect(analysis.warnings.join(' ')).toMatch(/not merged/i);
  });

  it('fails safely on an HTML export', () => {
    try {
      analyzeTextSources([source('following.html', fixture('html-export.html'))], { now });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ImportError);
      expect((error as ImportError).code).toBe('HTML_EXPORT');
    }
  });

  it('fails safely on invalid JSON and exposes an anonymized schema report', () => {
    try {
      analyzeTextSources([source('following.json', '{ invalid')], { now });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ImportError);
      const importError = error as ImportError;
      expect(importError.code).toBe('BAD_JSON');
      expect(importError.schema).toBeTruthy();
      const report = JSON.stringify(importError.schema);
      expect(report).not.toMatch(/atlas|quiet|zephyr/i);
      expect(report).toContain('following.json');
      expect(report).toContain('topLevel');
    }
  });

  it('anonymizes file names in schema reports', () => {
    try {
      analyzeTextSources([source('alice-secret-following.json', '{ invalid')], { now });
      throw new Error('expected failure');
    } catch (error) {
      const report = JSON.stringify((error as ImportError).schema);
      expect(report).toContain('following.json');
      expect(report).not.toContain('alice');
      expect(report).not.toContain('secret');
    }
  });

  it('fails with a helpful no-data error', () => {
    try {
      analyzeTextSources([source('notes.json', '{"hello":"world"}')], { now });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ImportError);
      expect((error as ImportError).code).toBe('NO_DATA');
    }
  });

  it('detects an HTML export inside a ZIP', async () => {
    const dir = 'instagram-demo-2026-10-12/connections/followers_and_following/';
    const zip = makeZip([{ name: dir + 'following.html', content: fixture('html-export.html') }]);
    await expect(analyzeUploads([{ name: 'html.zip', bytes: new Uint8Array(zip) }], { now })).rejects.toMatchObject({ code: 'HTML_EXPORT' });
  });

  it('classifies names conservatively', () => {
    expect(classifyName('following.json')).toEqual({ kind: 'following', copy: false });
    expect(classifyName('following (1).json')).toEqual({ kind: 'following', copy: true });
    expect(classifyName("follow_requests_you've_received.json").kind).toBe('skip');
    expect(classifyName('following_hashtags.json').kind).toBe('skip');
    expect(classifyName('pending_follow_requests.json').kind).toBe('pending');
    expect(classifyName('followers_2.json').kind).toBe('followers');
    expect(classifyName('mystery.json').kind).toBeNull();
  });

  it('normalizes usernames and builds safe URLs', () => {
    expect(normalizeUsername(' @Atlas_Studio ')).toBe('Atlas_Studio');
    expect(normalizeUsername('https://www.instagram.com/_u/example_creator')).toBe('example_creator');
    expect(normalizeUsername('https://evil.example/instagram.com/hacker')).toBeNull();
    expect(normalizeUsername('two words')).toBeNull();
    expect(normalizeUsername('../etc/passwd')).toBeNull();
    expect(normalizeUsername('__proto__')).toBe('__proto__');
    expect(buildProfileUrl('quiet.archive')).toBe('https://www.instagram.com/quiet.archive/');
    expect(buildProfileUrl('ümlaut')).toBe('https://www.instagram.com/%C3%BCmlaut/');
  });

  it('normalizes seconds and millisecond timestamps, rejecting nonsense', () => {
    expect(normalizeTimestamp(1719830400, Date.UTC(2026, 10, 2))).toBe(1719830400);
    expect(normalizeTimestamp(1719830400000, Date.UTC(2026, 10, 2))).toBe(1719830400);
    expect(normalizeTimestamp('1719830400', Date.UTC(2026, 10, 2))).toBe(1719830400);
    expect(normalizeTimestamp(0)).toBeUndefined();
    expect(normalizeTimestamp('not a date')).toBeUndefined();
    expect(normalizeTimestamp(999999999999999)).toBeUndefined();
  });

  it('marks duplicates and invalid entries without guessing identities', () => {
    const analysis = analyzeTextSources([
      source('connections/followers_and_following/following.json', JSON.stringify({
        relationships_following: [
          { title: 'dupe', string_list_data: [{ value: 'dupe', timestamp: 1600000000 }] },
          { title: 'dupe', string_list_data: [{ value: 'dupe', timestamp: 1700000000 }] },
          { title: '', string_list_data: [{ value: 'bad username with spaces' }] },
          { title: 'kept.person', string_list_data: [{ value: 'kept.person' }] }
        ]
      })),
      source('connections/followers_and_following/followers_1.json', '[]')
    ], { now });
    const candidate = analysis.candidates[0];
    expect(candidate.accounts.map(a => a.id)).toEqual(['dupe', 'kept.person']);
    expect(candidate.snapshot.duplicateCount).toBe(1);
    expect(candidate.snapshot.invalidCount).toBe(1);
    expect(candidate.snapshot.followerData).toBe('incomplete');
  });

  it('reads a ZIP with follower files in any order', async () => {
    const dir = 'instagram-demoaccount-2026-10-12/connections/followers_and_following/';
    const files = exportFiles();
    files.sort((a, b) => b.name.localeCompare(a.name));
    const zip = makeZip(files);
    const analysis = await analyzeUploads([{ name: 'export.zip', bytes: new Uint8Array(zip) }], { now });
    expect(analysis.candidates[0].followers).toHaveLength(5);
    expect(analysis.candidates[0].accounts).toHaveLength(8);
  });
});
