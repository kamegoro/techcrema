// Which topics a story is about, and whether the reader muted it.
import type { InterestConfig, Story } from '#src/types.ts';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ASCII keywords match whole words ("go" not in "google"); others, like Japanese, match anywhere */
export function keywordMatcher(keyword: string): (text: string) => boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return () => false;
  if (/^\p{ASCII}+$/u.test(k)) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(k)}(?![a-z0-9])`, 'i');
    return (text) => re.test(text);
  }
  return (text) => text.toLowerCase().includes(k);
}

const searchableText = (story: Pick<Story, 'title' | 'tags'>) => `${story.title} ${story.tags.join(' ')}`;

/** "Node.js", "nodejs" and "NodeJS" are one tag */
const tagKey = (tag: string) => tag.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export interface Interest {
  interest: number;
  topics: string[];
  matchedKeywords: string[];
  titleMatch: boolean;
}

/**
 * A story belongs to a topic when a keyword is in its title or tags, or a lookup of the topic's tag found it.
 * A front-page story's tags alone don't decide it: dev.to and Hatena put "ai" on nearly anything.
 */
export function interestScorer(config: InterestConfig): (story: Pick<Story, 'title' | 'tags' | 'lookups'>) => Interest {
  const topics = Object.entries(config.topics).map(([name, topic]) => ({
    name,
    weight: topic.weight,
    keywords: topic.keywords.map((keyword) => ({ keyword, matches: keywordMatcher(keyword) })),
    tags: topic.tags.map(tagKey),
  }));
  return (story) => {
    const text = searchableText(story);
    const lookups = new Set((story.lookups ?? []).map(tagKey));
    const matched: { name: string; weight: number; inTitle: boolean }[] = [];
    const matchedKeywords: string[] = [];
    for (const topic of topics) {
      const hits = topic.keywords.filter((k) => k.matches(text));
      if (hits.length === 0 && !topic.tags.some((t) => lookups.has(t))) continue;
      matched.push({ name: topic.name, weight: topic.weight, inTitle: hits.some((k) => k.matches(story.title)) });
      matchedKeywords.push(...hits.map((k) => k.keyword));
    }
    // The sort is stable, so topics of equal weight keep the configured order
    matched.sort((x, y) => y.weight - x.weight);
    return {
      interest: matched[0]?.weight ?? 0,
      topics: matched.map((m) => m.name),
      matchedKeywords: [...new Set(matchedKeywords)],
      titleMatch: matched[0]?.inTitle ?? false,
    };
  };
}

/** Muted by site (subdomains included) or by keyword */
export function muteFilter(mute: {
  keywords: string[];
  domains: string[];
}): (story: Pick<Story, 'title' | 'tags' | 'domain'>) => boolean {
  const domains = mute.domains.map((d) => d.toLowerCase());
  const keywords = mute.keywords.map(keywordMatcher);
  return (story) => {
    const domain = story.domain.toLowerCase();
    if (domains.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
    const text = searchableText(story);
    return keywords.some((matches) => matches(text));
  };
}
