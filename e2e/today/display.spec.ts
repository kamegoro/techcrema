/** What the Today page shows. Interactions live in their own spec files. */
import { emptyFeed, makeFeed } from '#e2e/support/feeds.ts';
import { expect, test } from '#e2e/support/test.ts';

test.describe('Today page', () => {
  test('the header shows the title, the update time, the views and a list of sections', async ({ reader, page }) => {
    await reader.open(makeFeed());
    await expect(page.getByRole('banner')).toMatchAriaSnapshot(`
      - banner:
        - heading "TechCrema" [level=1]
        - paragraph: Sun, November 8 · updated 08:00 AM
        - button "Dark mode" [pressed=false]
        - navigation "Views":
          - link "Today 7"
          - link "Later"
          - link "Muted"
    `);
    await expect(page.getByRole('navigation', { name: 'Sections' })).toMatchAriaSnapshot(`
      - navigation "Sections":
        - link "Official 1"
        - link "Rust 3"
        - link "Elsewhere 2"
        - link "New repos 1"
    `);
    await reader.expectCurrentTab('Today');
  });

  test('official news comes first, then one section per topic, then the rest', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.expectSections(['Official', 'Rust', 'Elsewhere', 'New repos']);
  });

  test('a topic with nothing today is left out', async ({ reader }) => {
    await reader.open(makeFeed());
    await expect(reader.section('Go')).toHaveCount(0);
  });

  test('a section shows only as many stories as its limit', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.expectStories('Rust', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
    await reader.expectMoreToShow('Rust', 2);
    await reader.expectMoreToShow('Elsewhere', null);
  });

  test('a story shows its title, where it is popular, its site, its age and its actions', async ({ reader }) => {
    await reader.open(makeFeed());
    await expect(reader.story('Rust ownership explained')).toMatchAriaSnapshot(`
      - article "Rust ownership explained":
        - heading "Rust ownership explained" [level=3]:
          - link "Rust ownership explained":
            - /url: https://alpha.dev/a
        - link "Discussion on HN (120 pt)"
        - text: alpha.dev
        - time: 3h ago
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
              - text: Release Minor and 2 more github.com
    `);
  });

  test('the page title comes from the settings', async ({ reader }) => {
    await reader.open(makeFeed({ title: 'Morning Reads' }));
    await reader.expectPageTitle('Morning Reads');
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
    await reader.expectLanguage('ja');
    await reader.expectSections(['公式', 'Rust', 'そのほかの話題', '新しいリポジトリ']);
    await expect(page.getByRole('button', { name: 'さらに2件' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '表示切り替え' })).toMatchAriaSnapshot(`
      - navigation:
        - link "今日 7"
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
      await reader.expectNoSidewaysScroll();
    });
  }
});
