/**
 * Ranking. Popularity is a percentile within each platform, so 300 HN points and 300 Hatena bookmarks
 * land on the same scale. Popularity and interest are never blended into one score; sections combine them.
 */
import type { InterestConfig, LayoutConfig, Section, SourceId, Story } from './types.ts';

/**
 * Where `score` sits within `window`, from 0 to 1. Ties count half (midrank).
 * e.g. the top story out of 60 → (59 + 0.5) / 60 ≈ 0.99
 */
export function percentile(score: number, window: readonly number[] = []): number {
  if (window.length === 0) return 0.5;
  let less = 0;
  let equal = 0;
  for (const v of window) {
    if (v < score) less++;
    else if (v === score) equal++;
  }
  if (equal === 0) {
    // Count the score itself too, so this works even when the window doesn't contain it
    return (less + 0.5) / (window.length + 1);
  }
  return (less + equal / 2) / window.length;
}

const MULTI_PLATFORM_BONUS = 0.05;

/** Highest percentile across platforms, plus a bonus for each extra platform */
export function popularity(story: Pick<Story, 'appearances'>): number {
  const ranked = story.appearances.filter((a) => a.percentile !== null);
  if (ranked.length === 0) return 0;
  const best = Math.max(...ranked.map((a) => a.percentile as number));
  return Math.min(1, best + MULTI_PLATFORM_BONUS * (ranked.length - 1));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ASCII keywords match whole words ("go" does not match "google"); others, e.g. Japanese, match as substrings */
export function keywordMatcher(keyword: string): (text: string) => boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return () => false;
  if (/^\p{ASCII}+$/u.test(k)) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(k)}(?![a-z0-9])`, 'i');
    return (text) => re.test(text);
  }
  return (text) => text.toLowerCase().includes(k);
}

function storyText(story: Pick<Story, 'title' | 'tags'>): string {
  return `${story.title} ${story.tags.join(' ')}`;
}

export interface InterestResult {
  interest: number;
  topics: string[];
  matchedKeywords: string[];
}

/** "Node.js", "nodejs" and "NodeJS" are the same tag */
const tagKey = (tag: string) => tag.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function scoreInterest(story: Pick<Story, 'title' | 'tags'>, config: InterestConfig): InterestResult {
  const text = storyText(story);
  const storyTags = new Set(story.tags.map(tagKey));
  const matched: { name: string; weight: number }[] = [];
  const matchedKeywords: string[] = [];
  for (const [name, topic] of Object.entries(config.topics)) {
    const hits = topic.keywords.filter((k) => keywordMatcher(k)(text));
    if (hits.length === 0 && !topic.tags.some((t) => storyTags.has(tagKey(t)))) continue;
    matched.push({ name, weight: topic.weight });
    matchedKeywords.push(...hits);
  }
  // Stable sort: equal weights keep the configured order
  matched.sort((a, b) => b.weight - a.weight);
  return {
    interest: matched[0]?.weight ?? 0,
    topics: matched.map((m) => m.name),
    matchedKeywords: [...new Set(matchedKeywords)],
  };
}

export function isMuted(
  story: Pick<Story, 'title' | 'tags' | 'domain'>,
  mute: { keywords: string[]; domains: string[] },
): boolean {
  const domain = story.domain.toLowerCase();
  if (mute.domains.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`))) {
    return true;
  }
  const text = storyText(story);
  return mute.keywords.some((k) => keywordMatcher(k)(text));
}

const OFFICIAL_SOURCES: ReadonlySet<SourceId> = new Set(['official', 'github_release']);
const RESURFACE_DELTA = 0.1;
const PLATFORM_FRESH_DAYS = 4;
/** Outside your topics, only the top few percent of each platform make it onto the page */
const TRENDING_MIN_POP = 0.97;

export interface SeenEntry {
  date: string;
  pop: number;
}

export interface BuildInput {
  stories: Story[];
  layout: LayoutConfig;
  today: string;
  now: Date;
  /** Language of the page; repositories described in it come first */
  language: Story['lang'];
  /** Topic names in the configured order, one section each */
  topics: string[];
  seen: Record<string, SeenEntry>;
  /**
   * Spare stories added to each section beyond its limit.
   * Mutes are applied in the browser, which refills muted slots from these spares.
   */
  spare?: number;
}

/** The platform where the story ranks highest (used to cap any one platform's share of a section) */
export function primarySource(story: Story): SourceId {
  return story.appearances.reduce((best, a) => ((a.percentile ?? -1) > (best.percentile ?? -1) ? a : best)).source;
}

function isOfficial(story: Story): boolean {
  return story.appearances.every((a) => OFFICIAL_SOURCES.has(a.source));
}

function isRepoOnly(story: Story): boolean {
  return story.appearances.every((a) => a.source === 'github_new_repos');
}

function ageDays(story: Story, now: Date): number {
  if (!story.publishedAt) return 0;
  return (now.getTime() - Date.parse(story.publishedAt)) / 86_400_000;
}

/**
 * Takes stories from the top while keeping any one platform under its cap.
 * With `soft`, slots the cap left empty go back to the capped platforms, so a topic that only
 * one platform writes about still fills up.
 */
export function pickWithCaps(ranked: readonly Story[], limit: number, maxRatio: number, soft = false): Story[] {
  const maxPerSource = Math.max(1, Math.ceil(limit * maxRatio));
  const sourceCounts = new Map<SourceId, number>();
  const picked = new Set<Story>();
  for (const s of ranked) {
    if (picked.size >= limit) break;
    const src = primarySource(s);
    const n = sourceCounts.get(src) ?? 0;
    if (n >= maxPerSource) continue;
    sourceCounts.set(src, n + 1);
    picked.add(s);
  }
  if (soft) {
    for (const s of ranked) {
      if (picked.size >= limit) break;
      picked.add(s);
    }
  }
  // Restore the original ranking order
  return ranked.filter((s) => picked.has(s));
}

/** Official section: keep the newest item per publisher and count the rest ("+N more") */
export function groupOfficial(stories: readonly Story[]): Story[] {
  const sorted = [...stories].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const byPublisher = new Map<string, Story[]>();
  for (const s of sorted) {
    const key = s.publisher ?? s.domain;
    byPublisher.set(key, [...(byPublisher.get(key) ?? []), s]);
  }
  return [...byPublisher.values()].map(([newest, ...rest]) => ({ ...(newest as Story), groupedCount: rest.length }));
}

/** Picks `limit` stories, then `spare` more from the rest by the same rules, appended after them */
function pickWithSpare(
  ranked: readonly Story[],
  limit: number,
  spare: number,
  maxRatio: number,
  soft = false,
): Story[] {
  const main = pickWithCaps(ranked, limit, maxRatio, soft);
  const rest = pickWithCaps(
    ranked.filter((s) => !main.includes(s)),
    spare,
    maxRatio,
    soft,
  );
  return [...main, ...rest];
}

export function buildSections(input: BuildInput): Section[] {
  const { layout, today, now, seen, language } = input;
  const spare = input.spare ?? 0;

  // Hide stories shown on earlier days, except ones whose popularity jumped: those come back once, marked resurfaced.
  const visible: Story[] = [];
  for (const s of input.stories) {
    const prev = seen[s.key];
    if (!prev || prev.date === today) {
      visible.push(s);
    } else if (!isOfficial(s) && s.pop - prev.pop >= RESURFACE_DELTA) {
      visible.push({ ...s, resurfaced: true });
    }
  }

  const official = groupOfficial(visible.filter((s) => isOfficial(s) && ageDays(s, now) <= layout.official_days));

  const platform = visible.filter((s) => !isOfficial(s) && !isRepoOnly(s) && ageDays(s, now) <= PLATFORM_FRESH_DAYS);
  const byPop = (a: Story, b: Story) => b.pop - a.pop || b.interest - a.interest || a.key.localeCompare(b.key);

  const topics: Section[] = input.topics.map((name, i) => ({
    id: `topic-${i}`,
    title: name,
    stories: pickWithSpare(
      platform.filter((s) => s.topics[0] === name).sort(byPop),
      layout.per_topic,
      spare,
      layout.max_source_ratio,
      true,
    ),
    limit: layout.per_topic,
  }));

  const trending = pickWithSpare(
    platform.filter((s) => s.interest === 0 && s.pop >= TRENDING_MIN_POP).sort(byPop),
    layout.trending,
    spare,
    layout.max_source_ratio,
  );

  const repos = visible
    .filter((s) => isRepoOnly(s))
    // Interest first, then repos described in the page's language (new-repo rankings are often dominated by one language)
    .sort(
      (a, b) =>
        Number(b.interest > 0) - Number(a.interest > 0) ||
        Number(b.lang === language) - Number(a.lang === language) ||
        byPop(a, b),
    )
    .slice(0, layout.repos + spare);

  return [
    { id: 'official', stories: official, limit: official.length },
    ...topics,
    { id: 'trending', stories: trending, limit: layout.trending },
    { id: 'repos', stories: repos, limit: layout.repos },
  ];
}
