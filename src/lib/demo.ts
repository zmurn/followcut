import type { Account, Dataset } from './types';
import { buildProfileUrl } from './parse';

/**
 * Fictional demo data. Every handle is generated from ordinary words; the
 * numbers mirror the brief's example (1,733 following / 1,336 followers /
 * 397 needed for 1:1) so the whole flow can be exercised without a private
 * export. This dataset is never described as real Instagram data.
 */
const ADJECTIVES = [
  'quiet', 'paper', 'slow', 'north', 'amber', 'tidal', 'brass', 'linen', 'orbit', 'moss',
  'cobalt', 'saffron', 'willow', 'copper', 'harbor', 'meadow', 'signal', 'velvet', 'cedar', 'drift',
  'ember', 'fern', 'grove', 'hollow', 'ivory', 'juniper', 'kite', 'lantern', 'lumen', 'maple',
  'nectar', 'opal', 'prairie', 'quartz', 'river', 'solstice', 'thistle', 'umber', 'vesper', 'wren',
  'yarrow', 'zephyr', 'alto', 'bramble', 'cinder', 'dune', 'echo', 'flint', 'gale', 'haze',
  'inlet', 'jasper', 'kelp', 'loam', 'mica', 'nova', 'ochre', 'pike', 'quill', 'rune',
  'sage', 'tide', 'vale', 'wisp', 'yew', 'zenith', 'atlas', 'basalt', 'coral', 'delta',
  'elm', 'frost', 'glint', 'heath', 'iris', 'jade', 'knoll', 'lark', 'marsh', 'nimbus'
];

const NOUNS = [
  'archive', 'tuesday', 'field', 'studio', 'press', 'index', 'note', 'frame', 'circle', 'margin',
  'column', 'atlas', 'house', 'garden', 'works', 'club', 'shop', 'room', 'club', 'post',
  'journal', 'edition', 'chapter', 'page', 'folio', 'studio', 'workshop', 'library', 'shelf', 'signal',
  'record', 'catalog', 'ledger', 'book', 'draft', 'proof', 'plate', 'print', 'ink', 'type',
  'photo', 'lens', 'camera', 'darkroom', 'lab', 'desk', 'table', 'chair', 'window', 'door',
  'street', 'corner', 'block', 'square', 'park', 'hill', 'coast', 'island', 'river', 'lake',
  'trail', 'path', 'bridge', 'tower', 'loft', 'attic', 'cellar', 'yard', 'gate', 'court',
  'market', 'cafe', 'kitchen', 'bakery', 'bench', 'shed', 'barn', 'mill', 'forge', 'kiln'
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function handles(count: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const nouns = [...new Set(NOUNS)];
  const adjectives = [...new Set(ADJECTIVES)];
  for (const noun of nouns) {
    for (const adjective of adjectives) {
      const handle = `${adjective}.${noun}`;
      if (seen.has(handle)) continue;
      seen.add(handle);
      out.push(handle);
      if (out.length >= count) return out;
    }
  }
  if (out.length < count) throw new Error('Demo data needs more unique handles.');
  return out;
}

export function buildDemoDataset(now = new Date()): Dataset {
  const FOLLOWING = 1733;
  const FOLLOWERS = 1336;
  const MUTUALS = 1200;
  const all = handles(FOLLOWING + (FOLLOWERS - MUTUALS));
  const followingHandles = all.slice(0, FOLLOWING);
  const fanHandles = all.slice(FOLLOWING, FOLLOWING + (FOLLOWERS - MUTUALS));
  const random = mulberry32(0x5eed1234);
  const base = Date.UTC(2013, 0, 1);

  const accounts: Account[] = followingHandles.map((handle, index) => {
    const account: Account = {
      id: handle,
      username: handle,
      display: handle,
      profileUrl: buildProfileUrl(handle),
      followsMe: index < MUTUALS
    };
    // Leave a few dates absent, like a real export can.
    if (index % 17 !== 0) {
      const days = Math.floor(random() * 4745);
      account.followedAt = Math.floor((base + days * 86_400_000) / 1000);
    }
    return account;
  });
  accounts.sort((a, b) => a.id.localeCompare(b.id, 'en'));

  const followers = [...followingHandles.slice(0, MUTUALS), ...fanHandles].sort((a, b) => a.localeCompare(b, 'en'));

  return {
    snapshot: {
      id: 'snap_demo_v1',
      importedAt: now.toISOString(),
      exportedAt: '2026-10-18T00:00:00.000Z',
      exportDateSource: 'filename',
      sourceLabel: 'Demo deck — fictional accounts',
      followingCount: FOLLOWING,
      followerCount: FOLLOWERS,
      followerData: 'present',
      pendingCount: 0,
      warnings: ['Demo data. These accounts are fictional and are not on Instagram.'],
      demo: true
    },
    accounts,
    followers,
    pending: []
  };
}

export const DEMO_FOLLOWING = 1733;
export const DEMO_FOLLOWERS = 1336;
export const DEMO_PARITY_GAP = 397;
