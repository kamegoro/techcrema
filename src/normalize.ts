import type { Appearance, RawItem, Story } from './types.ts';

/** Only http(s) URLs are kept; javascript:, data: and the like are dropped */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const TRACKING_PARAM_PREFIXES = ['utm_'];
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'ref', 'ref_src', 'source', 'mc_cid', 'mc_eid', 'igshid', 'si']);

/**
 * Normalizes a URL so the same article gets the same key everywhere.
 * e.g. "https://www.Example.com/post/?utm_source=hn#top" → "example.com/post"
 */
export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return input.trim().toLowerCase();
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...url.searchParams.entries()]
    .filter(([k]) => {
      const key = k.toLowerCase();
      return !TRACKING_PARAMS.has(key) && !TRACKING_PARAM_PREFIXES.some((p) => key.startsWith(p));
    })
    .sort(([a], [b]) => Number(a > b) - Number(a < b));
  const path = url.pathname.replace(/\/+$/, '');
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  // Paths stay as they are: some sites treat them case-sensitively
  return `${host}${path}${query}`;
}

export function domainOf(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Kana means Japanese, CJK ideographs without kana mean Chinese, anything else is treated as English.
 * (Ideographs alone can't tell Japanese from Chinese, so kana decides.)
 */
export function detectLang(title: string): Story['lang'] {
  if (/[\u3040-\u30ff]/.test(title)) return 'ja';
  if (/[\u3400-\u9fff]/.test(title)) return 'zh';
  return 'en';
}

/**
 * Checks an item from outside (an API or feed) before anything uses it: types aren't trusted.
 * Returns null for items without a title or an http(s) link; repairs the rest.
 */
export function sanitizeItem(item: RawItem): RawItem | null {
  if (typeof item.title !== 'string' || !item.title.trim() || !isHttpUrl(item.url)) return null;
  return {
    ...item,
    tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [],
    score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null,
    discussionUrl: isHttpUrl(item.discussionUrl) ? item.discussionUrl : undefined,
  };
}

/**
 * Merges items with the same URL into one Story.
 * Expects items checked by sanitizeItem. percentileOf maps an item to its percentile within its platform
 * (null for official sources).
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
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
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
      });
      continue;
    }
    if (item.lookups) existing.lookups = [...new Set([...(existing.lookups ?? []), ...item.lookups])];
    // Listed twice on the same platform: keep the higher score
    const sameSource = existing.appearances.findIndex((a) => a.source === item.source);
    const prev = existing.appearances[sameSource];
    if (prev) {
      if ((item.score ?? -1) > (prev.score ?? -1)) existing.appearances[sameSource] = appearance;
    } else {
      existing.appearances.push(appearance);
    }
    existing.tags = [...new Set([...existing.tags, ...item.tags])];
    existing.publisher ??= item.publisher;
    existing.releaseKind ??= item.releaseKind;
    // Keep the earliest known date
    if (item.publishedAt && (!existing.publishedAt || item.publishedAt < existing.publishedAt)) {
      existing.publishedAt = item.publishedAt;
    }
  }
  return [...byKey.values()];
}
