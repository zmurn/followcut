import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { makeZip, type ZipInput } from './zip';

const ROOT = join(process.cwd(), 'tests', 'fixtures');
const EXPORT_ROOT = join(ROOT, 'instagram-export', 'instagram-demoaccount-2026-10-12');
const EXPORT_PARENT = join(ROOT, 'instagram-export');

export function fixture(name: string): string {
  return readFileSync(join(ROOT, name), 'utf8');
}

export function exportFiles(): ZipInput[] {
  const out: ZipInput[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ name: relative(EXPORT_PARENT, full).split('\\').join('/'), content: readFileSync(full) });
    }
  };
  walk(EXPORT_ROOT);
  return out;
}

/** A fixture ZIP that includes the nested folder and unrelated export files. */
export function exportZip(files: ZipInput[] = exportFiles()): Buffer {
  return makeZip(files);
}
