import { expect, test } from '@playwright/test';
import { dismissToast, gotoView, loadDemo } from './helpers';

test.describe('dashboard', () => {
  test('shows the snapshot, explicit not-live labelling, and goal controls', async ({ page }) => {
    await loadDemo(page);
    await dismissToast(page);
    await expect(page.locator('.snapshot-strip')).toContainText('1,336');
    await expect(page.locator('.snapshot-strip')).toContainText('1,733');
    await expect(page.locator('.snapshot-strip')).toContainText('0.77 : 1');
    await expect(page.locator('.snapshot-strip')).toContainText('1,200');
    await expect(page.locator('.snapshot-strip')).toContainText('533');
    await expect(page.locator('.snapshot-strip')).toContainText('136');
    await expect(page.locator('.not-live').first()).toBeVisible();
    await expect(page.getByText(/Not live data/i)).toBeVisible();
    await expect(page.getByText(/397 more confirmed removals to reach 1:1/i)).toBeVisible();

    await page.getByRole('button', { name: '1:1 = 1,336' }).click();
    await expect(page.locator('.panel__head').filter({ hasText: 'Target' })).toContainText('Target 1,336');
    await expect(page.getByText(/397 more confirmed removals to reach 1,336/i)).toBeVisible();

    const goalInput = page.locator('#goal-input-dash');
    await goalInput.fill('1500');
    await page.getByRole('button', { name: 'Set goal' }).click();
    await expect(page.locator('.panel__head').filter({ hasText: 'Target' })).toContainText('Target 1,500');
    await expect(page.getByText(/233 more confirmed removals to reach 1,500/i)).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.locator('.panel__head').filter({ hasText: 'Target' })).toContainText('No target set');
  });

  test('reimport goes to the data screen rather than inventing data', async ({ page }) => {
    await loadDemo(page);
    await page.getByRole('button', { name: /Reimport export/i }).click();
    await expect(page).toHaveURL(/#\/settings/);
    await expect(page.getByRole('heading', { name: /Import a newer export/i })).toBeVisible();
  });

  test('does not nag about a fictional demo snapshot being old', async ({ page }) => {
    await loadDemo(page);
    await expect(page.locator('.snapshot-head')).toContainText('Snapshot from');
    await expect(page.locator('.snapshot-head')).toContainText(/ago|Unknown/);
    await expect(page.getByText(/This export is/i)).toHaveCount(0);
  });
});
