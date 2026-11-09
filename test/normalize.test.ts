import { describe, expect, it } from 'vitest';
import { detectLang, domainOf, isHttpUrl, mergeIntoStories, normalizeUrl } from '../src/normalize.ts';
import type { RawItem } from '../src/types.ts';

describe('normalizeUrl', () => {
  it('drops www, trailing slashes, fragments and tracking parameters', () => {
    expect(normalizeUrl('https://www.Example.com/post/?utm_source=hn&fbclid=x#top')).toBe('example.com/post');
  });

  it('keeps meaningful query parameters, sorted', () => {
    expect(normalizeUrl('https://example.com/a?b=2&a=1')).toBe('example.com/a?a=1&b=2');
  });

  it('treats http and https as the same article', () => {
    expect(normalizeUrl('http://example.com/a')).toBe(normalizeUrl('https://example.com/a'));
  });

  it('keeps the case of the path', () => {
    expect(normalizeUrl('https://example.com/Foo')).toBe('example.com/Foo');
  });

  it('lowercases strings that are not URLs', () => {
    expect(normalizeUrl(' Not A URL ')).toBe('not a url');
  });
});

describe('domainOf', () => {
  it('returns the host name without www', () => {
    expect(domainOf('https://www.zenn.dev/x')).toBe('zenn.dev');
  });
});

describe('detectLang', () => {
  it('kana means Japanese', () => {
    expect(detectLang('Neovim 0.12 の新機能')).toBe('ja');
  });
  it('ideographs without kana mean Chinese', () => {
    expect(detectLang('让你的命令行 Agent 在后台自己接活')).toBe('zh');
  });
  it('anything else is English', () => {
    expect(detectLang('Node.js 27 released')).toBe('en');
  });
});

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

  it('drops items without a title or URL', () => {
    expect(mergeIntoStories([item({ title: '' }), item({ url: '' })], () => 0.5).length).toBe(0);
  });

  it('ignores javascript: URLs and non-string titles', () => {
    const base: RawItem = {
      source: 'hackernews',
      title: 'ok',
      url: 'https://example.com/a',
      score: 1,
      tags: [],
      publishedAt: null,
    };
    const stories = mergeIntoStories(
      [
        { ...base, url: 'javascript:alert(1)' },
        { ...base, title: 123 as unknown as string, url: 'https://example.com/b' },
        { ...base, url: 'https://example.com/c', discussionUrl: 'javascript:alert(1)', score: Number.NaN },
      ],
      () => 0.5,
    );
    expect(stories.length).toBe(1);
    expect(stories[0]?.appearances[0]?.discussionUrl).toBe(undefined);
    expect(stories[0]?.appearances[0]?.score).toBe(null);
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

describe('edge cases', () => {
  it('keeps repeated query parameters in their original order', () => {
    expect(normalizeUrl('https://a.dev/s?tag=b&tag=a')).toBe('a.dev/s?tag=b&tag=a');
  });

  it('has no domain for something that is not a URL', () => {
    expect(domainOf('not a url')).toBe('');
  });

  it('treats missing tags as none', () => {
    const raw = {
      source: 'hackernews',
      title: 'A',
      url: 'https://a.dev/a',
      score: 1,
      publishedAt: null,
    } as unknown as RawItem;
    expect(mergeIntoStories([raw], () => 0.5)[0]?.tags).toEqual([]);
  });

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

describe('isHttpUrl', () => {
  it('rejects schemes other than http(s)', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,x')).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });
});
