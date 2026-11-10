/** What a reader does and sees, one method per step, like Gauge concepts. Built on semantic.ts. */
import { expect, type Page, test } from '@playwright/test';
import type { Feed } from '#src/types.ts';
import { NOW } from './feeds.ts';
import * as ui from './semantic.ts';

/** Runs `body` as a named step in the report; failures point at the spec line, not at this file */
/** Matches an accessible name that starts with `text` */
const startingWith = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

const step = <T>(title: string, body: () => Promise<T>) => test.step(title, body, { box: true });

export type Tab = 'Today' | 'Later' | 'Muted';

export class Reader {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

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
    await step(`The ${tab} tab is the current one`, async () => {
      await expect(ui.link(ui.navigation(this.page, 'Views'), new RegExp(`^${tab}`))).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  }

  /** The number next to a tab, e.g. Today 7 */
  async expectTabCount(tab: Tab, count: number | null) {
    await step(`The ${tab} tab shows ${count ?? 'no'} count`, async () => {
      const tabLink = ui.link(ui.navigation(this.page, 'Views'), new RegExp(`^${tab}`));
      await expect(tabLink).toHaveAccessibleName(count === null ? tab : `${tab} ${count}`);
    });
  }

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

  /** Opens the stories a section keeps behind its "Show N more" button */
  async showMore(sectionName: string) {
    await step(`Show the rest of "${sectionName}"`, () =>
      ui.button(this.section(sectionName), /^Show \d+ more$/).click(),
    );
  }

  async expectMoreToShow(sectionName: string, count: number | null) {
    await step(`"${sectionName}" offers ${count ?? 'no'} more stories`, async () => {
      const more = ui.button(this.section(sectionName), /^Show \d+ more$/);
      if (count === null) await expect(more).toHaveCount(0);
      else await expect(more).toHaveAccessibleName(`Show ${count} more`);
    });
  }

  async jumpToSection(name: string) {
    await step(`Jump to "${name}" from the section list`, () =>
      ui.link(ui.navigation(this.page, 'Sections'), new RegExp(`^${name}`)).click(),
    );
  }

  async expectSectionInView(name: string) {
    await step(`"${name}" is on screen`, async () => {
      await expect(ui.heading(this.section(name), name, 2)).toBeInViewport();
    });
  }

  async expectSectionListOnScreen() {
    await step('The section list is still on screen and the page title is not', async () => {
      await expect(ui.navigation(this.page, 'Sections')).toBeInViewport();
      await expect(ui.heading(this.page, /.*/, 1)).not.toBeInViewport();
    });
  }

  async expectLanguage(lang: string) {
    await step(`The page is marked as language "${lang}"`, async () => {
      await expect(this.page.locator('html')).toHaveAttribute('lang', lang);
    });
  }

  async expectPageTitle(title: string) {
    await step(`The page is titled "${title}"`, async () => {
      await expect(ui.heading(this.page, /.*/, 1)).toHaveText(title);
      await expect(this.page).toHaveTitle(title);
    });
  }

  async expectNoSidewaysScroll() {
    await step('Nothing sticks out sideways', async () => {
      expect(
        await this.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
    });
  }

  /** The browser keeps what an older or broken version of the page saved */
  async haveSavedState(saved: string) {
    await step('The browser holds state saved by an older or broken version of the page', () =>
      this.page.addInitScript((value) => localStorage.setItem('techcrema-state-v1', value), saved),
    );
  }

  /**
   * The browser can translate on the device: right away ('available'), or once the language is downloaded,
   * which it does after the reader's next tap ('downloadable'). Translations read "[ja] <title>".
   */
  async haveOnDeviceTranslation(availability: 'available' | 'downloadable') {
    await step(
      availability === 'available'
        ? 'The browser can translate on the device'
        : 'The browser can translate on the device once it downloads the language',
      () =>
        this.page.addInitScript((availability) => {
          Object.assign(window, {
            Translator: {
              availability: async () => availability,
              create: async ({ targetLanguage }: { targetLanguage: string }) => ({
                translate: async (text: string) => `[${targetLanguage}] ${text}`,
              }),
            },
          });
        }, availability),
    );
  }

  /** Clicks somewhere that does nothing (the page title) */
  async tapThePage() {
    await step('Tap the page', () => ui.heading(this.page, /.*/, 1).click());
  }

  async expectTranslation(title: string, translation: string | null) {
    await step(
      translation ? `"${title}" is also shown as "${translation}"` : `"${title}" is shown untranslated`,
      async () => {
        await expect(ui.heading(this.page, startingWith(title), 3).first()).toHaveAccessibleName(
          translation ? `${title} ${translation}` : title,
        );
      },
    );
  }

  /** Taps a comment under a story, which opens it to its full length or closes it again */
  async tapComment(title: string, start: string) {
    await step(`Tap the comment on "${title}" that starts "${start}"`, () =>
      ui.button(this.story(title), startingWith(start)).click(),
    );
  }

  async expectCommentOpen(title: string, start: string, open: boolean) {
    await step(`The comment on "${title}" that starts "${start}" is ${open ? 'open' : 'cut short'}`, async () => {
      await expect(ui.button(this.story(title), startingWith(start))).toHaveAttribute('aria-expanded', String(open));
    });
  }

  async openAllReactions(title: string) {
    await step(`Open everything people said about "${title}"`, async () => {
      const popup = this.page.waitForEvent('popup');
      await ui.link(this.story(title), /^All \d+ reactions on /).click();
      await (await popup).close();
    });
  }

  async openStory(title: string) {
    await step(`Open the story "${title}"`, async () => {
      const popup = this.page.waitForEvent('popup');
      await ui.link(this.story(title), title).click();
      await (await popup).close();
    });
  }

  /** Opens the story's discussion page (e.g. the HN comments) instead of the article */
  async openDiscussion(title: string) {
    await step(`Open the discussion of "${title}"`, async () => {
      const popup = this.page.waitForEvent('popup');
      await ui.link(this.story(title), /^Discussion on/).click();
      await (await popup).close();
    });
  }

  /** Switches to another app and back, as when returning from an article */
  async comeBack() {
    await step('Leave the page and come back to it', async () => {
      const checked = this.page.waitForResponse('**/feed.json');
      await this.page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await checked;
    });
  }

  async expectStoryRead(title: string) {
    await step(`"${title}" is marked as read`, async () => {
      await expect(this.story(title).getByText('Read', { exact: true })).toHaveCount(1);
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

  async showFromMessage() {
    await step('Choose Show in the message', () => ui.button(ui.status(this.page), 'Show').click());
  }

  async expectText(text: string) {
    await step(`The page says "${text}"`, async () => {
      await expect(ui.paragraph(this.page, text)).toBeVisible();
    });
  }

  async toggleDarkMode() {
    await step('Toggle dark mode', () => ui.button(this.page, 'Dark mode').click());
  }

  async expectDarkMode(on: boolean) {
    await step(`Dark mode is ${on ? 'on' : 'off'}`, async () => {
      await expect(ui.button(this.page, 'Dark mode')).toHaveAttribute('aria-pressed', String(on));
      // The pressed state alone can't show that the page follows the system theme; the color scheme can
      await expect(this.page.locator('body')).toHaveCSS('color-scheme', on ? 'dark' : 'light');
    });
  }
}
