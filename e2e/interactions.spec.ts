import { expect, test } from '@playwright/test';
import { cardTitles, makeFeed, openWith } from './fixtures.ts';

test.describe('mute', () => {
  test('hides a site and refills the section from spare stories', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Mute' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Site: alpha.dev').check();
    await sheet.getByRole('button', { name: 'Mute', exact: true }).click();

    await expect(page.getByText('Muted "alpha.dev"')).toBeVisible();
    await expect(cardTitles(page, 'forYou')).toHaveText(['Writing a Rust CLI', 'Cargo workspaces', 'Spare story e']);
  });

  test('mutes typed keywords', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Mute' }).click();
    await page.getByRole('dialog').getByRole('textbox').fill('cargo, cli');
    await page.getByRole('dialog').getByRole('button', { name: 'Mute', exact: true }).click();
    await expect(cardTitles(page, 'forYou')).toHaveText(['Rust ownership explained', 'Another alpha post', 'Spare story e']);
  });

  test('can be undone right away', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Mute' }).click();
    await page.getByRole('dialog').getByLabel('Site: alpha.dev').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Mute', exact: true }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(cardTitles(page, 'forYou')).toHaveText(['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
  });

  test('is remembered after reopening and can be removed from the Muted tab', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Mute' }).click();
    await page.getByRole('dialog').getByLabel('Site: alpha.dev').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Mute', exact: true }).click();
    await expect(page.getByText('Muted "alpha.dev"')).toBeVisible();

    await page.reload();
    await expect(page.locator('#section-forYou')).not.toContainText('alpha.dev');

    await page.getByRole('link', { name: /Muted/ }).click();
    await expect(page.getByText('alpha.dev')).toBeVisible();
    await page.getByRole('button', { name: 'Unmute' }).click();
    await page.getByRole('link', { name: /Today/ }).click();
    await expect(page.locator('#section-forYou')).toContainText('alpha.dev');
  });

  test('closes without muting when cancelled', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Mute' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(cardTitles(page, 'forYou')).toHaveCount(3);
  });
});

test.describe('read later', () => {
  test('saves a story to the Later tab, keeps it after reopening, and removes it', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Read later' }).click();
    await expect(page.getByRole('link', { name: /Later/ })).toContainText('1');

    await page.reload();
    await page.getByRole('link', { name: /Later/ }).click();
    await expect(page.locator('.card-title')).toHaveText(['Rust ownership explained']);

    await page.getByRole('button', { name: 'Remove from Read later' }).click();
    await expect(page.getByText('Nothing saved for later')).toBeVisible();
  });

  test('keeps saved stories after the feed changes', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Read later' }).click();

    await page.unroute('**/feed.json');
    await openWith(page, makeFeed({ sections: [] }), '#later');
    await expect(page.locator('.card-title')).toHaveText(['Rust ownership explained']);
  });
});

test.describe('like and read', () => {
  test('like toggles and is remembered', async ({ page }) => {
    await openWith(page, makeFeed());
    const card = page.locator('#section-forYou .card').first();
    await card.getByRole('button', { name: 'Like' }).click();
    await expect(card.getByRole('button', { name: 'Remove like' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('#section-forYou .card').first().getByRole('button', { name: 'Remove like' })).toBeVisible();
  });

  test('opening a story marks it as read and opens it in a new tab', async ({ page, context }) => {
    await context.route('https://alpha.dev/**', (route) => route.fulfill({ body: 'article' }));
    await openWith(page, makeFeed());
    const card = page.locator('#section-forYou .card').first();
    const popup = page.waitForEvent('popup');
    await card.getByRole('link', { name: 'Rust ownership explained' }).click();
    await (await popup).close();
    await expect(card).toHaveClass(/is-read/);
  });
});

test.describe('theme and reload', () => {
  test('cycles system → light → dark and remembers the choice', async ({ page }) => {
    await openWith(page, makeFeed());
    const toggle = page.locator('#theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#theme').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });

  test('the reload button reports when nothing changed', async ({ page }) => {
    await openWith(page, makeFeed());
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByText('Already up to date')).toBeVisible();
  });
});
