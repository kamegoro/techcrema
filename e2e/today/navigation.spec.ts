/** Moving around the page */
import { makeFeed } from '../support/feeds.ts';
import { expect, test } from '../support/test.ts';

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
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeInViewport();
    await expect(page.getByRole('heading', { level: 1 })).not.toBeInViewport();
  });
});
