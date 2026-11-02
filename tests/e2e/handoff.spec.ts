import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  JSON_FILES,
  activeHandle,
  dismissToast,
  loadDemo,
  openApp,
  watchExternalRequests
} from './helpers';

const PORT = 4400 + (process.pid % 400);
let server: ChildProcess | undefined;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  server = spawn(process.execPath, ['scripts/share-server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise<void>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`share server did not start: ${stderr || stdout}`)), 12_000);
    server?.stdout?.on('data', chunk => {
      stdout += String(chunk);
      if (stdout.includes('FOLLOW/CUT phone handoff')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server?.stderr?.on('data', chunk => { stderr += String(chunk); });
    server?.on('exit', code => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`share server exited ${code}: ${stderr}`));
      }
    });
  });
});

test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise(resolve => server?.once('exit', resolve));
  server.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
});

test('hands the review deck to a phone over the local server', async ({ browser }) => {
  const computer = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await computer.newPage();
  const errors: string[] = [];
  const external: string[] = [];
  computer.on('request', request => {
    const url = request.url();
    if (!/^(data|blob):/.test(url) && !url.startsWith(`http://127.0.0.1:${PORT}`)) external.push(url);
  });
  page.on('pageerror', error => errors.push(`computer: ${error.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(JSON_FILES);
  await expect(page.locator('.import-ok')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.import-ok')).toContainText('8 following');
  await page.goto(page.url().replace(/#.*$/, '') + '#/review');
  await expect(activeHandle(page)).toBeVisible();

  await page.locator('.phone-tool').click();
  const dialog = page.getByRole('dialog', { name: /Continue on your phone/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.phone-handoff__qr img')).toBeVisible({ timeout: 15_000 });
  const qrSrc = await dialog.locator('.phone-handoff__qr img').getAttribute('src');
  expect(qrSrc?.startsWith('data:image/')).toBe(true);
  const phoneUrl = (await dialog.locator('.phone-handoff__url code').innerText()).trim();
  expect(phoneUrl).toContain('/p/');
  const code = phoneUrl.split('/p/').pop()!;
  expect(code.length).toBeGreaterThan(12);

  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-US'
  });
  const phone = await phoneContext.newPage();
  phoneContext.on('request', request => {
    const url = request.url();
    if (!/^(data|blob):/.test(url) && !url.startsWith(`http://127.0.0.1:${PORT}`)) external.push(url);
  });
  phone.on('pageerror', error => errors.push(`phone: ${error.message}`));
  await phone.goto(`http://127.0.0.1:${PORT}/p/${code}`);
  await expect(phone).toHaveURL(new RegExp(`http://127\\.0\\.0\\.1:${PORT}/p/${code}#/review`), { timeout: 12_000 });
  await expect(activeHandle(phone)).toBeVisible();
  await expect(phone.locator('.deck-actions')).toBeVisible();
  expect(phone.url()).toContain(`/p/${code}`);
  expect(await phone.evaluate(() => (localStorage.getItem('followcut:v1:dataset') ?? '').length)).toBeGreaterThan(1000);
  await expect(phone.locator('.toast--success')).toContainText(/Linked live/i);

  const firstHandle = (await activeHandle(phone).innerText()).trim();
  await phone.locator('.deck-action--cut').click();
  await phone.waitForTimeout(450);
  const phoneHandle = (await activeHandle(phone).innerText()).trim();
  expect(phoneHandle).not.toBe(firstHandle);
  await expect.poll(async () => (await activeHandle(page).innerText()).trim(), { timeout: 8_000 }).toBe(phoneHandle);
  await expect(page.locator('.nav-link').filter({ hasText: 'Cleanup' })).toContainText('1');

  // Opening the retained handoff URL in a clean browser context (Safari/Chrome
  // handoff rather than the QR in-app browser) resumes the server's latest state.
  const fullBrowserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-US'
  });
  const fullBrowser = await fullBrowserContext.newPage();
  await fullBrowser.goto(`http://127.0.0.1:${PORT}/p/${code}`);
  await expect(fullBrowser).toHaveURL(new RegExp(`/p/${code}#/review$`), { timeout: 12_000 });
  await expect(activeHandle(fullBrowser)).toContainText(phoneHandle.replace(/^@/, ''));

  expect(errors).toEqual([]);
  expect(external).toEqual([]);

  await fullBrowserContext.close();
  await computer.close();
  await phoneContext.close();
});

test('explains the optional server from the standalone file', async ({ page, context }) => {
  const requests = watchExternalRequests(context);
  await openApp(page);
  await loadDemo(page);
  await dismissToast(page);
  await page.locator('.phone-tool').click();
  const dialog = page.getByRole('dialog', { name: /Set up phone handoff/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('npm run share');
  await expect(dialog).toContainText(/download a backup/i);
  await expect(dialog.locator('.phone-handoff__qr img')).toHaveCount(0);
  expect(requests).toEqual([]);
});
