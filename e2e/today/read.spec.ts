/** Opening a story marks it as read */
import { makeFeed } from '../support/feeds.ts';
import { test } from '../support/test.ts';

test.describe('Read', () => {
  test('opening a story marks it as read', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openStory('Rust ownership explained');
    await reader.expectStoryRead('Rust ownership explained');
  });

  test('read marks are remembered', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openStory('Rust ownership explained');
    await reader.reopen();
    await reader.expectStoryRead('Rust ownership explained');
  });
});
