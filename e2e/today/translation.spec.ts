/** Titles in another language get a line in the page's language, when the browser can translate on the device */
import { makeFeed, story } from '#e2e/support/feeds.ts';
import { expect, test } from '#e2e/support/test.ts';

/** A Japanese page whose Official section leads with a story already in Japanese */
function japanesePage() {
  const feed = makeFeed({ language: 'ja' });
  feed.sections[0]?.stories.unshift(story('ja', { title: 'Node.js 26 の新機能', lang: 'ja' }));
  return feed;
}

test.describe('Translated titles', () => {
  test('an English title gets a Japanese line under it, and both open the story', async ({ reader }) => {
    await reader.haveOnDeviceTranslation('available');
    await reader.open(japanesePage());
    await reader.expectTranslation('Rust ownership explained', '[ja] Rust ownership explained');
    await expect(reader.story('Rust ownership explained [ja] Rust ownership explained')).toMatchAriaSnapshot(`
      - heading "Rust ownership explained [ja] Rust ownership explained" [level=3]:
        - link "Rust ownership explained [ja] Rust ownership explained":
          - /url: https://alpha.dev/a
    `);
  });

  test('a title already in the language of the page is left as it is', async ({ reader }) => {
    await reader.haveOnDeviceTranslation('available');
    await reader.open(japanesePage());
    await reader.expectTranslation('Rust ownership explained', '[ja] Rust ownership explained');
    await reader.expectTranslation('Node.js 26 の新機能', null);
  });

  test('on an English page English titles are left as they are', async ({ reader }) => {
    await reader.haveOnDeviceTranslation('available');
    await reader.open(makeFeed());
    await reader.expectTranslation('Rust ownership explained', null);
  });

  test('a browser that cannot translate on the device shows the titles as they are', async ({ reader }) => {
    await reader.open(japanesePage());
    await reader.expectTranslation('Rust ownership explained', null);
  });

  test('when the language has to be downloaded first, translations appear after the next tap', async ({ reader }) => {
    await reader.haveOnDeviceTranslation('downloadable');
    await reader.open(japanesePage());
    await reader.expectTranslation('Rust ownership explained', null);
    await reader.tapThePage();
    await reader.expectTranslation('Rust ownership explained', '[ja] Rust ownership explained');
  });
});
