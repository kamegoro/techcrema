/** What the Today page shows. Interactions live in their own spec files. */
import { emptyFeed, makeFeed } from '../support/feeds.ts';
import { expect, test } from '../support/test.ts';

test.describe('Today page', () => {
  test('the header shows the title, the update time, the views and a list of sections', async ({ reader, page }) => {
    await reader.open(makeFeed());
    await expect(page.getByRole('banner')).toMatchAriaSnapshot(`
      - banner:
        - heading "Tech Catchup" [level=1]
        - paragraph: Sun, November 8 · updated 08:00 AM
        - button "Reload"
        - 'button "Theme: System (tap to change)"'
        - navigation "Views":
          - link "Today 8"
          - link "Later"
          - link "Muted"
        - navigation "Sections":
          - link "Official 1"
          - link "For you 3"
          - link "Trending 2"
          - link "Discover 1"
          - link "New repos 1"
    `);
    await reader.expectCurrentTab('Today');
  });

  test('sections appear in a fixed order', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.expectSections(['Official', 'For you', 'Trending', 'Discover', 'New repos']);
  });

  test('a section shows only as many stories as its limit', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.expectStories('For you', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
  });

  test('a story shows where it is popular, its site, its age, its topics and its actions', async ({ reader }) => {
    await reader.open(makeFeed());
    await expect(reader.story('Rust ownership explained')).toMatchAriaSnapshot(`
      - article "Rust ownership explained":
        - link "Discussion on HN (120 pt)"
        - text: EN
        - heading "Rust ownership explained" [level=3]:
          - link "Rust ownership explained":
            - /url: https://alpha.dev/a
        - text: alpha.dev
        - time: 3 hr. ago
        - text: "#rust"
        - button "Like"
        - button "Read later"
        - button "Mute"
    `);
  });

  test('a release shows its type and how many other releases were folded in', async ({ reader }) => {
    await reader.open(makeFeed());
    await expect(reader.section('Official')).toMatchAriaSnapshot(`
      - region "Official":
        - heading "Official" [level=2]
        - paragraph: Blogs and releases from the last 3 days
        - list:
          - listitem:
            - article "node v26.1.0":
              - text: Release Minor +2 more EN
    `);
  });

  test('the page title comes from the settings', async ({ reader, page }) => {
    await reader.open(makeFeed({ title: 'Morning Reads' }));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morning Reads');
    await expect(page).toHaveTitle('Morning Reads');
  });

  test('sources that could not be fetched are listed', async ({ reader }) => {
    await reader.open(makeFeed({ errors: [{ source: 'lobsters', message: 'HTTP 503' }] }));
    await reader.expectText('Could not fetch: lobsters');
  });

  test('a missing feed is explained', async ({ reader }) => {
    await reader.open(null);
    await reader.expectText('The feed has not been generated yet');
  });

  test('an empty day says so', async ({ reader }) => {
    await reader.open(emptyFeed());
    await reader.expectText('Nothing new today');
  });
});

test.describe('Japanese page', () => {
  test('the whole page is in Japanese', async ({ reader, page }) => {
    await reader.open(makeFeed({ language: 'ja' }));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
      '公式',
      'あなた向け',
      '話題',
      '発見',
      '新しいリポジトリ',
    ]);
    await expect(page.getByRole('navigation', { name: '表示切り替え' })).toMatchAriaSnapshot(`
      - navigation:
        - link "今日 8"
        - link "あとで"
        - link "ミュート"
    `);
    await expect(page.getByRole('region', { name: '公式' })).toContainText('ほか2件');
  });
});

test.describe('Layout', () => {
  for (const width of [320, 390, 768, 1280]) {
    test(`nothing overflows sideways at ${width}px`, async ({ reader, page }) => {
      await page.setViewportSize({ width, height: 800 });
      await reader.open(makeFeed());
      await expect(reader.story('Rust ownership explained')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        0,
      );
    });
  }

  test('the page follows the system dark mode', async ({ reader, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await reader.open(makeFeed());
    await expect(page.locator('body')).toHaveCSS('color-scheme', /dark/);
  });
});
