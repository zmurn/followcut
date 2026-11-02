import { describe, expect, it } from 'vitest';
import { readExportZip, safeZipPath, DEFAULT_ZIP_LIMITS } from '../../src/lib/zip';
import { makeZip } from '../helpers/zip';

const dir = 'instagram-demo-2026-10-12/connections/followers_and_following/';

describe('safe ZIP handling', () => {
  it('reads stored and deflated JSON entries', async () => {
    const zip = makeZip([
      { name: dir + 'following.json', content: '{"relationships_following":[]}', method: 0 },
      { name: dir + 'followers_1.json', content: '[]', method: 8 },
      { name: dir + 'photo.jpg', content: 'not parsed' }
    ]);
    const result = await readExportZip(new Uint8Array(zip));
    expect(result.files.map(f => f.name)).toEqual([
      dir + 'following.json',
      dir + 'followers_1.json'
    ]);
    expect(result.files[0].text).toContain('relationships_following');
    expect(result.entryCount).toBe(3);
  });

  it('rejects encrypted archives', async () => {
    const zip = makeZip([{ name: dir + 'following.json', content: '{}', flags: 0x0801 }]);
    await expect(readExportZip(new Uint8Array(zip))).rejects.toMatchObject({ code: 'ZIP_ENCRYPTED' });
  });

  it('rejects an archive that is not a ZIP', async () => {
    await expect(readExportZip(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toMatchObject({ code: 'ZIP_INVALID' });
  });

  it('rejects a CRC mismatch', async () => {
    const zip = makeZip([{ name: dir + 'following.json', content: '{"relationships_following":[]}', lieCrc: 123 }]);
    await expect(readExportZip(new Uint8Array(zip))).rejects.toMatchObject({ code: 'ZIP_CORRUPT' });
  });

  it('rejects an entry over the per-file uncompressed limit before inflating it', async () => {
    const zip = makeZip([{ name: dir + 'following.json', content: '{}', lieUncompressedSize: DEFAULT_ZIP_LIMITS.maxEntryBytes + 1 }]);
    await expect(readExportZip(new Uint8Array(zip))).rejects.toMatchObject({ code: 'ZIP_TOO_LARGE' });
  });

  it('enforces the entry count limit', async () => {
    const zip = makeZip([
      { name: dir + 'following.json', content: '{}' },
      { name: dir + 'followers_1.json', content: '[]' },
      { name: dir + 'followers_2.json', content: '[]' }
    ]);
    await expect(readExportZip(new Uint8Array(zip), { ...DEFAULT_ZIP_LIMITS, maxEntries: 2 })).rejects.toMatchObject({ code: 'ZIP_TOO_LARGE' });
  });

  it('refuses ZIP64 declarations', async () => {
    const zip = makeZip([{ name: dir + 'following.json', content: '{}' }]);
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    zip.writeUInt16LE(0xffff, eocd + 10);
    await expect(readExportZip(new Uint8Array(zip))).rejects.toMatchObject({ code: 'ZIP64_UNSUPPORTED' });
  });

  it('never extracts paths with traversal segments', async () => {
    expect(safeZipPath('../evil/following.json')).toBeNull();
    expect(safeZipPath('/absolute/following.json')).toBeNull();
    expect(safeZipPath('C:/windows/following.json')).toBeNull();
    expect(safeZipPath('instagram/./connections/following.json')).toBe('instagram/connections/following.json');
    const zip = makeZip([
      { name: '../evil/following.json', content: '{"relationships_following":[]}' },
      { name: dir + 'followers_1.json', content: '[]' }
    ]);
    const result = await readExportZip(new Uint8Array(zip));
    expect(result.files.map(f => f.name)).toEqual([dir + 'followers_1.json']);
  });
});
