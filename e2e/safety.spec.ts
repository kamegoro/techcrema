import { expect, test } from '@playwright/test';
import { makeFeed, openWith } from './fixtures.ts';

test.describe('untrusted feed content', () => {
  test('shows HTML in a title as plain text and never runs it', async ({ page }) => {
    await openWith(page, makeFeed());
    await expect(page.locator('#section-trending')).toContainText('<img src=x onerror="window.__xss = true">');
    await expect(page.locator('#section-trending img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __xss?: boolean }).__xss)).toBeUndefined();
  });

  test('does not turn javascript: URLs into links', async ({ page }) => {
    await openWith(page, makeFeed());
    const card = page.locator('#section-trending .card', { hasText: 'Not a link' });
    await expect(card.locator('.card-title a')).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('opens external links without passing a referrer or window access', async ({ page }) => {
    await openWith(page, makeFeed());
    for (const rel of await page.locator('a[target="_blank"]').evaluateAll((as) => as.map((a) => a.getAttribute('rel')))) {
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });

  test('blocks requests to other origins through the content security policy', async ({ page }) => {
    await openWith(page, makeFeed());
    const blocked = await page.evaluate(() =>
      fetch('https://example.com/').then(
        () => false,
        () => true,
      ),
    );
    expect(blocked).toBe(true);
  });
});

test.describe('saved state', () => {
  test('ignores corrupted data in browser storage', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tc-state-v1', '{"liked": 5, "mute": {"domains": [1, null]}, "later": [{"x": 1}]'));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openWith(page, makeFeed());
    await expect(page.locator('#section-forYou .card')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('ignores well-formed but wrongly shaped data', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('tc-state-v1', JSON.stringify({ liked: 'a', read: [1, 2], later: [{ key: 1 }], mute: 'alpha.dev' })),
    );
    await openWith(page, makeFeed());
    await expect(page.locator('#section-forYou .card')).toHaveCount(3);
    await expect(page.getByRole('link', { name: /Later/ })).not.toContainText(/\d/);
  });
});
