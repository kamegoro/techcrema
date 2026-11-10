import { describe, expect, it } from 'vitest';
import { mergeIntoStories, sanitizeItem } from '#src/ranking/merge.ts';
import type { RawItem } from '#src/types.ts';

describe('mergeIntoStories', () => {
  const item = (over: Partial<RawItem>): RawItem => ({
    source: 'hackernews',
    title: 'Title',
    url: 'https://example.com/post',
    score: 10,
    tags: [],
    publishedAt: '2026-11-08T00:00:00Z',
    ...over,
  });

  it('merges the same story across platforms and lists each appearance', () => {
    const stories = mergeIntoStories(
      [
        item({ source: 'hackernews', score: 300, tags: ['a'] }),
        item({ source: 'hatena', url: 'https://www.example.com/post/?utm_source=x', score: 200, tags: ['b'] }),
      ],
      (i) => (i.source === 'hackernews' ? 0.9 : 0.8),
    );
    expect(stories.length).toBe(1);
    expect(stories[0]?.appearances.map((a) => [a.source, a.score, a.percentile])).toEqual([
      ['hackernews', 300, 0.9],
      ['hatena', 200, 0.8],
    ]);
    expect(stories[0]?.tags).toEqual(['a', 'b']);
  });

  it('keeps the higher score for duplicates on one platform', () => {
    const stories = mergeIntoStories([item({ score: 5 }), item({ score: 50 })], () => 0.5);
    expect(stories[0]?.appearances.length).toBe(1);
    expect(stories[0]?.appearances[0]?.score).toBe(50);
  });
});

describe('sanitizeItem', () => {
  const base: RawItem = {
    source: 'hackernews',
    title: 'ok',
    url: 'https://example.com/a',
    score: 1,
    tags: [],
    publishedAt: null,
  };

  it('drops items without a title or an http(s) link', () => {
    expect(sanitizeItem({ ...base, title: '' })).toBeNull();
    expect(sanitizeItem({ ...base, title: 123 as unknown as string })).toBeNull();
    expect(sanitizeItem({ ...base, url: 'javascript:alert(1)' })).toBeNull();
    expect(sanitizeItem({ ...base, url: 'not a url' })).toBeNull();
  });

  it('repairs what it can without changing the item it was given', () => {
    const raw = {
      ...base,
      discussionUrl: 'javascript:alert(1)',
      score: Number.NaN,
      tags: ['ok', 7] as unknown as string[],
    };
    expect(sanitizeItem(raw)).toMatchObject({ discussionUrl: undefined, score: null, tags: ['ok'] });
    expect(raw.score).toBeNaN();
  });

  it('treats missing tags as none', () => {
    expect(sanitizeItem({ ...base, tags: undefined as unknown as string[] })?.tags).toEqual([]);
  });

  it('keeps a valid discussion link', () => {
    expect(sanitizeItem({ ...base, discussionUrl: 'https://news.ycombinator.com/item?id=1' })?.discussionUrl).toBe(
      'https://news.ycombinator.com/item?id=1',
    );
  });
});

describe('tag lookups', () => {
  it('keeps every tag a story was looked up under, from any listing of it', () => {
    const base: RawItem = {
      source: 'zenn',
      title: 'T',
      url: 'https://zenn.dev/a/articles/x',
      score: 5,
      tags: [],
      publishedAt: null,
    };
    const [story] = mergeIntoStories(
      [base, { ...base, lookups: ['node'] }, { ...base, lookups: ['node', 'deno'] }],
      () => 0.5,
    );
    expect(story?.lookups).toEqual(['node', 'deno']);
    expect(mergeIntoStories([{ ...base, lookups: ['e2e'] }], () => 0.5)[0]?.lookups).toEqual(['e2e']);
  });
});

describe('publish dates', () => {
  it('keeps the earliest known publish date when merging', () => {
    const base: RawItem = {
      source: 'hackernews',
      title: 'A',
      url: 'https://a.dev/a',
      score: 1,
      tags: [],
      publishedAt: null,
    };
    const dates = (...publishedAt: (string | null)[]) =>
      mergeIntoStories(
        publishedAt.map((d, i) => ({
          ...base,
          source: (['hackernews', 'lobsters', 'devto'] as const)[i] ?? 'zenn',
          publishedAt: d,
        })),
        () => 0.5,
      )[0]?.publishedAt;
    expect(dates(null, '2026-11-08')).toBe('2026-11-08');
    expect(dates('2026-11-08', '2026-11-07')).toBe('2026-11-07');
    expect(dates('2026-11-07', '2026-11-08', null)).toBe('2026-11-07');
  });
});
