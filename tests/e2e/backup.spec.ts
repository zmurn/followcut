import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  APP_URL,
  INVALID_BACKUP,
  activeHandle,
  dismissToast,
  gotoView,
  loadDemo
} from './helpers';

test.describe('backup, restore and clear', () => {
  test('downloads a portable session backup, clears, and restores it from the welcome screen', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(340);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(340);
    await gotoView(page, 'settings');
    await dismissToast(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download backup/i }).first().click()
    ]);
    const path = await download.path();
    const backup = JSON.parse(readFileSync(path!, 'utf8'));
    expect(backup.format).toBe('followcut-backup');
    expect(backup.version).toBe(1);
    expect(backup.data.dataset.accounts).toHaveLength(1733);
    expect(backup.data.decisions).toHaveLength(2);
    expect(JSON.stringify(backup)).not.toContain('PK\\x03\\x04');

    await page.getByRole('button', { name: /Clear everything on this device/i }).click();
    await expect(page.getByRole('dialog', { name: /Clear this local session/i })).toBeVisible();
    await page.getByRole('button', { name: 'Clear everything', exact: true }).click();
    await expect(page).toHaveURL(/#\/welcome/);
    await expect(page.getByRole('heading', { name: /A deck of everyone/i })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('followcut:v1:dataset'))).toBeNull();

    await page.getByRole('button', { name: /Restore a saved backup/i }).click();
    await page.locator('input[aria-label="Choose a FOLLOW/CUT session backup"]').setInputFiles(path!);
    await expect(page.getByRole('dialog', { name: /Restore this saved session/i })).toBeVisible();
    await page.getByRole('button', { name: 'Restore session' }).click();
    await expect(page).toHaveURL(/#\/dashboard/);
    await expect(page.locator('.snapshot-strip')).toContainText('1,733');
    await expect(page.locator('.progress-card__num').first()).toHaveText('2');
    expect(await page.evaluate(() => localStorage.getItem('followcut:v1:dataset'))).not.toBeNull();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('restores from the Settings file picker after a preview', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'review');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(340);
    await gotoView(page, 'settings');
    await dismissToast(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download backup/i }).first().click()
    ]);
    const path = await download.path();
    await page.locator('input[aria-label="Choose a FOLLOW/CUT session backup"]').setInputFiles(path!);
    await expect(page.getByRole('dialog', { name: /Restore this backup/i })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Restore this backup/i })).toContainText('Decisions');
    await page.getByRole('button', { name: 'Restore session' }).click();
    await expect(page).toHaveURL(/#\/dashboard/);
    await expect(page.locator('.progress-card__num').first()).toHaveText('1');
  });

  test('shows a specific error for an invalid backup on a fresh session', async ({ page }) => {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: /Restore a saved backup/i }).click();
    await page.locator('input[aria-label="Choose a FOLLOW/CUT session backup"]').setInputFiles(INVALID_BACKUP);
    await expect(page.getByRole('alert')).toContainText(/not a FOLLOW\/CUT session backup/i);
    await expect(page.locator('#step-3')).toContainText('Waiting for import');
  });
});
