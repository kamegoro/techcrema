// Items from the sources become stories: one per article, however many sites list it.
import { detectLang } from '#src/lib/text.ts';
import { domainOf, isHttpUrl, normalizeUrl } from '#src/lib/url.ts';
import type { Appearance, RawItem, Story } from '#src/types.ts';

/** Checks an item from outside before anything uses it: null when it has no title or no http(s) link */
export function sanitizeItem(item: RawItem): RawItem | null {
  if (typeof item.title !== 'string' || !item.title.trim() || !isHttpUrl(item.url)) return null;
  return {
    ...item,
    tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [],
    score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null,
    discussionUrl: isHttpUrl(item.discussionUrl) ? item.discussionUrl : undefined,
  };
}

function newStory(key: string, item: RawItem, appearance: Appearance): Story {
  return {
    key,
    url: item.url,
    title: item.title,
    domain: domainOf(item.url),
    lang: detectLang(item.title),
    tags: [...new Set(item.tags)],
    publishedAt: item.publishedAt,
    appearances: [appearance],
    pop: 0,
    interest: 0,
    topics: [],
    matchedKeywords: [],
    publisher: item.publisher,
    releaseKind: item.releaseKind,
    lookups: item.lookups,
  };
}

function addAppearance(story: Story, item: RawItem, appearance: Appearance): void {
  const onSameSite = story.appearances.findIndex((a) => a.source === item.source);
  const previous = story.appearances[onSameSite];
  if (!previous) story.appearances.push(appearance);
  else if ((item.score ?? -1) > (previous.score ?? -1)) story.appearances[onSameSite] = appearance;

  story.tags = [...new Set([...story.tags, ...item.tags])];
  if (item.lookups) story.lookups = [...new Set([...(story.lookups ?? []), ...item.lookups])];
  story.publisher ??= item.publisher;
  story.releaseKind ??= item.releaseKind;
  if (item.publishedAt && (!story.publishedAt || item.publishedAt < story.publishedAt)) {
    story.publishedAt = item.publishedAt;
  }
}

/**
 * Merges sanitized items that link the same article. `percentileOf` places an item's score
 * within its site (null for official sources).
 */
export function mergeIntoStories(items: RawItem[], percentileOf: (item: RawItem) => number | null): Story[] {
  const byKey = new Map<string, Story>();
  for (const item of items) {
    const key = normalizeUrl(item.url);
    const appearance: Appearance = {
      source: item.source,
      score: item.score,
      scoreLabel: item.scoreLabel,
      discussionUrl: item.discussionUrl,
      percentile: percentileOf(item),
    };
    const story = byKey.get(key);
    if (story) addAppearance(story, item, appearance);
    else byKey.set(key, newStory(key, item, appearance));
  }
  return [...byKey.values()];
}
