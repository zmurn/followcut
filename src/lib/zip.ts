/**
 * A small, defensive ZIP reader for Instagram exports.
 *
 * It reads the central directory, supports stored + deflate entries, verifies
 * CRCs, and refuses encrypted, ZIP64, oversized, or path-traversing archives.
 * Nothing is written to disk and nothing is executed. Adapted in spirit (and
 * in some parser ideas) from IG Cleanup Tool's browser ZIP reader, MIT licensed,
 * Copyright (c) 2026 Mahmood Saeed. See THIRD_PARTY_NOTICES.md.
 */
import { ImportError } from './types';

export interface ZipLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxSelectedFiles: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxEntries: 12_000,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 192 * 1024 * 1024,
  maxSelectedFiles: 64
};

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  flags: number;
  crc: number;
  localHeaderOffset: number;
}

export interface ZipReadResult {
  files: { name: string; text: string; bytes: Uint8Array }[];
  skipped: string[];
  entryCount: number;
  /** Relevant .html entries, used to explain an HTML export. */
  htmlEntries: string[];
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const decoder = new TextDecoder('utf-8', { fatal: false });

/** Normalize ZIP paths for safe reporting. We never extract to disk. */
export function safeZipPath(name: string): string | null {
  const normalized = name.replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return null;
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some(part => part === '..')) return null;
  return parts.filter(part => part !== '' && part !== '.').join('/');
}

export function isRelevantExportName(name: string): boolean {
  const base = name.split('/').pop() ?? '';
  if (!/\.json$/i.test(base)) return false;
  if (!/follow|request/i.test(base) && !/followers_and_following/i.test(name)) return false;
  return true;
}

export function isPotentiallyRelevantHtml(name: string): boolean {
  return /\.html?$/i.test(name) && /followers_and_following|following|followers/i.test(name);
}

function findEocd(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function listEntries(bytes: Uint8Array, limits: ZipLimits): ZipEntry[] {
  if (bytes.length > limits.maxArchiveBytes) {
    throw new ImportError(
      'ZIP_TOO_LARGE',
      'This archive is larger than the 256 MB safety limit.',
      'Meta exports are usually under 100 MB. If yours is larger, export only "Followers and following" rather than all account data.'
    );
  }
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new ImportError('ZIP_INVALID', 'This does not look like a ZIP file.', 'Choose the ZIP Meta gives you, or select the JSON files directly.');

  const disk = u16(bytes, eocd + 4);
  const centralDisk = u16(bytes, eocd + 6);
  const count = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  if (disk !== 0 || centralDisk !== 0) throw new ImportError('ZIP_UNSUPPORTED', 'Multi-part ZIP archives are not supported.');
  if (count === 0xffff || centralOffset === 0xffffffff) {
    throw new ImportError('ZIP64_UNSUPPORTED', 'This is a ZIP64 archive, which this build does not read.', 'Export only "Followers and following" to keep the archive small, or unzip it and choose the folder.');
  }
  if (count > limits.maxEntries) {
    throw new ImportError('ZIP_TOO_LARGE', `This archive contains more than ${limits.maxEntries.toLocaleString()} entries.`, 'Export only "Followers and following" and try again.');
  }
  if (centralOffset + centralSize > bytes.length) throw new ImportError('ZIP_CORRUPT', 'The ZIP directory points past the end of the file.');

  const entries: ZipEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length) throw new ImportError('ZIP_CORRUPT', 'The ZIP directory is truncated.');
    if (u32(bytes, p) !== SIG_CENTRAL) throw new ImportError('ZIP_CORRUPT', 'The ZIP directory has an unexpected entry.');
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const crc = u32(bytes, p + 16);
    const compressedSize = u32(bytes, p + 20);
    const uncompressedSize = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const localHeaderOffset = u32(bytes, p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > bytes.length) throw new ImportError('ZIP_CORRUPT', 'The ZIP directory entry is truncated.');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new ImportError('ZIP64_UNSUPPORTED', 'This is a ZIP64 archive, which this build does not read.');
    }
    if (flags & 0x1) {
      throw new ImportError('ZIP_ENCRYPTED', 'This ZIP is password protected.', 'Meta exports are not password protected. Re-download the archive from Meta and choose the new file.');
    }
    if (uncompressedSize > limits.maxEntryBytes) {
      throw new ImportError('ZIP_TOO_LARGE', 'A file inside this ZIP is larger than the 64 MB per-file safety limit.');
    }
    const rawName = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const safeName = safeZipPath(rawName);
    if (safeName !== null) {
      entries.push({ name: safeName, method, compressedSize, uncompressedSize, flags, crc, localHeaderOffset });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ImportError(
      'UNSUPPORTED_BROWSER',
      'This browser cannot read ZIP compression.',
      'Use a current version of Chrome, Safari, Edge or Firefox. You can also unzip the export yourself and choose the folder or the JSON files.'
    );
  }
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry, limits: ZipLimits): Promise<Uint8Array> {
  const p = entry.localHeaderOffset;
  if (p + 30 > bytes.length || u32(bytes, p) !== SIG_LOCAL) {
    throw new ImportError('ZIP_CORRUPT', 'A ZIP entry points to an invalid local header.');
  }
  const nameLen = u16(bytes, p + 26);
  const extraLen = u16(bytes, p + 28);
  const start = p + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new ImportError('ZIP_CORRUPT', 'A ZIP entry extends past the end of the archive.');
  const compressed = bytes.subarray(start, end);

  let out: Uint8Array;
  if (entry.method === 0) {
    out = compressed.slice();
  } else if (entry.method === 8) {
    try {
      out = await inflateRaw(compressed);
    } catch (err) {
      if (err instanceof ImportError) throw err;
      throw new ImportError('ZIP_CORRUPT', 'A file inside this ZIP could not be decompressed.', 'The download may be incomplete. Download the archive again from Meta.');
    }
  } else {
    throw new ImportError('ZIP_UNSUPPORTED', 'This ZIP uses a compression method FOLLOW/CUT does not support.');
  }
  if (out.length > limits.maxEntryBytes) throw new ImportError('ZIP_TOO_LARGE', 'A file inside this ZIP is larger than the safety limit.');
  if (entry.uncompressedSize && out.length !== entry.uncompressedSize) {
    throw new ImportError('ZIP_CORRUPT', 'A file inside this ZIP has an unexpected size.', 'The download may be incomplete. Download it again from Meta.');
  }
  if (entry.crc && crc32(out) !== entry.crc) {
    throw new ImportError('ZIP_CORRUPT', 'A file inside this ZIP failed its integrity check.', 'The archive may have been corrupted in download. Try downloading it again.');
  }
  return out;
}

/**
 * Read the relevant JSON files from a ZIP. We only decompress files whose names
 * look like follower/following/request data, so a giant full-account export does
 * not need to be inflated page by page.
 */
export async function readExportZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipReadResult> {
  const entries = listEntries(bytes, limits);
  const skipped: string[] = [];
  const relevant = entries.filter(e => !e.name.endsWith('/') && isRelevantExportName(e.name));
  const htmlEntries = entries.filter(e => !e.name.endsWith('/') && isPotentiallyRelevantHtml(e.name)).map(e => e.name);
  if (relevant.length > limits.maxSelectedFiles) {
    throw new ImportError('ZIP_TOO_LARGE', `This archive has ${relevant.length} candidate data files; the safety limit is ${limits.maxSelectedFiles}.`);
  }
  let total = 0;
  const files: ZipReadResult['files'] = [];
  for (const entry of relevant) {
    total += entry.uncompressedSize;
    if (total > limits.maxTotalBytes) {
      throw new ImportError('ZIP_TOO_LARGE', 'The follower/following JSON inside this ZIP exceeds the uncompressed safety limit.');
    }
    let raw: Uint8Array;
    try {
      raw = await readEntry(bytes, entry, limits);
    } catch (err) {
      if (err instanceof ImportError && (err.code === 'ZIP_UNSUPPORTED' || err.code === 'ZIP64_UNSUPPORTED')) {
        skipped.push(entry.name);
        continue;
      }
      throw err;
    }
    const text = decoder.decode(raw).replace(/^\uFEFF/, '');
    files.push({ name: entry.name, text, bytes: raw });
  }
  return { files, skipped, entryCount: entries.length, htmlEntries };
}
