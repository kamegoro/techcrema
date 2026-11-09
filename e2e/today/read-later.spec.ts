/** Saving stories to read later */
import { makeFeed } from '../support/feeds.ts';
import { test } from '../support/test.ts';

test.describe('Read later', () => {
  test('a saved story is in the Later tab, and the tab shows how many', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.saveForLater('Rust ownership explained');
    await reader.expectTabCount('Later', 1);
    await reader.goToTab('Later');
    await reader.expectLaterList(['Rust ownership explained']);
  });

  test('saved stories are remembered after reopening', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.saveForLater('Rust ownership explained');
    await reader.reopen();
    await reader.goToTab('Later');
    await reader.expectLaterList(['Rust ownership explained']);
  });

  test('saved stories stay after the feed moves on to the next day', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.saveForLater('Rust ownership explained');
    await reader.serveFeed(makeFeed({ date: '2026-11-09', sections: [] }));
    await reader.reopen();
    await reader.goToTab('Later');
    await reader.expectLaterList(['Rust ownership explained']);
  });

  test('opening a saved story takes it off the list, and that can be undone', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.saveForLater('Rust ownership explained');
    await reader.saveForLater('Writing a Rust CLI');
    await reader.goToTab('Later');
    await reader.openStory('Rust ownership explained');
    await reader.expectMessage('Removed from Read later');
    await reader.expectLaterList(['Writing a Rust CLI']);
    await reader.undoFromMessage();
    // Back in its old place: the newest save comes first
    await reader.expectLaterList(['Writing a Rust CLI', 'Rust ownership explained']);
  });

  test('a story can be removed from Read later', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.saveForLater('Rust ownership explained');
    await reader.goToTab('Later');
    await reader.removeFromLater('Rust ownership explained');
    await reader.expectText('Nothing saved for later');
    await reader.expectTabCount('Later', null);
  });
});
