import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../../src/lib/demo';
import {
  accountIndex,
  countForFilter,
  currentAccount,
  deckInfo,
  getConfirmed,
  getMetrics,
  getOther,
  getQueue,
  nextUnreviewedAfter,
  orderedIds,
  statusFor,
  type ReadState
} from '../../src/lib/selectors';
import {
  DEFAULT_SETTINGS,
  DEFAULT_UI,
  EMPTY_HISTORY,
  type Cleanup,
  type Dataset,
  type Decision
} from '../../src/lib/types';

const NOW = '2026-11-02T12:00:00.000Z';
const dataset = buildDemoDataset(new Date(NOW));

function state(overrides: Partial<ReadState> = {}): ReadState {
  return {
    dataset,
    decisions: new Map(),
    cleanup: new Map(),
    profileOpens: new Map(),
    settings: { ...DEFAULT_SETTINGS },
    ui: { ...DEFAULT_UI },
    history: { ...EMPTY_HISTORY },
    ...overrides
  };
}

function decision(choice: Decision['choice'] = 'unfollow', extra: Partial<Decision> = {}): Decision {
  return {
    choice,
    favorite: false,
    protected: false,
    reviewedAt: NOW,
    updatedAt: NOW,
    ...extra
  };
}

function cleanup(stateName: Cleanup['state'] = 'queued'): Cleanup {
  const record: Cleanup = { state: stateName, queuedAt: NOW, updatedAt: NOW };
  if (stateName === 'confirmed') record.confirmedAt = NOW;
  if (stateName === 'skipped') record.deferredAt = NOW;
  if (stateName === 'profiled') record.profileOpenedAt = NOW;
  return record;
}

function applyUnfollow(count: number, options: { confirm?: number; uncertain?: number } = {}) {
  const decisions = new Map<string, Decision>();
  const cleanupMap = new Map<string, Cleanup>();
  dataset.accounts.slice(0, count).forEach((account, index) => {
    decisions.set(account.id, decision('unfollow'));
    const confirmed = index < (options.confirm ?? 0);
    const uncertain = !confirmed && index < (options.confirm ?? 0) + (options.uncertain ?? 0);
    cleanupMap.set(account.id, cleanup(confirmed ? 'confirmed' : uncertain ? 'uncertain' : 'queued'));
  });
  return state({ decisions, cleanup: cleanupMap });
}

describe('numerical integrity', () => {
  it('matches the brief baseline exactly', () => {
    const metrics = getMetrics(state())!;
    expect(metrics.following).toBe(1733);
    expect(metrics.followers).toBe(1336);
    expect(metrics.ratio?.toFixed(2)).toBe('0.77');
    expect(metrics.mutuals).toBe(1200);
    expect(metrics.notFollowingBack).toBe(533);
    expect(metrics.fans).toBe(136);
    expect(metrics.parityRemaining).toBe(397);
    expect(metrics.reviewed).toBe(0);
    expect(metrics.confirmedCurrent).toBe(0);
    expect(metrics.estimatedFollowing).toBe(1733);
  });

  it('marking 100 accounts for cut does not count as unfollowing', () => {
    const metrics = getMetrics(applyUnfollow(100))!;
    expect(metrics.reviewed).toBe(100);
    expect(metrics.planned).toBe(100);
    expect(metrics.pendingQueue).toBe(100);
    expect(metrics.confirmedCurrent).toBe(0);
    expect(metrics.estimatedFollowing).toBe(1733);
    expect(metrics.projectedFollowing).toBe(1633);
    expect(metrics.parityRemaining).toBe(397);
    expect(metrics.cleanupProgress).toBe(0);
    expect(metrics.snapshot.followingCount).toBe(1733);
    expect(metrics.snapshot.followerCount).toBe(1336);
  });

  it('confirming 100 removals shows an estimated following of 1,633 while the snapshot remains 1,733', () => {
    const metrics = getMetrics(applyUnfollow(100, { confirm: 100 }))!;
    expect(metrics.confirmedCurrent).toBe(100);
    expect(metrics.pendingQueue).toBe(0);
    expect(metrics.estimatedFollowing).toBe(1633);
    expect(metrics.projectedFollowing).toBe(1633);
    expect(metrics.parityRemaining).toBe(297);
    expect(metrics.snapshot.followingCount).toBe(1733);
    expect(metrics.snapshot.followerCount).toBe(1336);
    expect(metrics.ratio?.toFixed(2)).toBe('0.77');
    expect(metrics.estimatedRatio?.toFixed(3)).toBe('0.818');
    expect(metrics.cleanupProgress).toBe(1);
  });

  it('keeps confirmed, pending and projected counts distinct', () => {
    const metrics = getMetrics(applyUnfollow(100, { confirm: 40, uncertain: 10 }))!;
    expect(metrics.reviewed).toBe(100);
    expect(metrics.planned).toBe(100);
    expect(metrics.confirmedCurrent).toBe(40);
    expect(metrics.uncertain).toBe(10);
    expect(metrics.pendingQueue).toBe(50);
    expect(metrics.estimatedFollowing).toBe(1693);
    expect(metrics.projectedFollowing).toBe(1643);
    expect(metrics.parityRemaining).toBe(357);
    expect(metrics.cleanupProgress).toBeCloseTo(40 / 100);
  });

  it('computes goal remaining from confirmed removals only', () => {
    const metrics = getMetrics({
      ...applyUnfollow(100, { confirm: 100 }),
      settings: { ...DEFAULT_SETTINGS, goal: 1500 }
    })!;
    expect(metrics.goalRemaining).toBe(133);
    const planned = getMetrics({
      ...applyUnfollow(100, { confirm: 0 }),
      settings: { ...DEFAULT_SETTINGS, goal: 1500 }
    })!;
    expect(planned.goalRemaining).toBe(233);
  });

  it('counts archived confirmations separately and never double-subtracts them', () => {
    const base = applyUnfollow(10, { confirm: 10 });
    const metrics = getMetrics({
      ...base,
      history: { confirmations: [{ username: 'old.one', confirmedAt: NOW, snapshotId: 'old' }, { username: 'old.two', confirmedAt: NOW, snapshotId: 'old' }], snapshots: [] }
    })!;
    expect(metrics.confirmedCurrent).toBe(10);
    expect(metrics.confirmedArchived).toBe(2);
    expect(metrics.confirmedAllTime).toBe(12);
    expect(metrics.estimatedFollowing).toBe(1723);
  });

  it('ignores decisions for accounts that are not in the snapshot', () => {
    const base = state();
    base.decisions.set('not.in.this.snapshot', decision('unfollow'));
    base.cleanup.set('not.in.this.snapshot', cleanup('confirmed'));
    const metrics = getMetrics(base)!;
    expect(metrics.planned).toBe(0);
    expect(metrics.confirmedCurrent).toBe(0);
    expect(metrics.reviewed).toBe(0);
  });

  it('does not let filters change the totals', () => {
    const filtered = state({ ui: { ...DEFAULT_UI, filter: 'notBack', query: 'grove' } });
    const metrics = getMetrics(filtered)!;
    expect(metrics.following).toBe(1733);
    expect(metrics.reviewed).toBe(0);
    expect(countForFilter(filtered, 'notBack')).toBeLessThan(533);
    expect(countForFilter(filtered, 'all')).toBeLessThan(1733);
  });

  it('disables comparison metrics when follower data is missing or incomplete', () => {
    const dataset2: Dataset = {
      ...dataset,
      snapshot: { ...dataset.snapshot, followerData: 'missing', followerCount: undefined },
      followers: []
    };
    const metrics = getMetrics(state({ dataset: dataset2 }))!;
    expect(metrics.followers).toBeNull();
    expect(metrics.ratio).toBeNull();
    expect(metrics.mutuals).toBeNull();
    expect(metrics.notFollowingBack).toBeNull();
    expect(metrics.parityRemaining).toBeNull();
    expect(metrics.estimatedRatio).toBeNull();
    expect(getMetrics(state())!.ratio).not.toBeNull();
  });
});

describe('queue, filters and cursor', () => {
  it('keeps confirmed and uncertain out of the pending queue', () => {
    const base = state();
    const [a, b, c, d, e] = dataset.accounts;
    base.decisions.set(a.id, decision('unfollow'));
    base.cleanup.set(a.id, { ...cleanup('queued'), queuedAt: '2026-11-01T10:00:00.000Z' });
    base.decisions.set(b.id, decision('unfollow'));
    base.cleanup.set(b.id, cleanup('skipped'));
    base.decisions.set(c.id, decision('unfollow'));
    base.cleanup.set(c.id, { ...cleanup('profiled'), queuedAt: '2026-11-01T12:00:00.000Z' });
    base.decisions.set(d.id, decision('unfollow'));
    base.cleanup.set(d.id, cleanup('confirmed'));
    base.decisions.set(e.id, decision('unfollow'));
    base.cleanup.set(e.id, cleanup('uncertain'));
    const queue = getQueue(base);
    expect(queue.map(item => item.account.id)).toEqual([a.id, c.id, b.id]);
    expect(queue[2].deferred).toBe(true);
    expect(getConfirmed(base).map(item => item.account.id)).toEqual([d.id]);
    expect(getOther(base).map(item => item.account.id).sort()).toEqual([b.id, e.id].sort());
  });

  it('advances to the next unreviewed card and wraps only when needed', () => {
    const tinyDataset: Dataset = {
      ...dataset,
      accounts: ['a.one', 'b.two', 'c.three', 'd.four'].map((id, index) => ({
        id,
        username: id,
        display: id,
        profileUrl: `https://www.instagram.com/${id}/`,
        followedAt: 1600000000 + index
      })).sort((a, b) => a.id.localeCompare(b.id))
    };
    const base = state({ dataset: tinyDataset, ui: { ...DEFAULT_UI, sort: 'az' } });
    const order = orderedIds(base);
    expect(order).toEqual(['a.one', 'b.two', 'c.three', 'd.four']);
    expect(nextUnreviewedAfter(base, 'a.one', order)).toBe('b.two');
    base.decisions.set('b.two', decision('keep'));
    base.decisions.set('c.three', decision('keep'));
    base.decisions.set('d.four', decision('keep'));
    expect(nextUnreviewedAfter(base, 'd.four', order)).toBe('a.one');
    base.decisions.set('a.one', decision('keep'));
    expect(nextUnreviewedAfter(base, 'd.four', order)).toBeNull();
  });

  it('resumes at the persisted cursor and exposes position', () => {
    const ids = orderedIds(state());
    const cursor = ids[10];
    const info = deckInfo(state({ ui: { ...DEFAULT_UI, cursorId: cursor } }));
    expect(info.current?.id).toBe(cursor);
    expect(info.index).toBe(11);
    expect(currentAccount(state({ ui: { ...DEFAULT_UI, cursorId: 'missing' } }))?.id).toBe(ids[0]);
  });

  it('labels states without conflating plans and confirmations', () => {
    const base = state();
    const account = dataset.accounts[0];
    expect(statusFor(base, account).label).toBe('Unreviewed');
    base.decisions.set(account.id, decision('unfollow'));
    expect(statusFor(base, account).label).toBe('Cut · in queue');
    expect(statusFor(base, account).detail).toMatch(/Not unfollowed/i);
    base.cleanup.set(account.id, cleanup('confirmed'));
    expect(statusFor(base, account).label).toBe('Cut · confirmed');
    base.decisions.set(account.id, decision('keep'));
    expect(statusFor(base, account).label).toBe('Kept');
  });

  it('counts filter chips against the current query', () => {
    const target = dataset.accounts[0].id;
    const filtered = state({ ui: { ...DEFAULT_UI, query: target } });
    expect(countForFilter(filtered, 'all')).toBeGreaterThanOrEqual(1);
    expect(countForFilter(filtered, 'unreviewed')).toBe(1);
    const missing: ReadState = {
      ...state(),
      dataset: { ...dataset, snapshot: { ...dataset.snapshot, followerData: 'missing' }, followers: [] }
    };
    expect(countForFilter(missing, 'notBack')).toBe(0);
  });

  it('has a stable account index', () => {
    expect(accountIndex(dataset).size).toBe(1733);
    expect(accountIndex(dataset).get(dataset.accounts[0].id)).toBe(dataset.accounts[0]);
  });
});
