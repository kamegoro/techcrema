/** What people said about a story: a couple of comments under its title, and a link to the rest */
import { LONG_COMMENT, makeFeed } from '#e2e/support/feeds.ts';
import { expect, test } from '#e2e/support/test.ts';

const STORY = 'Writing a Rust CLI';
const SHORT_COMMENT = 'clap made the argument parsing painless for me.';

test.describe('What people said', () => {
  test('a story shows a couple of comments and a link to everything else people said', async ({ reader }) => {
    await reader.open(makeFeed());
    await expect(reader.story(STORY)).toMatchAriaSnapshot(`
      - article "${STORY}":
        - heading "${STORY}" [level=3]
        - button "${LONG_COMMENT}" [expanded=false]
        - link "Whole comment by pat":
          - /url: https://news.ycombinator.com/item?id=b1
        - button "${SHORT_COMMENT}" [expanded=false]
        - link "Whole comment by sam":
          - /url: https://news.ycombinator.com/item?id=b2
        - link "All 230 comments on HN":
          - /url: https://news.ycombinator.com/item?id=b
    `);
  });

  test('a story nobody talked about shows no comments', async ({ reader }) => {
    await reader.open(makeFeed());
    await expect(reader.story('Rust ownership explained').getByRole('link', { name: /comments on/i })).toHaveCount(0);
  });

  test('tapping a comment opens it to its full length, and tapping again closes it', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.tapComment(STORY, 'I have shipped');
    await reader.expectCommentOpen(STORY, 'I have shipped', true);
    await reader.expectCommentOpen(STORY, 'clap made', false);
    await reader.tapComment(STORY, 'I have shipped');
    await reader.expectCommentOpen(STORY, 'I have shipped', false);
  });

  test('Hatena counts the people who bookmarked, not comments, and says so', async ({ reader }) => {
    const feed = makeFeed({ language: 'ja' });
    const voices = feed.sections[1]?.stories[1]?.voices;
    if (voices) voices.source = 'hatena';
    await reader.open(feed);
    await expect(reader.story(STORY).getByRole('link', { name: /230 users/ })).toBeVisible();
  });

  test('reading what people said counts as reading the story', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.openAllReactions(STORY);
    await reader.expectStoryRead(STORY);
  });

  test('on a Japanese page an English comment is translated, and opening it shows the original too', async ({
    reader,
  }) => {
    await reader.haveOnDeviceTranslation('available');
    await reader.open(makeFeed({ language: 'ja' }));
    const story = `${STORY} [ja] ${STORY}`;
    await expect(reader.story(story).getByRole('button', { name: `[ja] ${SHORT_COMMENT}`, exact: true })).toBeVisible();
    await reader.tapComment(story, `[ja] ${SHORT_COMMENT}`);
    await expect(
      reader.story(story).getByRole('button', { name: `[ja] ${SHORT_COMMENT} ${SHORT_COMMENT}`, exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  test('a comment without a safe link to the whole of it is shown without crediting a link', async ({ reader }) => {
    const feed = makeFeed();
    const comment = feed.sections[1]?.stories[1]?.voices?.comments[1];
    if (comment) comment.url = 'javascript:window.__xss = true';
    await reader.open(feed);
    await expect(reader.story(STORY).getByRole('button', { name: SHORT_COMMENT })).toBeVisible();
    await expect(reader.story(STORY).getByRole('link', { name: 'Whole comment by sam' })).toHaveCount(0);
  });

  test('comments whose discussion has no safe link are left out', async ({ reader }) => {
    const feed = makeFeed();
    const rust = feed.sections[1]?.stories[1];
    if (rust?.voices) rust.voices.url = 'javascript:window.__xss = true';
    await reader.open(feed);
    await expect(reader.story(STORY).getByRole('button', { name: /^clap made/ })).toHaveCount(0);
  });
});
