import { expect, test } from '@playwright/test';
import {
  V2_ZIP,
  activeHandle,
  dismissToast,
  gotoView,
  importZip,
  openApp,
  watchPageErrors
} from './helpers';

test.describe('reimport and merge', () => {
  test('preserves matching decisions and warns before replacing the snapshot', async ({ page }) => {
    const errors = watchPageErrors(page);
    await openApp(page);
    await importZip(page);
    await gotoView(page, 'review');
    const cutHandle = (await activeHandle(page).innerText()).trim();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(340);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(340);

    await gotoView(page, 'settings');
    const importInput = page.locator('.import-panel input[aria-label="Choose Instagram export ZIP or JSON files"]').first();
    await importInput.setInputFiles(V2_ZIP);
    const dialog = page.getByRole('dialog', { name: /Replace your snapshot/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText('8 → 8');
    await expect(dialog).toContainText('Decisions kept');
    await expect(dialog).toContainText('Confirmations archived');
    await expect(dialog).toContainText('+1');
    await page.getByRole('button', { name: 'Replace snapshot' }).click();
    await dismissToast(page);
    await expect(page).toHaveURL(/#\/dashboard/);
    await expect(page.locator('.snapshot-strip')).toContainText('8');
    await expect(page.locator('.progress-card__num').first()).toHaveText('2');

    await gotoView(page, 'review');
    const search = page.getByRole('searchbox', { name: /Search your following/i });
    await search.fill('new.friend');
    await expect(activeHandle(page)).toContainText('new.friend');
    await search.fill('moss.room');
    await expect(page.getByRole('heading', { name: /No accounts in this filter/i })).toBeVisible();
    await expect(page.locator('.deck-stack')).not.toContainText(cutHandle.replace('@', ''));
    expect(errors).toEqual([]);
  });

  test('cancel keeps the current snapshot', async ({ page }) => {
    await openApp(page);
    await importZip(page);
    await gotoView(page, 'settings');
    await page.locator('.import-panel input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(V2_ZIP);
    await expect(page.getByRole('dialog', { name: /Replace your snapshot/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Keep current snapshot' }).click();
    await expect(page.getByRole('dialog', { name: /Replace your snapshot/i })).toHaveCount(0);
    await gotoView(page, 'review');
    const search = page.getByRole('searchbox', { name: /Search your following/i });
    await search.fill('moss.room');
    await expect(activeHandle(page)).toContainText('moss.room');
  });
});
