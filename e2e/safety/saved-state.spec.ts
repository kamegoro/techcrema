/** What the page saved in the browser may be damaged or from an older version; the page must still work */
import { makeFeed } from '../support/feeds.ts';
import { expect, test } from '../support/test.ts';

test.describe('Saved state', () => {
  test('broken JSON is ignored', async ({ reader, page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (value) => localStorage.setItem('tc-state-v1', value),
      '{"liked": 5, "mute": {"domains": [1, null]}',
    );
    await reader.open(makeFeed());
    await reader.expectStories('For you', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
    expect(errors).toEqual([]);
  });

  test('values of the wrong type are ignored', async ({ reader, page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('tc-state-v1', value),
      JSON.stringify({ liked: 'a', read: [1, 2], later: [{ key: 1 }], mute: 'alpha.dev' }),
    );
    await reader.open(makeFeed());
    await reader.expectStories('For you', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
    await reader.expectTabCount('Later', null);
    await reader.expectTabCount('Muted', null);
  });
});
