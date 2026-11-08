import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSections,
  groupOfficial,
  isMuted,
  keywordMatcher,
  percentile,
  pickWithCaps,
  popularity,
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
    assert.equal(percentile(10, [1, 2, 3, 10]), (3 + 0.5) / 4);
    assert.equal(percentile(1, [1, 1]), 0.5);
  });
  it('stays within 0-1 even when the window lacks the score', () => {
    const p = percentile(100, [1, 2, 3]);
    assert.ok(p > 0.8 && p < 1);
  });
  it('is 0.5 for an empty window', () => {
    assert.equal(percentile(5, []), 0.5);
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
    assert.equal(Math.round(pop * 100) / 100, 0.85);
  });
  it('never exceeds 1', () => {
    const pop = popularity({
      appearances: [
        { source: 'hackernews', score: 1, percentile: 0.99 },
        { source: 'hatena', score: 1, percentile: 0.99 },
      ],
    });
    assert.equal(pop, 1);
  });
  it('is 0 without any popularity signal', () => {
    assert.equal(popularity({ appearances: [{ source: 'official', score: null, percentile: null }] }), 0);
  });
});

describe('keywordMatcher', () => {
  it('matches ASCII keywords as whole words', () => {
    assert.equal(keywordMatcher('go')('Go 1.30 released'), true);
    assert.equal(keywordMatcher('go')('Google announces'), false);
    assert.equal(keywordMatcher('node.js')('Node.js 27'), true);
    assert.equal(keywordMatcher('claude code')('Using Claude Code daily'), true);
  });
  it('matches Japanese keywords as substrings', () => {
    assert.equal(keywordMatcher('テスト')('E2Eテストの書き方'), true);
  });
  it('never matches an empty keyword', () => {
    assert.equal(keywordMatcher('  ')('anything'), false);
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
    assert.equal(r.interest, 1);
    assert.deepEqual(r.topics, ['neovim', 'em']);
    assert.deepEqual(r.matchedKeywords, ['neovim', '1on1']);
  });
  it('also looks at tags', () => {
    assert.equal(scoreInterest({ title: 'Plugin tips', tags: ['Lua'] }, config).interest, 1);
  });
  it('is 0 when nothing matches', () => {
    assert.equal(scoreInterest({ title: 'Rust news', tags: [] }, config).interest, 0);
  });
});

describe('isMuted', () => {
  const mute = { keywords: ['crypto'], domains: ['example.org'] };
  it('mutes by keyword', () => {
    assert.equal(isMuted({ title: 'Crypto winter', tags: [], domain: 'a.com' }, mute), true);
  });
  it('mutes a domain and its subdomains', () => {
    assert.equal(isMuted({ title: 'x', tags: [], domain: 'blog.example.org' }, mute), true);
    assert.equal(isMuted({ title: 'x', tags: [], domain: 'notexample.org' }, mute), false);
  });
});

describe('seededShuffle', () => {
  it('gives the same order for the same seed without changing the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(seededShuffle(input, '2026-11-08'), seededShuffle(input, '2026-11-08'));
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual([...seededShuffle(input, 'x')].sort(), input);
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
    assert.deepEqual(
      picked.map((s) => s.key),
      ['h1', 'h2', 'z1'],
    );
  });
  it('reserves the quota first and keeps the original order', () => {
    const ranked = [
      story({ key: 'en1', appearances: from('hackernews') }),
      story({ key: 'en2', appearances: from('devto') }),
      story({ key: 'ja1', lang: 'ja', appearances: from('zenn') }),
    ];
    const picked = pickWithCaps(ranked, 2, 1, { count: 1, test: (s) => s.lang === 'ja' });
    assert.deepEqual(
      picked.map((s) => s.key),
      ['en1', 'ja1'],
    );
  });
});

describe('groupOfficial', () => {
  it('keeps the newest item per publisher and counts the rest', () => {
    const grouped = groupOfficial([
      story({ key: 'p1', publisher: 'microsoft/playwright', publishedAt: '2026-11-05T00:00:00Z' }),
      story({ key: 'p2', publisher: 'microsoft/playwright', publishedAt: '2026-11-07T00:00:00Z' }),
      story({ key: 'n1', publisher: 'Node.js', publishedAt: '2026-11-06T00:00:00Z' }),
    ]);
    assert.deepEqual(
      grouped.map((s) => [s.key, s.groupedCount]),
      [
        ['p2', 1],
        ['n1', 0],
      ],
    );
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
    assert.deepEqual(keys, {
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
    const forYou = sections.find((s) => s.id === 'forYou')!.stories;
    assert.deepEqual(
      forYou.map((s) => [s.key, s.resurfaced ?? false]),
      [
        ['grew', true],
        ['today', false],
      ],
    );
  });

  it('drops old platform stories', () => {
    const stories = [story({ key: 'stale', interest: 1, pop: 0.9, publishedAt: '2026-10-01T00:00:00Z' })];
    const keys = sectionKeys(buildSections({ stories, layout, language: 'en', today, now, seen: {} }));
    assert.deepEqual(keys.forYou, []);
  });

  it('appends spares for mutes and records the visible count as limit', () => {
    const stories = ['a', 'b', 'c', 'd'].map((k, i) => story({ key: k, interest: 1, pop: 0.9 - i * 0.1 }));
    const sections = buildSections({ stories, layout, language: 'en', today, now, seen: {}, spare: 1 });
    const forYou = sections.find((s) => s.id === 'forYou')!;
    assert.equal(forYou.limit, 2);
    assert.deepEqual(
      forYou.stories.map((s) => s.key),
      ['a', 'b', 'c'],
    );
  });

  it('prefers repositories described in the page language', () => {
    const repo = (key: string, lang: Story['lang'], pop: number) =>
      story({ key, lang, pop, appearances: from('github_new_repos', pop) });
    const stories = [repo('zh-hot', 'zh', 0.99), repo('en-warm', 'en', 0.8)];
    const keys = sectionKeys(buildSections({ stories, layout, language: 'en', today, now, seen: {} }));
    assert.deepEqual(keys.repos, ['en-warm']);
  });
});
