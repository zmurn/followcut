import { expect, test } from '@playwright/test';
import {
  APP_URL,
  activeHandle,
  dismissToast,
  expectNoHorizontalOverflow,
  gotoView,
  loadDemo
} from './helpers';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

test.describe('mobile layout', () => {
  test('deck actions stay reachable above the bottom navigation', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    await dismissToast(page);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('.header__nav')).toBeHidden();
    const actions = page.locator('.deck-actions');
    await expect(actions).toBeVisible();
    const actionBox = await actions.boundingBox();
    const navBox = await page.locator('.mobile-nav').boundingBox();
    expect(actionBox).toBeTruthy();
    expect(navBox).toBeTruthy();
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
    expect(actionBox!.y).toBeGreaterThan(300);
    const before = (await activeHandle(page).innerText()).trim();
    await page.getByRole('button', { name: /Cut/ }).first().click();
    await page.waitForTimeout(400);
    expect((await activeHandle(page).innerText()).trim()).not.toBe(before);
  });

  test('overview, cleanup and settings do not scroll horizontally', async ({ page }) => {
    await loadDemo(page);
    for (const view of ['dashboard', 'cleanup', 'settings']) {
      await gotoView(page, view);
      await dismissToast(page);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator('.mobile-nav')).toBeVisible();
    }
    await page.evaluate(() => localStorage.clear());
    await page.goto(APP_URL);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('.mobile-nav')).toHaveCount(0);
  });
});
