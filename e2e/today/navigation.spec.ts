/** Moving around the page */
import { makeFeed } from '../support/feeds.ts';
import { test } from '../support/test.ts';

test.describe('Section list', () => {
  test('a section can be reached from the section list', async ({ reader }) => {
    await reader.open(makeFeed());
    await reader.jumpToSection('New repos');
    await reader.expectSectionInView('New repos');
  });
});
