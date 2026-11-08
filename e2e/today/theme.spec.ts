/** Light and dark mode */
import { makeFeed } from '../support/feeds.ts';
import { test } from '../support/test.ts';

test.describe('Dark mode', () => {
  test('follows the system until the reader chooses', async ({ reader, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await reader.open(makeFeed());
    await reader.expectDarkMode(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await reader.expectDarkMode(false);
  });

  test('the toggle switches between light and dark', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.expectDarkMode(false);
    await reader.toggleDarkMode();
    await reader.expectDarkMode(true);
    await reader.toggleDarkMode();
    await reader.expectDarkMode(false);
  });

  test('the choice is remembered and wins over the system', async ({ reader, page }) => {
    await reader.open(makeFeed());
    await reader.toggleDarkMode();
    await reader.reopen();
    await page.emulateMedia({ colorScheme: 'light' });
    await reader.expectDarkMode(true);
  });
});
