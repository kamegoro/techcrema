// The page: holds the feed and the reader's state, and turns what the reader does into changes on screen.
import { $ } from './dom.js';
import { fetchFeed, visibleSections } from './feed.js';
import { setLanguage, t, translateDocument } from './i18n.js';
import { openMuteSheet, setUpMuteSheet } from './mute-sheet.js';
import { currentTab, renderHeader, renderLater, renderMuted, renderToday } from './pages.js';
import { loadState, STATE_KEY, saveState } from './state.js';
import { createStoryView } from './story.js';
import { setUpTheme } from './theme.js';
import { offeringAction, toast } from './toast.js';

let feed = null;
let loadError = null;
let state = loadState();
/** A newer feed.json, held back until the reader asks for it, so nothing changes under their thumb */
let pendingFeed = null;
/** Sections opened with "Show more", until the page is reloaded */
const expanded = new Set();

const isRead = (key) => state.read.includes(key);
const isSaved = (key) => state.later.some((x) => x.key === key);
const withoutStory = (list, key) => list.filter((x) => (x.key ?? x) !== key);

const stories = createStoryView({
  isRead,
  isSaved,
  open: (story, fromLater) => (fromLater ? readFromLater(story) : markRead(story)),
  read: markRead,
  toggleLater,
  mute: openMuteSheet,
});

const sectionsNow = () => (feed ? visibleSections(feed, state, expanded) : []);

function render() {
  const sections = sectionsNow();
  renderHeader({ feed, sections, state });
  const main = $('main');
  main.replaceChildren();
  stories.forget();
  const tab = currentTab();
  if (tab === 'later') renderLater(main, { state, storyItem: stories.item });
  else if (tab === 'settings') renderMuted(main, { state, unmute });
  else renderToday(main, { feed, sections, loadError, storyItem: stories.item, showMore });
}

/** A change to one story: save it and redraw just that story, so the page doesn't move */
function changed(story) {
  saveState(state);
  renderHeader({ feed, sections: sectionsNow(), state });
  stories.redraw(story.key);
}

function markRead(story) {
  if (isRead(story.key)) return;
  state.read = [...state.read, story.key];
  changed(story);
}

function toggleLater(story) {
  // The whole story is saved, so it is still there when tomorrow's feed no longer has it
  state.later = isSaved(story.key) ? withoutStory(state.later, story.key) : [story, ...state.later];
  if (currentTab() === 'later') {
    saveState(state);
    render();
  } else changed(story);
}

/** Opening a saved story is what saving it was for, so it leaves the list (with Undo) */
function readFromLater(story) {
  const index = state.later.findIndex((x) => x.key === story.key);
  state.read = [...withoutStory(state.read, story.key), story.key];
  state.later = withoutStory(state.later, story.key);
  saveState(state);
  // The link still opens after it is taken off the page, so the list can change right away
  render();
  toast(t('later.done'), {
    label: t('undo'),
    run: () => {
      if (isSaved(story.key)) return;
      state.later.splice(Math.min(index, state.later.length), 0, story);
      saveState(state);
      render();
    },
  });
}

function mute(rules) {
  if (rules.domains.length + rules.keywords.length === 0) {
    toast(t('mute.none'));
    return;
  }
  state.mute.domains = [...new Set([...state.mute.domains, ...rules.domains])];
  state.mute.keywords = [...new Set([...state.mute.keywords, ...rules.keywords])];
  saveState(state);
  render();
  const label = [...rules.domains, ...rules.keywords].join(t('list.separator'));
  toast(t('mute.done', { label }), { label: t('undo'), run: () => unmute(rules, { quietly: true }) });
}

function unmute(rules, { quietly = false } = {}) {
  state.mute.domains = state.mute.domains.filter((d) => !rules.domains.includes(d));
  state.mute.keywords = state.mute.keywords.filter((k) => !rules.keywords.includes(k));
  saveState(state);
  render();
  if (!quietly) toast(t('mute.removed'));
}

function showMore(section) {
  expanded.add(section.id);
  render();
  // Keyboard and screen reader users carry on at the first story that appeared
  $(`section-${section.id}`)?.querySelectorAll('.story-link')[section.stories.length]?.focus({ preventScroll: true });
}

function show(next) {
  feed = next;
  pendingFeed = null;
  if (setLanguage(next.language)) translateDocument();
  if (next.title) {
    document.title = next.title;
    document.querySelector('.brand-title').textContent = next.title;
  }
  render();
}

/** The first load shows the feed; a later one (coming back to the page) offers a newer edition */
async function refresh() {
  let latest;
  try {
    latest = await fetchFeed();
  } catch (err) {
    // A failed refresh keeps what is already on the page
    if (!feed) {
      loadError = err;
      render();
    }
    return;
  }
  loadError = null;
  if (!feed) return show(latest);
  if (latest.generatedAt === feed.generatedAt) return;
  pendingFeed = latest;
  // An Undo on screen wins; the newer edition is offered again next time
  if (offeringAction()) return;
  toast(t('update.ready'), {
    label: t('update.show'),
    run: () => {
      show(pendingFeed);
      window.scrollTo(0, 0);
    },
  });
}

let loading = null;
/** One fetch at a time, so the first load and a quick return to the page don't both draw it */
function load() {
  loading ??= refresh().finally(() => {
    loading = null;
  });
  return loading;
}

translateDocument();
setUpTheme();
setUpMuteSheet(mute);
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
// Reopened on the commute: check for a newer edition
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});
// Mutes and the like changed in another tab
window.addEventListener('storage', (e) => {
  if (e.key !== STATE_KEY) return;
  state = loadState();
  render();
});
load();
