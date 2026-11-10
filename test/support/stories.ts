import type { SourceId, Story } from '#src/types.ts';

/** A story with sensible defaults; `key` names it */
export function story(over: Partial<Story> & { key: string }): Story {
  return {
    url: `https://example.com/${over.key}`,
    title: over.key,
    domain: 'example.com',
    lang: 'en',
    tags: [],
    publishedAt: '2026-11-08T00:00:00Z',
    appearances: [{ source: 'hackernews', score: 1, percentile: 0.5 }],
    pop: 0.5,
    interest: 0,
    topics: [],
    matchedKeywords: [],
    ...over,
  };
}

/** Appearances on one site at the given percentile */
export function from(source: SourceId, percentile: number | null = 0.5) {
  return [{ source, score: percentile === null ? null : 1, percentile }];
}
