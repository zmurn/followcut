import { describe, expect, it } from 'vitest';
import { buildDemoDataset, DEMO_FOLLOWERS, DEMO_FOLLOWING } from '../../src/lib/demo';
import { getMetrics } from '../../src/lib/selectors';
import { DEFAULT_SETTINGS, DEFAULT_UI, EMPTY_HISTORY } from '../../src/lib/types';

describe('demo dataset', () => {
  it('has the promised scale and unique identities', () => {
    const dataset = buildDemoDataset(new Date('2026-11-02T15:00:00Z'));
    expect(dataset.accounts).toHaveLength(DEMO_FOLLOWING);
    expect(new Set(dataset.accounts.map(a => a.id)).size).toBe(DEMO_FOLLOWING);
    expect(dataset.followers).toHaveLength(DEMO_FOLLOWERS);
    const metrics = getMetrics({
      dataset,
      decisions: new Map(),
      cleanup: new Map(),
      profileOpens: new Map(),
      settings: DEFAULT_SETTINGS,
      ui: DEFAULT_UI,
      history: EMPTY_HISTORY
    });
    expect(metrics?.mutuals).toBe(1200);
    expect(metrics?.notFollowingBack).toBe(533);
    expect(metrics?.parityRemaining).toBe(397);
    expect(metrics?.ratio?.toFixed(2)).toBe('0.77');
  });
});
