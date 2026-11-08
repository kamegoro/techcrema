/** Muting sites and keywords from a story, and taking it back */
import { makeFeed } from '../support/feeds.ts';
import { expect, test } from '../support/test.ts';

test.describe('Mute', () => {
  test.beforeEach(async ({ reader }) => {
    await reader.open(makeFeed());
  });

  test("the mute options offer the story's site and matched keywords", async ({ reader }) => {
    await reader.openMuteSheet('Rust ownership explained');
    await expect(reader.muteSheet()).toMatchAriaSnapshot(`
      - dialog "What do you want to mute?":
        - heading "What do you want to mute?" [level=2]
        - paragraph: Rust ownership explained
        - group "Suggestions":
          - 'checkbox "Site: alpha.dev"'
          - 'checkbox "Keyword: rust"'
        - textbox "Add keywords"
        - button "Cancel"
        - button "Mute"
    `);
  });

  test('muting a site hides it and refills the section from spare stories', async ({ reader }) => {
    await reader.muteSiteOf('Rust ownership explained', 'alpha.dev');
    await reader.expectStories('For you', ['Writing a Rust CLI', 'Cargo workspaces', 'Spare story e']);
  });

  test('typed keywords are muted', async ({ reader }) => {
    await reader.openMuteSheet('Rust ownership explained');
    await reader.typeKeywordsToMute('cargo, cli');
    await reader.confirmMute();
    await reader.expectStories('For you', ['Rust ownership explained', 'Another alpha post', 'Spare story e']);
  });

  test('a mute can be undone from the message', async ({ reader }) => {
    await reader.muteSiteOf('Rust ownership explained', 'alpha.dev');
    await reader.undoFromMessage();
    await reader.expectStories('For you', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
  });

  test('the message offering Undo goes away after a few seconds', async ({ reader }) => {
    await reader.muteSiteOf('Rust ownership explained', 'alpha.dev');
    await reader.waitSeconds(5);
    await reader.expectMessage('Muted "alpha.dev"');
    await reader.waitSeconds(2);
    await reader.expectNoMessage();
  });

  test('cancelling mutes nothing', async ({ reader }) => {
    await reader.openMuteSheet('Rust ownership explained');
    await reader.chooseToMute('Site: alpha.dev');
    await reader.cancelMute();
    await reader.expectStories('For you', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
  });

  test('confirming with nothing chosen says so', async ({ reader }) => {
    await reader.openMuteSheet('Rust ownership explained');
    await reader.confirmMute();
    await reader.expectMessage('Nothing selected to mute');
  });

  test('mutes are remembered after reopening', async ({ reader }) => {
    await reader.muteSiteOf('Rust ownership explained', 'alpha.dev');
    await reader.reopen();
    await reader.expectNoStoryFrom('For you', 'alpha.dev');
    await reader.expectTabCount('Muted', 1);
  });

  test('the Muted tab lists mutes and can remove them', async ({ reader }) => {
    await reader.muteSiteOf('Rust ownership explained', 'alpha.dev');
    await reader.goToTab('Muted');
    await reader.expectMutedList(['alpha.dev']);
    await reader.unmute('alpha.dev');
    await reader.expectText('Nothing muted');
    await reader.goToTab('Today');
    await reader.expectStories('For you', ['Rust ownership explained', 'Writing a Rust CLI', 'Another alpha post']);
  });
});
