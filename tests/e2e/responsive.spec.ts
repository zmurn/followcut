import { expect, test } from '@playwright/test';
import { APP_URL, JSON_FILES, gotoView, importFiles } from './helpers';

const VIEWPORTS = [
  { width: 1366, height: 768, label: 'short laptop' },
  { width: 1024, height: 768, label: 'small laptop' },
  { width: 320, height: 700, label: 'narrow phone' }
] as const;

test('keeps the review deck and decision bar inside common viewports', async ({ browser }) => {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.width < 500,
      hasTouch: viewport.width < 500,
      locale: 'en-US'
    });
    await context.route('https://www.instagram.com/**', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>Instagram preview</body></html>'
    }));
    const page = await context.newPage();
    await page.goto(APP_URL);
    await importFiles(page, JSON_FILES);
    await gotoView(page, 'review');

    const load = page.getByRole('button', { name: /Load card previews/i });
    if (await load.count()) await load.first().click();
    await page.waitForTimeout(320);

    const fit = await page.evaluate(() => {
      const doc = document.documentElement;
      const active = document.querySelector('.deck-stack > .deck-card:not(.deck-card--behind)') as HTMLElement | null;
      const actions = document.querySelector('.deck-actions') as HTMLElement | null;
      const nav = document.querySelector('.mobile-nav') as HTMLElement | null;
      const cardRect = active?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const navRect = nav?.getBoundingClientRect();
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        cardBottom: cardRect?.bottom ?? 0,
        actionsTop: actionsRect?.top ?? 0,
        actionsBottom: actionsRect?.bottom ?? 0,
        navTop: navRect?.top ?? 0,
        clientHeight: doc.clientHeight
      };
    });

    expect(fit.scrollWidth, `${viewport.label} horizontal overflow`).toBeLessThanOrEqual(fit.clientWidth + 1);
    expect(fit.actionsBottom, `${viewport.label} decision bar below viewport`).toBeLessThanOrEqual(fit.clientHeight + 1);
    expect(fit.cardBottom, `${viewport.label} card overlaps decision bar`).toBeLessThanOrEqual(fit.actionsTop + 1);
    if (fit.navTop > 0) {
      expect(fit.actionsBottom, `${viewport.label} decision bar overlaps mobile nav`).toBeLessThanOrEqual(fit.navTop + 1);
    }

    await context.close();
  }
});
