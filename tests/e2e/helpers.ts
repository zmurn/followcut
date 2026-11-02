import { expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeZip, type ZipInput } from '../helpers/zip';
import { exportFiles } from '../helpers/fixtures';

export const APP_URL = pathToFileURL(resolve('dist/index.html')).href;
export const TEMP = mkdtempSync(join(tmpdir(), 'followcut-e2e-'));

function writeZip(name: string, files: ZipInput[]): string {
  const path = join(TEMP, name);
  writeFileSync(path, makeZip(files));
  return path;
}

const EXPORT_DIR = 'instagram-demoaccount-2026-10-12/connections/followers_and_following/';

function followingContent(transform: (list: any[]) => any[]): string {
  const original = JSON.parse(readFileSync(
    join(process.cwd(), 'tests/fixtures/instagram-export/instagram-demoaccount-2026-10-12/connections/followers_and_following/following.json'),
    'utf8'
  ));
  return JSON.stringify({ relationships_following: transform(original.relationships_following) });
}

export const V1_ZIP = writeZip('export-v1.zip', exportFiles());

export const V2_ZIP = writeZip('export-v2.zip', exportFiles().map(file => {
  if (!file.name.endsWith('/following.json')) return file;
  return {
    ...file,
    content: followingContent(list => [
      ...list.filter((entry: any) => !JSON.stringify(entry).includes('moss.room')),
      { title: 'new.friend', string_list_data: [{ href: 'https://www.instagram.com/new.friend', value: 'new.friend', timestamp: 1720000000 }] }
    ])
  };
}));

export const TWO_DATASET_ZIP = writeZip('two-datasets.zip', [
  {
    name: 'instagram-alice-2026-10-01/connections/followers_and_following/following.json',
    content: JSON.stringify({ relationships_following: [{ title: 'alice.person', string_list_data: [{ value: 'alice.person' }] }] })
  },
  {
    name: 'instagram-alice-2026-10-01/connections/followers_and_following/followers_1.json',
    content: JSON.stringify([{ title: '', string_list_data: [{ value: 'alice.person' }] }])
  },
  {
    name: 'instagram-bob-2026-10-02/connections/followers_and_following/following.json',
    content: JSON.stringify({ relationships_following: [{ title: 'bob.person', string_list_data: [{ value: 'bob.person' }] }] })
  },
  {
    name: 'instagram-bob-2026-10-02/connections/followers_and_following/followers_1.json',
    content: JSON.stringify([{ title: '', string_list_data: [{ value: 'bob.person' }] }])
  }
]);

export const HTML_ZIP = writeZip('html-export.zip', [
  { name: EXPORT_DIR + 'following.html', content: readFileSync(join(process.cwd(), 'tests/fixtures/html-export.html'), 'utf8') }
]);

export const NOT_A_ZIP = join(TEMP, 'not-a-zip.zip');
writeFileSync(NOT_A_ZIP, 'this is not a zip file');

export const JSON_FILES = [
  join(process.cwd(), 'tests/fixtures/instagram-export/instagram-demoaccount-2026-10-12/connections/followers_and_following/following.json'),
  join(process.cwd(), 'tests/fixtures/instagram-export/instagram-demoaccount-2026-10-12/connections/followers_and_following/following_label_values.json'),
  join(process.cwd(), 'tests/fixtures/instagram-export/instagram-demoaccount-2026-10-12/connections/followers_and_following/followers_1.json'),
  join(process.cwd(), 'tests/fixtures/instagram-export/instagram-demoaccount-2026-10-12/connections/followers_and_following/followers_2.json'),
  join(process.cwd(), 'tests/fixtures/instagram-export/instagram-demoaccount-2026-10-12/connections/followers_and_following/followers_3.json')
];

export const HTML_FILE = join(process.cwd(), 'tests/fixtures/html-export.html');

export async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await expect(page.getByRole('heading', { name: /A deck of everyone/i })).toBeVisible();
}

export async function dismissToast(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: 'Dismiss message' });
  if (await close.count()) {
    await close.first().click();
  }
}

export async function loadDemo(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: /No export handy\? Try a demo deck/i }).first().click();
  await expect(page).toHaveURL(/#\/dashboard/);
  await dismissToast(page);
}

export async function gotoView(page: Page, view: string): Promise<void> {
  await page.goto(`${APP_URL}#/${view}`);
  await page.waitForTimeout(120);
}

export function activeCard(page: Page) {
  return page.locator('.deck-stack > .deck-card:not(.deck-card--behind)').first();
}

export function activeHandle(page: Page) {
  return activeCard(page).locator('.deck-handle');
}

export async function importZip(page: Page, zipPath = V1_ZIP): Promise<void> {
  await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(zipPath);
  await expect(page.locator('.import-ok')).toBeVisible({ timeout: 20_000 });
}

export async function importFiles(page: Page, files: string[]): Promise<void> {
  await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(files);
  await expect(page.locator('.import-ok')).toBeVisible({ timeout: 20_000 });
}

export function watchExternalRequests(context: BrowserContext): string[] {
  const requests: string[] = [];
  context.on('request', request => {
    const url = request.url();
    if (!/^(file|data|blob):/.test(url)) requests.push(url);
  });
  return requests;
}

export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

export async function mockInstagram(context: BrowserContext): Promise<void> {
  await context.route('https://www.instagram.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><h1>Mock Instagram profile</h1></body></html>'
  }));
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

export async function cutCards(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(280);
  }
}

export async function waitForToastGone(page: Page): Promise<void> {
  await dismissToast(page);
}

export const INVALID_BACKUP = join(TEMP, 'invalid-backup.json');
writeFileSync(INVALID_BACKUP, JSON.stringify({ format: 'something-else', version: 1, data: {} }));
