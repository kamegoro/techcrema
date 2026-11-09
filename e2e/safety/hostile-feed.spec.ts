/** A feed is outside input: nothing in it may run code or send the reader elsewhere unexpectedly */
import { makeFeed } from '#e2e/support/feeds.ts';
import { expect, test } from '#e2e/support/test.ts';

test.describe('Hostile feed content', () => {
  test.beforeEach(async ({ reader }) => {
    await reader.open(makeFeed());
  });

  test('HTML in a title is shown as text and never runs', async ({ reader, page }) => {
    const title = '<img src=x onerror="window.__xss = true">';
    await expect(reader.story(title)).toBeVisible();
    await expect(reader.section('Elsewhere').getByRole('img')).toHaveCount(0);
    expect(await page.evaluate(() => 'xss' in window || '__xss' in window)).toBe(false);
  });

  test('a javascript: URL does not become a link', async ({ reader }) => {
    await expect(reader.story('Not a link').getByRole('heading', { level: 3 })).toMatchAriaSnapshot(`
      - heading "Not a link" [level=3]
    `);
    await expect(reader.story('Not a link').getByRole('link', { name: 'Not a link' })).toHaveCount(0);
  });

  test('links to other sites open in a new tab without access to this page or a referrer', async ({ page }) => {
    const rels = await page
      .getByRole('link')
      .evaluateAll((links) =>
        links.filter((a) => a.getAttribute('target') === '_blank').map((a) => a.getAttribute('rel') ?? ''),
      );
    expect(rels.length).toBeGreaterThan(0);
    for (const rel of rels) expect(rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  });

  test('the content security policy blocks requests to other sites', async ({ page }) => {
    const violation = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          document.addEventListener('securitypolicyviolation', (e) => resolve(e.effectiveDirective), { once: true });
          fetch('https://example.com/').catch(() => undefined);
        }),
    );
    expect(violation).toBe('connect-src');
  });
});
