/** Moving around the page */
import { makeFeed } from '#e2e/support/feeds.ts';
import { test } from '#e2e/support/test.ts';

test.describe('Section list', () => {
  test('a section can be reached from the section list', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.jumpToSection('New repos');
    await reader.expectSectionInView('New repos');
  });

  test('the section list stays on screen while the title scrolls away', async ({ reader, page }) => {
    await page.setViewportSize({ width: 390, height: 420 });
    await reader.open(makeFeed());
    await reader.jumpToSection('New repos');
    await reader.expectSectionInView('New repos');
    await reader.expectSectionListOnScreen();
  });
});
