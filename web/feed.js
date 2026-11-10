// Today's feed.json, and what of it to show given the reader's mutes and read stories.
import { t } from './i18n.js';

export async function fetchFeed() {
  const res = await fetch('./feed.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status === 404 ? t('load.missing') : `HTTP ${res.status}`);
  return res.json();
}

function keywordMatcher(keyword) {
  const k = keyword.trim().toLowerCase();
  if (!k) return () => false;
  if (/^\p{ASCII}+$/u.test(k)) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
    return (text) => re.test(text);
  }
  return (text) => text.toLowerCase().includes(k);
}

function muteFilter(mute) {
  const domains = mute.domains.map((d) => d.toLowerCase());
  const keywords = mute.keywords.map(keywordMatcher);
  return (story) => {
    const domain = (story.domain ?? '').toLowerCase();
    if (domains.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
    const text = `${story.title} ${(story.tags ?? []).join(' ')}`;
    return keywords.some((matches) => matches(text));
  };
}

/**
 * Each section without muted stories, read ones after the unread (a second visit shows what is left),
 * cut to its limit unless it was expanded. `more` counts what "Show more" would add.
 */
export function visibleSections(feed, state, expanded) {
  const isMuted = muteFilter(state.mute);
  const read = new Set(state.read);
  return feed.sections.map((section) => {
    const kept = section.stories.filter((story) => !isMuted(story));
    const ordered = [...kept.filter((s) => !read.has(s.key)), ...kept.filter((s) => read.has(s.key))];
    const shown = expanded.has(section.id) ? ordered : ordered.slice(0, section.limit ?? ordered.length);
    return { ...section, stories: shown, more: ordered.length - shown.length };
  });
}

export const sectionTitle = (section) => section.title ?? t(`section.${section.id}`);
