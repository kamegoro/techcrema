/** A topic shows its best stories first and keeps the rest one tap away */
import { makeFeed } from '#e2e/support/feeds.ts';
import { test } from '#e2e/support/test.ts';

test.describe('Show more', () => {
  test('shows the rest of a topic', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.showMore('Rust');
    await reader.expectStories('Rust', [
      'Rust ownership explained',
      'Writing a Rust CLI',
      'Another alpha post',
      'Cargo workspaces',
      'Spare story e',
    ]);
    await reader.expectMoreToShow('Rust', null);
  });

  test('counts only stories that are not muted', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.muteSiteOf('Rust ownership explained', 'alpha.dev');
    await reader.expectMoreToShow('Rust', null);
  });

  test('the section is short again the next time the page opens', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.showMore('Rust');
    await reader.reopen();
    await reader.expectMoreToShow('Rust', 2);
  });
});
