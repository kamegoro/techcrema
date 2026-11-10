// What the reader did, kept in this browser only: read stories, Read later, mutes.
import { t } from './i18n.js';
import { toast } from './toast.js';

export const STATE_KEY = 'techcrema-state-v1';
// Oldest first out, so localStorage never fills up
const MAX_READ = 3000;
const MAX_LATER = 300;

const empty = () => ({ read: [], later: [], mute: { keywords: [], domains: [] } });

const strings = (value) =>
  Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 2048) : [];

const isSavedStory = (x) =>
  x && typeof x.key === 'string' && typeof x.title === 'string' && Array.isArray(x.appearances);

/** Checks every value, so data from an older version or a broken save can't break the page */
export function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return empty();
    return {
      read: strings(raw.read),
      later: Array.isArray(raw.later)
        ? raw.later
            .filter(isSavedStory)
            .map((x) => ({ ...x, tags: strings(x.tags), matchedKeywords: strings(x.matchedKeywords) }))
        : [],
      mute: { keywords: strings(raw.mute?.keywords), domains: strings(raw.mute?.domains) },
    };
  } catch {
    return empty();
  }
}

export function saveState(state) {
  state.read = state.read.slice(-MAX_READ);
  state.later = state.later.slice(0, MAX_LATER);
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    toast(t('save.failed'));
  }
}
