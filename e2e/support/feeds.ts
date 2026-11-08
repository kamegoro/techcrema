/** Feed data for tests. Times are fixed relative to NOW, and the page clock is frozen at NOW. */
import type { Feed, SectionId, Story } from '../../src/types.ts';

export const NOW = new Date('2026-11-08T09:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

export function story(key: string, over: Partial<Story> = {}): Story {
  const domain = over.domain ?? `${key}.example.com`;
  return {
    key,
    url: `https://${domain}/${key}`,
    title: `Story ${key}`,
    domain,
    lang: 'en',
    tags: [],
    publishedAt: hoursAgo(3),
    appearances: [
      {
        source: 'hackernews',
        score: 120,
        scoreLabel: 'pt',
        percentile: 0.9,
        discussionUrl: `https://news.ycombinator.com/item?id=${key}`,
      },
    ],
    pop: 0.9,
    interest: 0,
    topics: [],
    matchedKeywords: [],
    ...over,
  };
}

const section = (id: SectionId, limit: number, stories: Story[]) => ({ id, limit, stories });

/**
 * A small, fully known feed:
 * - "For you" shows 3 of 5 stories; two come from alpha.dev, so muting it must refill from the spares
 * - "Trending" holds hostile input: an HTML-looking title and a javascript: URL
 */
export function makeFeed(over: Partial<Feed> = {}): Feed {
  return {
    generatedAt: hoursAgo(1),
    date: '2026-11-08',
    language: 'en',
    title: 'TechCrema',
    officialDays: 3,
    errors: [],
    sections: [
      section('official', 1, [
        story('release', {
          title: 'node v26.1.0',
          domain: 'github.com',
          url: 'https://github.com/nodejs/node/releases/tag/v26.1.0',
          appearances: [{ source: 'github_release', score: null, percentile: null }],
          publisher: 'nodejs/node',
          releaseKind: 'minor',
          groupedCount: 2,
        }),
      ]),
      section('forYou', 3, [
        story('a', {
          domain: 'alpha.dev',
          title: 'Rust ownership explained',
          topics: ['rust'],
          interest: 1,
          matchedKeywords: ['rust'],
        }),
        story('b', { domain: 'beta.dev', title: 'Writing a Rust CLI', topics: ['rust'], interest: 1 }),
        story('c', { domain: 'alpha.dev', title: 'Another alpha post', topics: ['rust'], interest: 1 }),
        story('d', { domain: 'gamma.dev', title: 'Cargo workspaces', topics: ['rust'], interest: 1 }),
        story('e', { domain: 'delta.dev', title: 'Spare story e', topics: ['rust'], interest: 1 }),
      ]),
      section('trending', 2, [
        story('xss', { title: '<img src=x onerror="window.__xss = true">' }),
        story('jsurl', { title: 'Not a link', url: 'javascript:window.__xss = true' }),
      ]),
      section('discover', 1, [story('disc', { title: 'Something different' })]),
      section('repos', 1, [
        story('repo', {
          title: 'someone/new-repo — a new tool',
          domain: 'github.com',
          appearances: [{ source: 'github_new_repos', score: 900, scoreLabel: '★', percentile: 0.95 }],
        }),
      ]),
    ],
    ...over,
  };
}

/** Same feed with every section empty */
export const emptyFeed = () => {
  const feed = makeFeed();
  return { ...feed, sections: feed.sections.map((s) => ({ ...s, stories: [] })) };
};
