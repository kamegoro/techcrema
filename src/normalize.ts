import { isHttpUrl } from './security.ts';
import type { Appearance, RawItem, Story } from './types.ts';

const TRACKING_PARAM_PREFIXES = ['utm_'];
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'ref',
  'ref_src',
  'source',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
]);

/**
 * 同じ記事を同じキーにするためのURL正規化。
 * 例: "https://www.Example.com/post/?utm_source=hn#top" → "example.com/post"
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
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const path = url.pathname.replace(/\/+$/, '');
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  // パスは大文字小文字を区別するサイトがあるので小文字化しない
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
 * ひらがな・カタカナがあれば日本語、漢字だけなら中国語、それ以外は英語とみなす。
 * (漢字だけだと日本語と中国語を区別できないため、かなの有無で判定する)
 */
export function detectLang(title: string): Story['lang'] {
  if (/[぀-ヿ]/.test(title)) return 'ja';
  if (/[㐀-鿿]/.test(title)) return 'zh';
  return 'en';
}

/**
 * 同じURLの記事を1つのStoryにまとめる。
 * percentiles は「RawItem → そのプラットフォーム内パーセンタイル」の対応(公式はnull)。
 */
export function mergeIntoStories(items: RawItem[], percentileOf: (item: RawItem) => number | null): Story[] {
  const byKey = new Map<string, Story>();
  for (const item of items) {
    // 外部APIの値は型を信用しない。文字列でないもの・http(s)でないURLは捨てる
    if (typeof item.title !== 'string' || !item.title.trim() || !isHttpUrl(item.url)) continue;
    item.tags = Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [];
    if (typeof item.score !== 'number' || !Number.isFinite(item.score)) item.score = null;
    if (item.discussionUrl !== undefined && !isHttpUrl(item.discussionUrl)) item.discussionUrl = undefined;
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
      });
      continue;
    }
    // 同じプラットフォームに重複して載っている場合は、スコアの高いほうを残す
    const sameSource = existing.appearances.findIndex((a) => a.source === item.source);
    if (sameSource >= 0) {
      const prev = existing.appearances[sameSource]!;
      if ((item.score ?? -1) > (prev.score ?? -1)) existing.appearances[sameSource] = appearance;
    } else {
      existing.appearances.push(appearance);
    }
    existing.tags = [...new Set([...existing.tags, ...item.tags])];
    existing.publisher ??= item.publisher;
    existing.releaseKind ??= item.releaseKind;
    if (!existing.publishedAt || (item.publishedAt && item.publishedAt < existing.publishedAt)) {
      existing.publishedAt = item.publishedAt ?? existing.publishedAt;
    }
  }
  return [...byKey.values()];
}
