/** Liking stories and marking them read by opening them */
import { makeFeed } from '../support/feeds.ts';
import { test } from '../support/test.ts';

test.describe('Like', () => {
  test('liking a story can be undone and is remembered', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.like('Rust ownership explained');
    await reader.expectLiked('Rust ownership explained');
    await reader.reopen();
    await reader.expectLiked('Rust ownership explained');
  });
});

test.describe('Read', () => {
  test('opening a story marks it as read', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openStory('Rust ownership explained');
    await reader.expectStoryRead('Rust ownership explained');
  });
});
