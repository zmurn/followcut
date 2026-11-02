import { expect, test } from '@playwright/test';
import {
  activeCard,
  importZip,
  openApp,
  activeHandle,
  gotoView,
  importFiles,
  JSON_FILES,
  loadDemo,
  mockInstagram,
  watchPageErrors
} from './helpers';

test.describe('review deck', () => {
  test('keyboard decisions, undo, and reload resume at the right card', async ({ page }) => {
    const errors = watchPageErrors(page);
    await loadDemo(page);
    await gotoView(page, 'review');
    const first = (await activeHandle(page).innerText()).trim();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(360);
    const second = (await activeHandle(page).innerText()).trim();
    expect(second).not.toBe(first);
    await expect(page.locator('.nav-link').filter({ hasText: 'Cleanup' })).toContainText('1');

    await page.keyboard.press('z');
    await page.waitForTimeout(250);
    await expect(activeHandle(page)).toHaveText(first);
    await expect(page.locator('.nav-link').filter({ hasText: 'Cleanup' })).toContainText('0');

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(320);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(320);
    const beforeReload = (await activeHandle(page).innerText()).trim();
    await page.reload();
    await page.waitForTimeout(350);
    await expect(activeHandle(page)).toHaveText(beforeReload);
    await expect(page).toHaveURL(/#\/review/);
    expect(errors).toEqual([]);
  });

  test('search and dialogs do not hijack keyboard decisions', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    const before = (await activeHandle(page).innerText()).trim();
    const search = page.getByRole('searchbox', { name: /Search your following/i });
    await search.click();
    await search.fill('quiet.archive');
    await expect(activeHandle(page)).toContainText('quiet.archive');
    const filtered = (await activeHandle(page).innerText()).trim();
    await search.press('ArrowRight');
    await page.waitForTimeout(150);
    await expect(activeHandle(page)).toHaveText(filtered);
    expect(filtered).not.toBe(before);

    await search.press('?');
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    await search.fill('');
    await search.evaluate(element => (element as HTMLInputElement).blur());
    await page.keyboard.press('?');
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.getByRole('heading', { name: /How FOLLOW\/CUT works/i })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('filters are composable and do not lose decisions', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    await page.getByRole('button', { name: /^Mutuals/ }).click();
    await expect(activeCard(page)).toContainText('Mutual');
    await page.getByRole('button', { name: /^Not following back/ }).click();
    await expect(activeCard(page)).toContainText('Not following back');
    const search = page.getByRole('searchbox', { name: /Search your following/i });
    await search.fill('zzzzzz');
    await expect(page.getByRole('heading', { name: /No accounts in this filter/i })).toBeVisible();
    await page.getByRole('button', { name: /Reset filters/i }).first().click();
    await expect(activeCard(page)).toBeVisible();
    await expect(activeCard(page)).toContainText('Unreviewed');
  });

  test('mouse swipe left marks for cleanup without confirming', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    const before = (await activeHandle(page).innerText()).trim();
    const box = await activeCard(page).boundingBox();
    expect(box).toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 220, y + 8, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    const after = (await activeHandle(page).innerText()).trim();
    expect(after).not.toBe(before);
    await expect(page.locator('.nav-link').filter({ hasText: 'Cleanup' })).toContainText('1');
    await expect(page.locator('.nav-link').filter({ hasText: 'Cleanup' })).not.toContainText('Confirmed');
  });

  test('card previews load the current profile and prefetch the next ones', async ({ page, context }) => {
    await mockInstagram(context);
    await openApp(page);
    await importFiles(page, JSON_FILES);
    await gotoView(page, 'review');
    const firstHandle = (await activeHandle(page).innerText()).trim().replace(/^@/, '').toLowerCase();
    const nextHandle = (await page.locator('.deck-card--behind:not(.deck-card--behind-2) .deck-handle').first().innerText()).trim().replace(/^@/, '').toLowerCase();
    await page.getByRole('button', { name: /Load card previews/i }).click();

    const activeFrame = page.locator('.card-preview__iframe.is-active');
    await expect(activeFrame).toHaveCount(1);
    await expect(activeFrame).toHaveAttribute('src', new RegExp(`/${firstHandle}/embed/$`));
    await expect(page.locator(`.card-preview__iframe[data-preview-username="${nextHandle}"]`)).toHaveCount(1);
    await expect(page.locator(`.card-preview__iframe[data-preview-username="${nextHandle}"][data-loaded="true"]`)).toHaveCount(1);
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    await page.locator('.deck-action--cut').click();
    await page.waitForTimeout(420);
    await expect(activeHandle(page)).toContainText(`@${nextHandle}`);
    await expect(page.locator('.card-preview__iframe.is-active')).toHaveAttribute('src', new RegExp(`/${nextHandle}/embed/$`));
    await expect(page.locator('.card-preview__iframe.is-active')).toHaveAttribute('data-loaded', 'true');
    await expect(page.locator('.nav-link').filter({ hasText: 'Cleanup' })).toContainText('1');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('Off mode keeps cards offline and opens the full profile', async ({ page, context }) => {
    await mockInstagram(context);
    await loadDemo(page);
    await gotoView(page, 'review');
    await expect(page.locator('.card-preview')).toHaveCount(0);

    const popupPromise = page.waitForEvent('popup');
    await activeCard(page).locator('.profile-link').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toContain('/grove.journal/');
    expect(popup.url()).not.toContain('/embed/');
    await popup.close();
    await expect(activeCard(page).locator('.profile-opened')).toBeVisible();
  });

  test('stars and locks persist through repaint', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    await page.keyboard.press('s');
    await expect(page.getByRole('button', { name: /^Unstar/ })).toBeVisible();
    await page.keyboard.press('l');
    await expect(page.getByRole('button', { name: /^Unlock/ })).toBeVisible();
    await page.reload();
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: /^Unstar/ })).toBeVisible();
    await expect(activeCard(page)).toContainText('Locked');
  });
});
