/** What the page saved in the browser may be damaged or from an older version; the page must still work */
import { makeFeed } from '#e2e/support/feeds.ts';
import { expect, test } from '#e2e/support/test.ts';

test.describe('Saved state', () => {
  test('broken JSON is ignored', async ({ reader, page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await reader.haveSavedState('{"unknownField": 5, "mute": {"domains": [1, null]}');
    await reader.open(makeFeed());
    await reader.expectStories('Rust', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
    expect(errors).toEqual([]);
  });

  test('values of the wrong type are ignored', async ({ reader }) => {
    await reader.haveSavedState(
      JSON.stringify({ unknownField: 'a', read: [1, 2], later: [{ key: 1 }], mute: 'alpha.dev' }),
    );
    await reader.open(makeFeed());
    await reader.expectStories('Rust', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
    await reader.expectTabCount('Later', null);
    await reader.expectTabCount('Muted', null);
  });

  test('a saved story from an older version without its details is left out', async ({ reader }) => {
    await reader.haveSavedState(JSON.stringify({ later: [{ key: 'old', title: 'An old save' }] }));
    await reader.open(makeFeed(), 'Later');
    await reader.expectText('Nothing saved for later');
  });
});
