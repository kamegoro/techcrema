/** Switching the theme and reloading the feed */
import { makeFeed } from '../support/feeds.ts';
import { test } from '../support/test.ts';

test.describe('Theme', () => {
  test('the theme cycles System → Light → Dark → System', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.expectTheme('System');
    await reader.switchTheme();
    await reader.expectTheme('Light');
    await reader.switchTheme();
    await reader.expectTheme('Dark');
    await reader.switchTheme();
    await reader.expectTheme('System');
  });

  test('the chosen theme is remembered', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.switchTheme();
    await reader.switchTheme();
    await reader.reopen();
    await reader.expectTheme('Dark');
  });
});

test.describe('Reload', () => {
  test('reloading an unchanged feed says it is up to date', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.reloadFeed();
    await reader.expectMessage('Already up to date');
  });

  test('reloading a newer feed shows it', async ({ reader }) => {
    await reader.open(makeFeed());
    const feed = makeFeed({ generatedAt: '2026-11-08T08:30:00Z' });
    const newer = {
      ...feed,
      sections: feed.sections.map((s) => (s.id === 'forYou' ? { ...s, stories: s.stories.slice(1) } : s)),
    };
    await reader.serveFeed(newer);
    await reader.reloadFeed();
    await reader.expectMessage('Updated');
    await reader.expectStories('For you', ['Writing a Rust CLI', 'Another alpha post', 'Cargo workspaces']);
  });
});

test.describe('Section list', () => {
  test('a section can be reached from the section list', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.jumpToSection('New repos');
    await reader.expectSectionInView('New repos');
  });
});
