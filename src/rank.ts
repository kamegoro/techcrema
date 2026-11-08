/**
 * Ranking logic. Pure functions only, no I/O, so everything here is unit-tested.
 *
 * The idea:
 * - Popularity (pop): where a story sits among its platform's recent stories, as a percentile.
 *   This puts 300 HN points and 300 Hatena bookmarks on the same scale.
 * - Interest: the highest weight among the configured topics the story matches.
 * - The two are never blended into one score; sections are picked by combining them.
 */
import type { InterestConfig, LayoutConfig, Section, SourceId, Story } from './types.ts';

// ---------------------------------------------------------------------------
// Popularity
// ---------------------------------------------------------------------------

/**
 * Where `score` sits within `window`, from 0 to 1. Ties count half (midrank).
 * e.g. the top story out of 60 → (59 + 0.5) / 60 ≈ 0.99
 */
export function percentile(score: number, window: readonly number[]): number {
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

// ---------------------------------------------------------------------------
// Interest and mutes
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a keyword matcher.
 * ASCII keywords match whole words ("go" does not match "google");
 * other keywords (e.g. Japanese) match as substrings. Case-insensitive.
 */
export function keywordMatcher(keyword: string): (text: string) => boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return () => false;
  if (/^[\x00-\x7f]+$/.test(k)) {
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

export function scoreInterest(story: Pick<Story, 'title' | 'tags'>, config: InterestConfig): InterestResult {
  const text = storyText(story);
  let interest = 0;
  const topics: string[] = [];
  const matchedKeywords: string[] = [];
  for (const [name, topic] of Object.entries(config.topics)) {
    const hits = topic.keywords.filter((k) => keywordMatcher(k)(text));
    if (hits.length === 0) continue;
    topics.push(name);
    matchedKeywords.push(...hits);
    interest = Math.max(interest, topic.weight);
  }
  return { interest, topics, matchedKeywords: [...new Set(matchedKeywords)] };
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

// ---------------------------------------------------------------------------
// Random numbers seeded by the date (the same order all day)
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Building sections
// ---------------------------------------------------------------------------

const OFFICIAL_SOURCES: ReadonlySet<SourceId> = new Set(['official', 'github_release']);
const RESURFACE_DELTA = 0.1;
const PLATFORM_FRESH_DAYS = 4;

export interface SeenEntry {
  date: string;
  pop: number;
}

export interface BuildInput {
  stories: Story[];
  layout: LayoutConfig;
  /** 'YYYY-MM-DD' in the configured time zone */
  today: string;
  now: Date;
  /** Language of the page; for_you_min_local keeps this many stories in it */
  language: Story['lang'];
  /** Stories shown on earlier days */
  seen: Record<string, SeenEntry>;
  /**
   * Spare stories added to each section beyond its limit.
   * Mutes are applied in the browser, which refills muted slots from these spares.
   */
  spare?: number;
}

/** The platform where the story ranks highest (used to cap any one platform's share of a section) */
export function primarySource(story: Story): SourceId {
  let best = story.appearances[0]!;
  for (const a of story.appearances) {
    if ((a.percentile ?? -1) > (best.percentile ?? -1)) best = a;
  }
  return best.source;
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
 * If a quota is given, first reserves up to quota.count stories that pass quota.test (e.g. a minimum in the page's language).
 */
export function pickWithCaps(
  ranked: readonly Story[],
  limit: number,
  maxRatio: number,
  quota?: { count: number; test: (s: Story) => boolean },
): Story[] {
  const maxPerSource = Math.max(1, Math.ceil(limit * maxRatio));
  const counts = new Map<SourceId, number>();
  const picked: Story[] = [];
  const tryPick = (s: Story): boolean => {
    if (picked.length >= limit || picked.includes(s)) return false;
    const src = primarySource(s);
    const n = counts.get(src) ?? 0;
    if (n >= maxPerSource) return false;
    counts.set(src, n + 1);
    picked.push(s);
    return true;
  };
  if (quota) {
    let got = 0;
    for (const s of ranked) {
      if (got >= quota.count) break;
      if (quota.test(s) && tryPick(s)) got++;
    }
  }
  for (const s of ranked) tryPick(s);
  // Restore the original ranking order
  return ranked.filter((s) => picked.includes(s));
}

/** Official section: keep the newest item per publisher and count the rest ("+N more") */
export function groupOfficial(stories: readonly Story[]): Story[] {
  const sorted = [...stories].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const byPublisher = new Map<string, Story>();
  for (const s of sorted) {
    const key = s.publisher ?? s.domain;
    const head = byPublisher.get(key);
    if (!head) {
      byPublisher.set(key, { ...s, groupedCount: 0 });
    } else {
      head.groupedCount = (head.groupedCount ?? 0) + 1;
    }
  }
  return [...byPublisher.values()];
}

/** Picks `limit` stories, then `spare` more from the rest by the same rules, appended after them */
function pickWithSpare(
  ranked: readonly Story[],
  limit: number,
  spare: number,
  maxRatio: number,
  quota?: { count: number; test: (s: Story) => boolean },
): Story[] {
  const main = pickWithCaps(ranked, limit, maxRatio, quota);
  if (spare <= 0) return main;
  const rest = pickWithCaps(
    ranked.filter((s) => !main.includes(s)),
    spare,
    maxRatio,
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

  const official = groupOfficial(
    visible.filter((s) => isOfficial(s) && ageDays(s, now) <= layout.official_days),
  );

  const platform = visible.filter(
    (s) => !isOfficial(s) && !isRepoOnly(s) && ageDays(s, now) <= PLATFORM_FRESH_DAYS,
  );
  const byPop = (a: Story, b: Story) => b.pop - a.pop || b.interest - a.interest || a.key.localeCompare(b.key);

  const forYou = pickWithSpare(
    platform.filter((s) => s.interest > 0).sort(byPop),
    layout.for_you,
    spare,
    layout.max_source_ratio,
    { count: layout.for_you_min_local, test: (s) => s.lang === language },
  );

  const trending = pickWithSpare(
    platform.filter((s) => s.interest === 0 && s.pop >= 0.97).sort(byPop),
    layout.trending,
    spare,
    layout.max_source_ratio,
  );

  const discoverPool = platform
    .filter((s) => s.interest === 0 && s.pop >= 0.85 && !trending.includes(s))
    .sort((a, b) => a.key.localeCompare(b.key));
  const discover = seededShuffle(discoverPool, today).slice(0, layout.discover + spare);

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
    { id: 'forYou', stories: forYou, limit: layout.for_you },
    { id: 'trending', stories: trending, limit: layout.trending },
    { id: 'discover', stories: discover, limit: layout.discover },
    { id: 'repos', stories: repos, limit: layout.repos },
  ];
}
