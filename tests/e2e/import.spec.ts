import { expect, test } from '@playwright/test';
import {
  activeCard,
  activeHandle,
  HTML_FILE,
  HTML_ZIP,
  JSON_FILES,
  NOT_A_ZIP,
  TWO_DATASET_ZIP,
  V1_ZIP,
  expectNoHorizontalOverflow,
  gotoView,
  importFiles,
  importZip,
  openApp,
  watchExternalRequests,
  watchPageErrors
} from './helpers';

test.describe('import', () => {
  test('imports the complete nested ZIP without unzipping and summarizes it', async ({ page, context }) => {
    const errors = watchPageErrors(page);
    const requests = watchExternalRequests(context);
    await openApp(page);
    await importZip(page, V1_ZIP);
    await expect(page.locator('.import-ok')).toContainText('8 following');
    await expect(page.locator('.import-ok')).toContainText('5 followers');
    await expect(page.locator('#step-3')).toContainText('Snapshot ready');
    await expect(page.locator('#step-3')).toContainText('Not live data');
    await expect(page.locator('#step-3 .summary-grid')).toContainText('8Following');
    await expect(page.locator('#step-3 .summary-grid')).toContainText('5Followers');
    await expect(page.locator('#step-3 .summary-grid')).toContainText('0.63 : 1');
    await expect(page.locator('#step-3 .summary-grid')).toContainText('4Mutuals');
    await expect(page.locator('#step-3 .summary-grid')).toContainText('4Not following back');
    await page.getByRole('button', { name: /Start reviewing/i }).click();
    await expect(page).toHaveURL(/#\/review/);
    await expect(activeHandle(page)).toBeVisible();
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });

  test('accepts individual JSON files selected together', async ({ page }) => {
    await openApp(page);
    await importFiles(page, JSON_FILES);
    await expect(page.locator('.import-ok')).toContainText('8 following');
    await expect(page.locator('.import-ok')).toContainText('5 followers');
  });

  test('rejects an HTML export with a re-export path', async ({ page }) => {
    await openApp(page);
    await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(HTML_FILE);
    await expect(page.getByRole('heading', { name: /This is an HTML export/i })).toBeVisible();
    await expect(page.locator('.import-ok')).toHaveCount(0);
    await expect(page.locator('.import-error')).toContainText('JSON');
  });

  test('rejects an HTML file inside a ZIP', async ({ page }) => {
    await openApp(page);
    await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(HTML_ZIP);
    await expect(page.getByRole('heading', { name: /This is an HTML export/i })).toBeVisible();
  });

  test('rejects a non-ZIP file safely', async ({ page }) => {
    await openApp(page);
    await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(NOT_A_ZIP);
    await expect(page.getByRole('heading', { name: /not a ZIP/i })).toBeVisible();
  });

  test('warns when follower data is missing and disables the comparison', async ({ page }) => {
    await openApp(page);
    await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(JSON_FILES[0]);
    await expect(page.locator('.import-ok')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.import-ok')).toContainText('followers not found');
    await expect(page.locator('#step-3')).toContainText('Follower comparison is off');
    await gotoView(page, 'review');
    await expect(activeHandle(page)).toBeVisible();
    await expect(activeCard(page)).toContainText('Follow-back unknown');
    await expect(page.getByRole('button', { name: /^Not following back/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Mutuals/ })).toBeDisabled();
  });

  test('opens the official export settings, focuses the picker, and offers a folder picker', async ({ page }) => {
    await openApp(page);
    const exportLink = page.getByRole('link', { name: /Open Instagram export settings/i }).first();
    await expect(exportLink).toHaveAttribute('href', 'https://accountscenter.instagram.com/info_and_permissions/dyi/');
    await expect(exportLink).toHaveAttribute('target', '_blank');
    const folderInput = page.locator('input[aria-label="Choose the unzipped Instagram export folder"]');
    await expect(folderInput).toHaveAttribute('webkitdirectory', '');
    await page.getByRole('button', { name: /I have the ZIP/i }).click();
    await page.waitForTimeout(450);
    await expect(page.locator('#choose-zip')).toBeFocused();
    expect(await page.locator('input[type="password"]').count()).toBe(0);
  });

  test('asks which account when a ZIP contains two datasets and never merges them', async ({ page }) => {
    await openApp(page);
    await page.locator('input[aria-label="Choose Instagram export ZIP or JSON files"]').first().setInputFiles(TWO_DATASET_ZIP);
    await expect(page.locator('.import-report .callout').getByText(/2 separate account datasets/i)).toBeVisible();
    const options = page.locator('.dataset-option');
    await expect(options).toHaveCount(2);
    await options.first().click();
    await expect(page.locator('#step-3')).toContainText('Snapshot ready');
    await expect(page.locator('#step-3 .summary-grid')).toContainText('1');
    await gotoView(page, 'review');
    await expect(activeHandle(page)).toHaveText(/alice\.person/);
    await expect(page.locator('.deck-stack')).not.toContainText('bob.person');
  });
});
