import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { activeHandle, cutCards, dismissToast, gotoView, loadDemo, watchPageErrors } from './helpers';

test.describe('cleanup queue', () => {
  test('plans, manual confirmations, skip/keep/uncertain, undo and persistence', async ({ page }) => {
    const errors = watchPageErrors(page);
    await loadDemo(page);
    await gotoView(page, 'review');
    const handles: string[] = [];
    for (let i = 0; i < 3; i++) {
      handles.push((await activeHandle(page).innerText()).trim().replace('@', ''));
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(340);
    }

    await page.getByRole('link', { name: /Cleanup/ }).click();
    await expect(page).toHaveURL(/#\/cleanup/);
    const tabs = page.locator('.cleanup-toolbar .segmented').first();
    await expect(tabs).toContainText('Queue 3');
    await expect(page.locator('.focus-name')).toHaveText(`@${handles[0]}`);
    await expect(page.getByText('Not confirmed')).toBeVisible();
    await expect(page.getByText(/Only after you unfollow on Instagram/i)).toBeVisible();

    await page.getByRole('button', { name: /I unfollowed this account/i }).click();
    await dismissToast(page);
    await expect(tabs).toContainText('Queue 2');
    await expect(tabs).toContainText('Confirmed 1');
    await expect(page.locator('.focus-progress')).toContainText('1');
    await expect(page.locator('.focus-progress')).toContainText('of 3 intended');
    await expect(page.locator('.focus-name')).toHaveText(`@${handles[1]}`);

    await page.getByRole('link', { name: /Overview/ }).click();
    await expect(page).toHaveURL(/#\/dashboard/);
    await dismissToast(page);
    await expect(page.locator('.snapshot-strip')).toContainText('1,733');
    await expect(page.locator('.snapshot-strip')).toContainText('Following');
    await expect(page.locator('.progress-card--cleanup .progress-card__num')).toHaveText('1');
    await expect(page.locator('.projection')).toContainText('1,730 following');

    await page.getByRole('link', { name: /Cleanup/ }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Skip for now/i }).click();
    await dismissToast(page);
    await expect(tabs).toContainText('Queue 2');
    await expect(page.locator('.focus-name')).toHaveText(`@${handles[2]}`);

    await page.getByRole('button', { name: /Actually keep/i }).click();
    await dismissToast(page);
    await expect(tabs).toContainText('Queue 1');
    await expect(page.locator('.focus-progress')).toContainText('of 2 intended');
    await expect(page.locator('.focus-name')).toHaveText(`@${handles[1]}`);

    await page.getByRole('button', { name: /Mark uncertain/i }).click();
    await dismissToast(page);
    await expect(tabs).toContainText('Queue 0');
    await expect(page.locator('.empty-state h2')).toHaveText(/pending queue is clear/i);

    await tabs.getByRole('button', { name: /Confirmed/ }).click();
    await expect(page.locator('.queue-row')).toHaveCount(1);
    await expect(page.locator('.queue-row')).toContainText(handles[0]);
    await page.getByRole('button', { name: new RegExp(`Undo confirmation for @${handles[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
    await dismissToast(page);
    await expect(tabs).toContainText('Confirmed 0');
    await tabs.getByRole('button', { name: /Queue/ }).click();
    await expect(tabs).toContainText('Queue 1');

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click()
    ]);
    const csvPath = await csvDownload.path();
    const csv = readFileSync(csvPath!, 'utf8');
    expect(csv).toContain('username,profile_url,follow_back');
    expect(csv).toContain(handles[0]);
    expect(csv).toContain(handles[1]);

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'JSON' }).click()
    ]);
    const json = JSON.parse(readFileSync((await jsonDownload.path())!, 'utf8'));
    expect(json.app).toBe('FOLLOW/CUT');
    expect(json.summary.planned).toBe(2);
    expect(json.summary.confirmed_current).toBe(0);
    expect(json.summary.uncertain).toBe(1);
    expect(json.queue).toHaveLength(1);
    expect(json.skipped_or_uncertain).toHaveLength(1);

    await page.reload();
    await page.waitForTimeout(300);
    await expect(page.locator('.cleanup-toolbar .segmented').first()).toContainText('Queue 1');
    await expect(page.locator('.focus-name')).toHaveText(`@${handles[0]}`);
    expect(errors).toEqual([]);
  });

  test('says the cleanup queue is clear when nothing is planned', async ({ page }) => {
    await loadDemo(page);
    await gotoView(page, 'cleanup');
    await expect(page.getByRole('heading', { name: /pending queue is clear/i })).toBeVisible();
    await expect(page.getByText(/No accounts are marked for cut yet/i)).toBeVisible();
  });
});
