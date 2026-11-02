import { expect, test } from '@playwright/test';
import {
  activeHandle,
  gotoView,
  importZip,
  loadDemo,
  openApp,
  watchExternalRequests,
  watchPageErrors
} from './helpers';

test.describe('privacy, theme and accessibility', () => {
  test('never contacts the network during import, review, cleanup or settings', async ({ page, context }) => {
    const requests = watchExternalRequests(context);
    const errors = watchPageErrors(page);
    await openApp(page);
    await importZip(page);
    await page.goto(page.url().replace(/#.*$/, '#/review'));
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await page.goto(page.url().replace(/#.*$/, '#/cleanup'));
    await page.waitForTimeout(150);
    await page.goto(page.url().replace(/#.*$/, '#/settings'));
    await page.waitForTimeout(150);
    await page.goto(page.url().replace(/#.*$/, '#/dashboard'));
    await page.waitForTimeout(200);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('ships a strict production CSP and no remote assets', async ({ page }) => {
    await openApp(page);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-src https://www.instagram.com");
    expect(csp).not.toContain('connect-src');
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    const remote = await page.evaluate(() => performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(url => !/^(file|data|blob):/.test(url)));
    expect(remote).toEqual([]);
  });

  test('theme choice persists across reloads', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /Switch to dark theme/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: /Switch to light theme/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('assistive names, landmarks and one h1 on every screen', async ({ page }) => {
    await loadDemo(page);
    for (const view of ['dashboard', 'review', 'cleanup', 'settings']) {
      await page.goto(page.url().replace(/#.*$/, `#/${view}`));
      await page.waitForTimeout(150);
      await expect(page.locator('main#main')).toHaveCount(1);
      await expect(page.locator('header.header')).toHaveCount(1);
      await expect(page.locator('nav:visible')).toHaveCount(1);
      expect(await page.locator('h1').count()).toBe(1);
      const duplicateIds = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        return ids.filter((id, index) => ids.indexOf(id) !== index);
      });
      expect(duplicateIds).toEqual([]);
      const nameless = await page.locator('button').evaluateAll(buttons => buttons
        .filter(button => button.getClientRects().length > 0)
        .filter(button => !(button.getAttribute('aria-label') || button.textContent || '').trim())
        .map(button => button.outerHTML.slice(0, 120)));
      expect(nameless).toEqual([]);
    }
  });

  test('the skip link focuses main without changing the route', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('skip-link'))).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/review/);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
  });

  test('help is a real focus-trapped dialog and shortcuts pause under it', async ({ page }) => {
    await loadDemo(page);
    await page.goto(page.url().replace(/#.*$/, '#/review'));
    await page.waitForTimeout(200);
    const before = (await activeHandle(page).innerText()).trim();
    await page.keyboard.press('?');
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]')))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]')))).toBe(true);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(250);
    await expect(page.locator('.nav-link').filter({ hasText: 'Cleanup' })).toContainText('0');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Dismiss message/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(activeHandle(page)).toHaveText(before);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('honors prefers-reduced-motion and still lets the deck work', async ({ page }) => {
    await loadDemo(page);
    await page.goto(page.url().replace(/#.*$/, '#/review'));
    await page.waitForTimeout(200);
    const duration = await page.locator('.deck-card').first().evaluate(element => getComputedStyle(element).transitionDuration);
    expect(Number.parseFloat(duration)).toBeLessThan(0.01);
    const before = (await activeHandle(page).innerText()).trim();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(80);
    expect((await activeHandle(page).innerText()).trim()).not.toBe(before);
  });
});
