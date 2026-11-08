import type { Page } from '@playwright/test';
import type { Feed, SectionId, Story } from '../src/types.ts';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

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
      { source: 'hackernews', score: 120, scoreLabel: 'pt', percentile: 0.9, discussionUrl: `https://news.ycombinator.com/item?id=${key}` },
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
 * - "For you" shows 3 of 5 stories; two share the domain alpha.dev, so muting it must refill from spares
 * - "Trending" holds hostile input: an HTML-looking title and a javascript: URL
 */
export function makeFeed(over: Partial<Feed> = {}): Feed {
  return {
    generatedAt: hoursAgo(1),
    date: new Date().toISOString().slice(0, 10),
    language: 'en',
    title: 'Tech Catchup',
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
        story('a', { domain: 'alpha.dev', title: 'Rust ownership explained', topics: ['rust'], interest: 1, matchedKeywords: ['rust'] }),
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

/** Serves `feed` as feed.json and opens the page */
export async function openWith(page: Page, feed: Feed | null, path = ''): Promise<void> {
  await page.route('**/feed.json', (route) =>
    feed ? route.fulfill({ json: feed, headers: { 'Cache-Control': 'no-store' } }) : route.fulfill({ status: 404, body: '' }),
  );
  await page.goto(`./${path}`);
}

/** Card titles of a section, for auto-waiting assertions such as toHaveText([...]) */
export const cardTitles = (page: Page, sectionId: SectionId) => page.locator(`#section-${sectionId} .card-title`);
