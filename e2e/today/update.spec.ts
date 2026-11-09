/** Coming back to the page after the feed was rebuilt */
import { makeFeed, story } from '#e2e/support/feeds.ts';
import { test } from '#e2e/support/test.ts';

const nextEdition = () => {
  const feed = makeFeed({ generatedAt: '2026-11-08T08:30:00.000Z' });
  return {
    ...feed,
    sections: feed.sections.map((s) =>
      s.id === 'topic-0'
        ? { ...s, stories: [story('n', { title: 'Rust 2.0 is out', topics: ['rust'], interest: 1 })] }
        : s,
    ),
  };
};

test.describe('A newer edition', () => {
  test('nothing changes when there is no newer edition', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.comeBack();
    await reader.expectNoMessage();
    await reader.expectStories('Rust', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
  });

  test('is offered instead of replacing the stories being read', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.serveFeed(nextEdition());
    await reader.comeBack();
    await reader.expectMessage('A newer edition is ready');
    await reader.expectStories('Rust', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
    await reader.showFromMessage();
    await reader.expectStories('Rust', ['Rust 2.0 is out']);
  });
});
