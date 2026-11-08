import { expect, test } from '@playwright/test';
import { cardTitles, makeFeed, openWith } from './fixtures.ts';

test.describe('today page', () => {
  test('shows each section with no more stories than its limit', async ({ page }) => {
    await openWith(page, makeFeed());
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Official', 'For you', 'Trending', 'Discover', 'New repos']);
    await expect(cardTitles(page, 'forYou')).toHaveText(['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
    await expect(page.getByRole('link', { name: /Today/ })).toContainText('8');
  });

  test('labels stories with their platform, popularity, release type and folded count', async ({ page }) => {
    await openWith(page, makeFeed());
    const release = page.locator('#section-official .card');
    await expect(release).toContainText('Minor');
    await expect(release).toContainText('+2 more');
    await expect(page.locator('#section-forYou .card').first()).toContainText('HN');
    await expect(page.locator('#section-forYou .card').first()).toContainText('120');
    await expect(page.locator('#section-forYou .card').first()).toContainText('#rust');
  });

  test('section chips jump to their section', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-nav').getByRole('link', { name: /New repos/ }).click();
    await expect(page.getByRole('heading', { name: 'New repos' })).toBeInViewport();
  });

  test('uses the title from the feed', async ({ page }) => {
    await openWith(page, makeFeed({ title: 'Morning Reads' }));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morning Reads');
    await expect(page).toHaveTitle('Morning Reads');
  });

  test('lists sources that could not be fetched', async ({ page }) => {
    await openWith(page, makeFeed({ errors: [{ source: 'lobsters', message: 'HTTP 503' }] }));
    await expect(page.getByText('Could not fetch: lobsters')).toBeVisible();
  });

  test('explains when the feed has not been generated yet', async ({ page }) => {
    await openWith(page, null);
    await expect(page.getByText('The feed has not been generated yet')).toBeVisible();
  });

  test('says so when there is nothing new today', async ({ page }) => {
    const feed = makeFeed();
    feed.sections = feed.sections.map((s) => ({ ...s, stories: [] }));
    await openWith(page, feed);
    await expect(page.getByText('Nothing new today')).toBeVisible();
  });
});

test.describe('language', () => {
  test('switches the whole UI to Japanese for a Japanese feed', async ({ page }) => {
    await openWith(page, makeFeed({ language: 'ja' }));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['公式', 'あなた向け', '話題', '発見', '新しいリポジトリ']);
    await expect(page.getByRole('link', { name: /今日/ })).toBeVisible();
    await expect(page.locator('#section-official .card')).toContainText('ほか2件');
  });
});

test.describe('layout', () => {
  for (const width of [320, 390, 768, 1280]) {
    test(`never scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openWith(page, makeFeed());
      await expect(page.locator('.card').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('follows the system dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openWith(page, makeFeed());
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = background.match(/\d+/g)!.map(Number);
    expect(r! + g! + b!).toBeLessThan(150);
  });
});
