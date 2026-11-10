// The page's sections: official news, one per topic, popular stories outside the topics, and new repositories.
// Popularity and interest are never blended into one score; each section uses them in its own way.
import { shiftDate } from '#src/lib/dates.ts';
import type { LayoutConfig, Section, SeenEntry, SourceId, Story } from '#src/types.ts';

const OFFICIAL_SOURCES: ReadonlySet<SourceId> = new Set(['official', 'github_release']);
const PLATFORM_FRESH_DAYS = 4;
/** A topic with fewer stories than it shows also takes older ones, up to this age */
const QUIET_TOPIC_DAYS = 14;
/** How much a story ranks lower in a topic when its title doesn't name the topic (only a tag put it there) */
const UNNAMED_TOPIC_PENALTY = 0.3;
/** Outside the topics, only the top 10% of each site makes it */
const TRENDING_MIN_POP = 0.9;
/** How much a hidden story's popularity has to rise for it to come back */
const RESURFACE_DELTA = 0.1;

/** Sites where one person posts many articles; the first path segment names the author */
const AUTHOR_SITES = new Set([
  'dev.to',
  'zenn.dev',
  'qiita.com',
  'medium.com',
  'note.com',
  'speakerdeck.com',
  'docswell.com',
]);

const isOfficial = (story: Story) => story.appearances.every((a) => OFFICIAL_SOURCES.has(a.source));
const isRepoOnly = (story: Story) => story.appearances.every((a) => a.source === 'github_new_repos');

function ageDays(story: Story, now: Date): number {
  if (!story.publishedAt) return 0;
  return (now.getTime() - Date.parse(story.publishedAt)) / 86_400_000;
}

/** The site where the story ranks highest */
export function primarySource(story: Story): SourceId {
  return story.appearances.reduce((best, a) => ((a.percentile ?? -1) > (best.percentile ?? -1) ? a : best)).source;
}

/** "dev.to/someone" for a post on dev.to; undefined when the URL doesn't name an author */
export function authorOf(story: Pick<Story, 'key'>): string | undefined {
  // Docswell puts decks under /s/<author>/
  const [host, author] = story.key.replace(/^docswell\.com\/s\//, 'docswell.com/').split('/');
  return host && author && AUTHOR_SITES.has(host) ? `${host}/${author}` : undefined;
}

/**
 * Takes stories from the top, keeping each site under its share and each author to one story.
 * With `soft`, places the caps left empty go back to the capped stories, so a topic only one site
 * or one person writes about still fills up.
 */
export function pickWithCaps(ranked: readonly Story[], limit: number, maxRatio: number, soft = false): Story[] {
  const maxPerSource = Math.max(1, Math.ceil(limit * maxRatio));
  const perSource = new Map<SourceId, number>();
  const authors = new Set<string>();
  const picked = new Set<Story>();
  for (const story of ranked) {
    if (picked.size >= limit) break;
    const source = primarySource(story);
    const count = perSource.get(source) ?? 0;
    const author = authorOf(story);
    if (count >= maxPerSource || (author && authors.has(author))) continue;
    perSource.set(source, count + 1);
    if (author) authors.add(author);
    picked.add(story);
  }
  if (soft) {
    for (const story of ranked) {
      if (picked.size >= limit) break;
      picked.add(story);
    }
  }
  return ranked.filter((story) => picked.has(story));
}

/** `limit` stories, then `spare` more by the same rules for "Show more" and for refilling muted places */
function pickWithSpare(ranked: readonly Story[], limit: number, spare: number, maxRatio: number, soft = false) {
  const shown = pickWithCaps(ranked, limit, maxRatio, soft);
  const rest = ranked.filter((story) => !shown.includes(story));
  return [...shown, ...pickWithCaps(rest, spare, maxRatio, soft)];
}

/** The newest item per publisher, counting the ones folded into it */
export function groupOfficial(stories: readonly Story[]): Story[] {
  const newestFirst = [...stories].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const byPublisher = new Map<string, { newest: Story; count: number }>();
  for (const story of newestFirst) {
    const publisher = story.publisher ?? story.domain;
    const group = byPublisher.get(publisher);
    if (group) group.count++;
    else byPublisher.set(publisher, { newest: story, count: 1 });
  }
  return [...byPublisher.values()].map(({ newest, count }) => ({ ...newest, groupedCount: count - 1 }));
}

/**
 * A story stays the day it is first shown and the next, so a day without opening the page loses nothing.
 * After that it hides, unless its popularity rose enough to bring it back once, marked as resurfaced.
 */
function stillOnThePage(stories: Story[], seen: Record<string, SeenEntry>, today: string): Story[] {
  const yesterday = shiftDate(today, -1);
  return stories.flatMap((story) => {
    const previous = seen[story.key];
    if (!previous || previous.date >= yesterday) return [story];
    if (!isOfficial(story) && story.pop - previous.pop >= RESURFACE_DELTA) return [{ ...story, resurfaced: true }];
    return [];
  });
}

const byPop = (a: Story, b: Story) => b.pop - a.pop || b.interest - a.interest || a.key.localeCompare(b.key);
const relevance = (story: Story) => story.pop - (story.titleMatch ? 0 : UNNAMED_TOPIC_PENALTY);
const byRelevance = (a: Story, b: Story) => relevance(b) - relevance(a) || byPop(a, b);

interface SectionsInput {
  stories: Story[];
  layout: LayoutConfig;
  today: string;
  now: Date;
  /** Repositories described in the page's language come first */
  language: Story['lang'];
  /** Topic names in the configured order */
  topics: string[];
  seen: Record<string, SeenEntry>;
  /** Extra stories per section beyond its limit */
  spare: number;
}

export function buildSections(input: SectionsInput): Section[] {
  const { layout, now, language, spare } = input;
  const onPage = stillOnThePage(input.stories, input.seen, input.today);

  const official = groupOfficial(onPage.filter((s) => isOfficial(s) && ageDays(s, now) <= layout.official_days));

  const fromSites = onPage.filter((s) => !isOfficial(s) && !isRepoOnly(s));
  const fresh = fromSites.filter((s) => ageDays(s, now) <= PLATFORM_FRESH_DAYS);

  const topics = input.topics.map((name, i): Section => {
    const recent = fresh.filter((s) => s.topics[0] === name).sort(byRelevance);
    const older =
      recent.length < layout.per_topic
        ? fromSites
            .filter((s) => s.topics[0] === name && !recent.includes(s) && ageDays(s, now) <= QUIET_TOPIC_DAYS)
            .sort(byRelevance)
        : [];
    return {
      id: `topic-${i}`,
      title: name,
      stories: pickWithSpare([...recent, ...older], layout.per_topic, spare, layout.max_source_ratio, true),
      limit: layout.per_topic,
    };
  });

  const trending = pickWithSpare(
    fresh.filter((s) => s.interest === 0 && s.pop >= TRENDING_MIN_POP).sort(byPop),
    layout.trending,
    spare,
    layout.max_source_ratio,
  );

  // New-repo rankings are often dominated by one language, so repos in the page's language go first
  const repos = onPage
    .filter(isRepoOnly)
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
