/** What a reader does and sees, one method per step, like Gauge concepts. Built on semantic.ts. */
import { expect, type Page, test } from '@playwright/test';
import type { Feed } from '../../src/types.ts';
import { NOW } from './feeds.ts';
import * as ui from './semantic.ts';

/** Runs `body` as a named step in the report; failures point at the spec line, not at this file */
const step = <T>(title: string, body: () => Promise<T>) => test.step(title, body, { box: true });

export type Tab = 'Today' | 'Later' | 'Muted';

export class Reader {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // --- Opening the page -----------------------------------------------------

  /** Opens the page with `feed` as today's feed.json (null: no feed has been generated yet) */
  async open(feed: Feed | null, tab: Tab = 'Today') {
    await step(`Open the ${tab} page`, async () => {
      await this.serveFeed(feed);
      // Time stands still unless a test moves it, so timers (like the message that hides itself) never race the test
      // (installed a second early because pauseAt can only move forward)
      await this.page.clock.install({ time: NOW.getTime() - 1000 });
      await this.page.clock.pauseAt(NOW);
      await this.page.goto(tab === 'Today' ? './' : `./#${tab === 'Later' ? 'later' : 'settings'}`);
    });
  }

  /** The next time the page loads feed.json, it gets `feed` */
  async serveFeed(feed: Feed | null) {
    await this.page.unroute('**/feed.json');
    await this.page.route('**/feed.json', (route) =>
      feed ? route.fulfill({ json: feed }) : route.fulfill({ status: 404, body: '' }),
    );
  }

  async reopen() {
    await step('Close and reopen the page', () => this.page.reload());
  }

  async goToTab(tab: Tab) {
    await step(`Go to the ${tab} tab`, async () => {
      await ui.link(ui.navigation(this.page, 'Views'), new RegExp(`^${tab}`)).click();
      await this.expectCurrentTab(tab);
    });
  }

  async expectCurrentTab(tab: Tab) {
    await expect(ui.link(ui.navigation(this.page, 'Views'), new RegExp(`^${tab}`))).toHaveAttribute(
      'aria-current',
      'page',
    );
  }

  /** The number next to a tab, e.g. Today 8 */
  async expectTabCount(tab: Tab, count: number | null) {
    await step(`The ${tab} tab shows ${count ?? 'no'} count`, async () => {
      const tabLink = ui.link(ui.navigation(this.page, 'Views'), new RegExp(`^${tab}`));
      await expect(tabLink).toHaveAccessibleName(count === null ? tab : `${tab} ${count}`);
    });
  }

  // --- Sections and stories -------------------------------------------------

  section(name: string) {
    return ui.region(this.page, name);
  }

  story(title: string) {
    return ui.article(this.page, title).first();
  }

  async expectSections(names: string[]) {
    await step(`The page shows the sections ${names.join(', ')}`, async () => {
      await expect(ui.heading(this.page.getByRole('main'), /.*/, 2)).toHaveText(names);
    });
  }

  /** Story titles in a section, in order */
  async expectStories(sectionName: string, titles: string[]) {
    await step(
      `"${sectionName}" shows ${titles.length ? titles.map((t) => `"${t}"`).join(', ') : 'nothing'}`,
      async () => {
        await expect(ui.heading(this.section(sectionName), /.*/, 3)).toHaveText(titles);
      },
    );
  }

  async expectNoStoryFrom(sectionName: string, domain: string) {
    await step(`"${sectionName}" shows nothing from ${domain}`, async () => {
      await expect(this.section(sectionName)).not.toContainText(domain);
    });
  }

  async jumpToSection(name: string) {
    await step(`Jump to "${name}" from the section list`, () =>
      ui.link(ui.navigation(this.page, 'Sections'), new RegExp(`^${name}`)).click(),
    );
  }

  async expectSectionInView(name: string) {
    await expect(ui.heading(this.section(name), name, 2)).toBeInViewport();
  }

  async openStory(title: string) {
    await step(`Open the story "${title}"`, async () => {
      const popup = this.page.waitForEvent('popup');
      await ui.link(this.story(title), title).click();
      await (await popup).close();
    });
  }

  async expectStoryRead(title: string) {
    await step(`"${title}" is marked as read`, async () => {
      await expect(this.story(title)).toContainText('Read');
    });
  }

  // --- Like and Read later --------------------------------------------------

  async like(title: string) {
    await step(`Like "${title}"`, () => ui.button(this.story(title), 'Like').click());
  }

  async expectLiked(title: string, liked = true) {
    await step(`"${title}" is ${liked ? '' : 'not '}liked`, async () => {
      await expect(ui.button(this.story(title), liked ? 'Remove like' : 'Like')).toHaveAttribute(
        'aria-pressed',
        String(liked),
      );
    });
  }

  async saveForLater(title: string) {
    await step(`Save "${title}" for later`, () => ui.button(this.story(title), 'Read later').click());
  }

  async removeFromLater(title: string) {
    await step(`Remove "${title}" from Read later`, () =>
      ui.button(this.story(title), 'Remove from Read later').click(),
    );
  }

  async expectLaterList(titles: string[]) {
    await step(`Read later holds ${titles.map((t) => `"${t}"`).join(', ') || 'nothing'}`, async () => {
      await expect(ui.heading(this.page.getByRole('main'), /.*/, 3)).toHaveText(titles);
    });
  }

  // --- Mute -------------------------------------------------------------------

  muteSheet() {
    return ui.dialog(this.page);
  }

  async openMuteSheet(title: string) {
    await step(`Open the mute options for "${title}"`, async () => {
      await ui.button(this.story(title), 'Mute').click();
      await expect(this.muteSheet()).toBeVisible();
    });
  }

  async chooseToMute(option: string) {
    await step(`Choose "${option}"`, () => ui.checkbox(this.muteSheet(), option).check());
  }

  async typeKeywordsToMute(keywords: string) {
    await step(`Type "${keywords}" as keywords to mute`, () =>
      ui.textbox(this.muteSheet(), 'Add keywords').fill(keywords),
    );
  }

  async confirmMute() {
    await step('Confirm the mute', async () => {
      await ui.button(this.muteSheet(), 'Mute').click();
      await expect(this.muteSheet()).toBeHidden();
    });
  }

  async cancelMute() {
    await step('Cancel the mute', async () => {
      await ui.button(this.muteSheet(), 'Cancel').click();
      await expect(this.muteSheet()).toBeHidden();
    });
  }

  /** The whole flow: open the options, tick the site, confirm */
  async muteSiteOf(title: string, domain: string) {
    await this.openMuteSheet(title);
    await this.chooseToMute(`Site: ${domain}`);
    await this.confirmMute();
    await this.expectMessage(`Muted "${domain}"`);
  }

  async unmute(value: string) {
    await step(`Unmute ${value}`, () => ui.button(ui.region(this.page, 'Muted'), `Unmute ${value}`).click());
  }

  async expectMutedList(values: string[]) {
    await step(`The Muted tab lists ${values.join(', ') || 'nothing'}`, async () => {
      const items = ui.region(this.page, 'Muted').getByRole('listitem');
      await expect(items).toHaveCount(values.length);
      for (const [i, v] of values.entries()) await expect(items.nth(i)).toContainText(v);
    });
  }

  // --- Messages, theme, reload ---------------------------------------------

  async expectMessage(text: string) {
    await step(`A message says "${text}"`, async () => {
      await expect(ui.status(this.page).filter({ hasText: text })).toBeVisible();
    });
  }

  async waitSeconds(seconds: number) {
    await step(`Wait ${seconds} seconds`, () => this.page.clock.runFor(seconds * 1000));
  }

  async expectNoMessage() {
    await step('No message is shown', async () => {
      await expect(ui.status(this.page)).toBeHidden();
    });
  }

  async undoFromMessage() {
    await step('Undo from the message', () => ui.button(ui.status(this.page), 'Undo').click());
  }

  async expectText(text: string) {
    await step(`The page says "${text}"`, async () => {
      await expect(ui.paragraph(this.page, text)).toBeVisible();
    });
  }

  async switchTheme() {
    await step('Switch the theme', () => ui.button(this.page, /^Theme:/).click());
  }

  async expectTheme(mode: 'System' | 'Light' | 'Dark') {
    await step(`The theme is ${mode}`, async () => {
      await expect(ui.button(this.page, /^Theme:/)).toHaveAccessibleName(`Theme: ${mode} (tap to change)`);
    });
  }

  async reloadFeed() {
    await step('Reload the feed', () => ui.button(this.page, 'Reload').click());
  }
}
