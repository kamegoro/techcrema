import { describe, expect, it } from 'vitest';
import {
  buildSections,
  groupOfficial,
  isMuted,
  keywordMatcher,
  percentile,
  pickWithCaps,
  popularity,
  primarySource,
  scoreInterest,
  seededShuffle,
} from '../src/rank.ts';
import type { InterestConfig, LayoutConfig, SourceId, Story } from '../src/types.ts';

function story(over: Partial<Story> & { key: string }): Story {
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

function from(source: SourceId, percentileValue: number | null = 0.5) {
  return [{ source, score: percentileValue === null ? null : 1, percentile: percentileValue }];
}

describe('percentile', () => {
  it('returns the share ranked below (ties count half)', () => {
    expect(percentile(10, [1, 2, 3, 10])).toBe((3 + 0.5) / 4);
    expect(percentile(1, [1, 1])).toBe(0.5);
  });
  it('stays within 0-1 even when the window lacks the score', () => {
    const p = percentile(100, [1, 2, 3]);
    expect(p > 0.8 && p < 1).toBeTruthy();
  });
  it('is 0.5 for an empty window', () => {
    expect(percentile(5, [])).toBe(0.5);
  });
});

describe('popularity', () => {
  it('is the best percentile plus a cross-posting bonus', () => {
    const pop = popularity({
      appearances: [
        { source: 'hackernews', score: 1, percentile: 0.8 },
        { source: 'hatena', score: 1, percentile: 0.6 },
      ],
    });
    expect(Math.round(pop * 100) / 100).toBe(0.85);
  });
  it('never exceeds 1', () => {
    const pop = popularity({
      appearances: [
        { source: 'hackernews', score: 1, percentile: 0.99 },
        { source: 'hatena', score: 1, percentile: 0.99 },
      ],
    });
    expect(pop).toBe(1);
  });
  it('is 0 without any popularity signal', () => {
    expect(popularity({ appearances: [{ source: 'official', score: null, percentile: null }] })).toBe(0);
  });
});

describe('keywordMatcher', () => {
  it('matches ASCII keywords as whole words', () => {
    expect(keywordMatcher('go')('Go 1.30 released')).toBe(true);
    expect(keywordMatcher('go')('Google announces')).toBe(false);
    expect(keywordMatcher('node.js')('Node.js 27')).toBe(true);
    expect(keywordMatcher('claude code')('Using Claude Code daily')).toBe(true);
  });
  it('matches Japanese keywords as substrings', () => {
    expect(keywordMatcher('テスト')('E2Eテストの書き方')).toBe(true);
  });
  it('never matches an empty keyword', () => {
    expect(keywordMatcher('  ')('anything')).toBe(false);
  });
});

describe('scoreInterest', () => {
  const config: InterestConfig = {
    topics: {
      neovim: { weight: 1, keywords: ['neovim', 'lua'] },
      em: { weight: 0.7, keywords: ['1on1'] },
    },
  };
  it('returns the highest weight among matched topics', () => {
    const r = scoreInterest({ title: 'Neovim で 1on1 メモ', tags: [] }, config);
    expect(r.interest).toBe(1);
    expect(r.topics).toEqual(['neovim', 'em']);
    expect(r.matchedKeywords).toEqual(['neovim', '1on1']);
  });
  it('also looks at tags', () => {
    expect(scoreInterest({ title: 'Plugin tips', tags: ['Lua'] }, config).interest).toBe(1);
  });
  it('is 0 when nothing matches', () => {
    expect(scoreInterest({ title: 'Rust news', tags: [] }, config).interest).toBe(0);
  });
});

describe('isMuted', () => {
  const mute = { keywords: ['crypto'], domains: ['example.org'] };
  it('mutes by keyword', () => {
    expect(isMuted({ title: 'Crypto winter', tags: [], domain: 'a.com' }, mute)).toBe(true);
  });
  it('mutes a domain and its subdomains', () => {
    expect(isMuted({ title: 'x', tags: [], domain: 'blog.example.org' }, mute)).toBe(true);
    expect(isMuted({ title: 'x', tags: [], domain: 'notexample.org' }, mute)).toBe(false);
  });
});

describe('seededShuffle', () => {
  it('gives the same order for the same seed without changing the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(input, '2026-11-08')).toEqual(seededShuffle(input, '2026-11-08'));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...seededShuffle(input, 'x')].sort()).toEqual(input);
  });
});

describe('pickWithCaps', () => {
  it('keeps any one platform under its cap', () => {
    const ranked = [
      story({ key: 'h1', appearances: from('hackernews', 0.99) }),
      story({ key: 'h2', appearances: from('hackernews', 0.98) }),
      story({ key: 'h3', appearances: from('hackernews', 0.97) }),
      story({ key: 'z1', appearances: from('zenn', 0.5) }),
    ];
    const picked = pickWithCaps(ranked, 3, 0.4);
    expect(picked.map((s) => s.key)).toEqual(['h1', 'h2', 'z1']);
  });
  it('reserves the quota first and keeps the original order', () => {
    const ranked = [
      story({ key: 'en1', appearances: from('hackernews') }),
      story({ key: 'en2', appearances: from('devto') }),
      story({ key: 'ja1', lang: 'ja', appearances: from('zenn') }),
    ];
    const picked = pickWithCaps(ranked, 2, 1, { count: 1, test: (s) => s.lang === 'ja' });
    expect(picked.map((s) => s.key)).toEqual(['en1', 'ja1']);
  });
});

describe('groupOfficial', () => {
  it('keeps the newest item per publisher and counts the rest', () => {
    const grouped = groupOfficial([
      story({ key: 'p1', publisher: 'microsoft/playwright', publishedAt: '2026-11-05T00:00:00Z' }),
      story({ key: 'p2', publisher: 'microsoft/playwright', publishedAt: '2026-11-07T00:00:00Z' }),
      story({ key: 'n1', publisher: 'Node.js', publishedAt: '2026-11-06T00:00:00Z' }),
    ]);
    expect(grouped.map((s) => [s.key, s.groupedCount])).toEqual([
      ['p2', 1],
      ['n1', 0],
    ]);
  });

  it('groups by site when there is no publisher, and puts undated items last', () => {
    const grouped = groupOfficial([
      story({ key: 'undated', domain: 'blog.dev', publishedAt: null }),
      story({ key: 'dated', domain: 'blog.dev', publishedAt: '2026-11-07T00:00:00Z' }),
      story({ key: 'also-undated', domain: 'other.dev', publishedAt: null }),
    ]);
    expect(grouped.map((s) => [s.key, s.groupedCount])).toEqual([
      ['dated', 1],
      ['also-undated', 0],
    ]);
  });
});

describe('primarySource', () => {
  it('is the platform where the story ranks highest; official sources rank lowest', () => {
    expect(
      primarySource(
        story({
          key: 'x',
          appearances: [
            { source: 'official', score: null, percentile: null },
            { source: 'hackernews', score: 1, percentile: 0.6 },
            { source: 'lobsters', score: 1, percentile: 0.9 },
            { source: 'devto', score: 1, percentile: 0.7 },
            { source: 'github_release', score: null, percentile: null },
          ],
        }),
      ),
    ).toBe('lobsters');
    expect(primarySource(story({ key: 'y', appearances: from('github_release', null) }))).toBe('github_release');
  });
});

describe('buildSections', () => {
  const layout: LayoutConfig = {
    official_days: 3,
    for_you: 2,
    for_you_min_local: 0,
    trending: 2,
    discover: 1,
    repos: 1,
    max_source_ratio: 1,
  };
  const now = new Date('2026-11-08T09:00:00Z');
  const today = '2026-11-08';
  const sectionKeys = (sections: ReturnType<typeof buildSections>) =>
    Object.fromEntries(sections.map((s) => [s.id, s.stories.map((st) => st.key)]));

  it('sorts stories into sections by popularity and interest', () => {
    const stories = [
      story({ key: 'official', appearances: from('official', null), publisher: 'Node.js' }),
      story({ key: 'old-official', appearances: from('official', null), publishedAt: '2026-10-01T00:00:00Z' }),
      story({ key: 'mine-hot', interest: 1, pop: 0.9 }),
      story({ key: 'mine-cold', interest: 1, pop: 0.3 }),
      story({ key: 'mine-low', interest: 1, pop: 0.1 }),
      story({ key: 'hot', pop: 0.99 }),
      story({ key: 'warm', pop: 0.9 }),
      story({ key: 'cold', pop: 0.2 }),
      story({ key: 'repo', appearances: from('github_new_repos', 0.9), pop: 0.9 }),
    ];
    const keys = sectionKeys(buildSections({ stories, layout, language: 'en', today, now, seen: {} }));
    expect(keys).toEqual({
      official: ['official'],
      forYou: ['mine-hot', 'mine-cold'],
      trending: ['hot'],
      discover: ['warm'],
      repos: ['repo'],
    });
  });

  it('hides stories shown before, but brings back ones that kept climbing', () => {
    const stories = [
      story({ key: 'shown', interest: 1, pop: 0.5 }),
      story({ key: 'grew', interest: 1, pop: 0.8 }),
      story({ key: 'today', interest: 1, pop: 0.4 }),
    ];
    const seen = {
      shown: { date: '2026-11-07', pop: 0.45 },
      grew: { date: '2026-11-07', pop: 0.5 },
      today: { date: today, pop: 0.4 },
    };
    const sections = buildSections({ stories, layout, language: 'en', today, now, seen });
    const forYou = sections.find((s) => s.id === 'forYou')?.stories;
    expect(forYou?.map((s) => [s.key, s.resurfaced ?? false])).toEqual([
      ['grew', true],
      ['today', false],
    ]);
  });

  it('drops old platform stories', () => {
    const stories = [story({ key: 'stale', interest: 1, pop: 0.9, publishedAt: '2026-10-01T00:00:00Z' })];
    const keys = sectionKeys(buildSections({ stories, layout, language: 'en', today, now, seen: {} }));
    expect(keys.forYou).toEqual([]);
  });

  it('appends spares for mutes and records the visible count as limit', () => {
    const stories = ['a', 'b', 'c', 'd'].map((k, i) => story({ key: k, interest: 1, pop: 0.9 - i * 0.1 }));
    const sections = buildSections({ stories, layout, language: 'en', today, now, seen: {}, spare: 1 });
    const forYou = sections.find((s) => s.id === 'forYou');
    expect(forYou?.limit).toBe(2);
    expect(forYou?.stories.map((s) => s.key)).toEqual(['a', 'b', 'c']);
  });

  it('prefers repositories described in the page language', () => {
    const repo = (key: string, lang: Story['lang'], pop: number) =>
      story({ key, lang, pop, appearances: from('github_new_repos', pop) });
    const stories = [repo('zh-hot', 'zh', 0.99), repo('en-warm', 'en', 0.8)];
    const keys = sectionKeys(buildSections({ stories, layout, language: 'en', today, now, seen: {} }));
    expect(keys.repos).toEqual(['en-warm']);
  });

  it('keeps one topic to about half of "For you" while other topics have stories', () => {
    const ai = ['a1', 'a2', 'a3', 'a4'].map((k, i) =>
      story({ key: k, interest: 1, topics: ['ai'], pop: 0.99 - i * 0.01 }),
    );
    const rust = story({ key: 'r1', interest: 1, topics: ['rust'], pop: 0.5 });
    const wide = { ...layout, for_you: 4 };
    const keys = sectionKeys(
      buildSections({ stories: [...ai, rust], layout: wide, language: 'en', today, now, seen: {} }),
    );
    expect(keys.forYou).toEqual(['a1', 'a2', 'a3', 'r1']);
  });

  it('still fills "For you" when only one topic has stories', () => {
    const ai = ['a1', 'a2', 'a3', 'a4'].map((k) => story({ key: k, interest: 1, topics: ['ai'] }));
    const wide = { ...layout, for_you: 4 };
    const keys = sectionKeys(buildSections({ stories: ai, layout: wide, language: 'en', today, now, seen: {} }));
    expect(keys.forYou?.length).toBe(4);
  });

  it('keeps the minimum number of stories in the page language', () => {
    const en = ['e1', 'e2', 'e3'].map((k, i) => story({ key: k, interest: 1, topics: [k], pop: 0.9 - i * 0.01 }));
    const ja = story({ key: 'j1', interest: 1, lang: 'ja', topics: ['j'], pop: 0.1 });
    const strict = { ...layout, for_you: 2, for_you_min_local: 1 };
    const keys = sectionKeys(
      buildSections({ stories: [...en, ja], layout: strict, language: 'ja', today, now, seen: {} }),
    );
    expect(keys.forYou).toEqual(['e1', 'j1']);
  });

  it('shuffles Discover the same way all day', () => {
    const pool = ['d1', 'd2', 'd3', 'd4'].map((k) => story({ key: k, pop: 0.9 }));
    const pick = () =>
      sectionKeys(
        buildSections({ stories: pool, layout: { ...layout, discover: 4 }, language: 'en', today, now, seen: {} }),
      );
    expect(pick().discover).toEqual(pick().discover);
    expect([...(pick().discover ?? [])].sort()).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('treats an undated platform story as fresh', () => {
    const undated = story({ key: 'undated', interest: 1, publishedAt: null });
    const keys = sectionKeys(buildSections({ stories: [undated], layout, language: 'en', today, now, seen: {} }));
    expect(keys.forYou).toEqual(['undated']);
  });

  it('keeps undated stories and ranks equal repositories by popularity', () => {
    const repo = (key: string, pop: number) =>
      story({ key, pop, publishedAt: null, appearances: from('github_new_repos', pop) });
    const keys = sectionKeys(
      buildSections({
        stories: [repo('low', 0.5), repo('high', 0.9)],
        layout: { ...layout, repos: 2 },
        language: 'en',
        today,
        now,
        seen: {},
      }),
    );
    expect(keys.repos).toEqual(['high', 'low']);
  });
});
