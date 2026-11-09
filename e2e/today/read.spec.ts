/** Opening a story marks it as read; read stories make way for unread ones */
import { makeFeed } from '../support/feeds.ts';
import { test } from '../support/test.ts';

test.describe('Read', () => {
  test('opening a story marks it as read and leaves it where it is', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openStory('Rust ownership explained');
    await reader.expectStoryRead('Rust ownership explained');
    await reader.expectStories('Rust', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
  });

  test('opening the discussion counts as reading the story', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openDiscussion('Writing a Rust CLI');
    await reader.expectStoryRead('Writing a Rust CLI');
  });

  test('the next visit puts unread stories first', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openStory('Rust ownership explained');
    await reader.reopen();
    await reader.expectStories('Rust', ['Writing a Rust CLI', 'Another alpha post', 'Cargo workspaces']);
  });

  test('read marks are remembered', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openStory('Rust ownership explained');
    await reader.reopen();
    await reader.showMore('Rust');
    await reader.expectStoryRead('Rust ownership explained');
  });
});
