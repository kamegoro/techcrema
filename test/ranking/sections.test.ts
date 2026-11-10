import { describe, expect, it } from 'vitest';
import { authorOf, buildSections, groupOfficial, pickWithCaps, primarySource } from '#src/ranking/sections.ts';
import type { LayoutConfig, Story } from '#src/types.ts';
import { from, story } from '#test/support/stories.ts';

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
  it('with soft caps, fills the remaining slots in the original order', () => {
    const ranked = [
      story({ key: 'h1', appearances: from('hackernews', 0.99) }),
      story({ key: 'h2', appearances: from('hackernews', 0.98) }),
      story({ key: 'z1', appearances: from('zenn', 0.5) }),
      story({ key: 'h3', appearances: from('hackernews', 0.97) }),
    ];
    expect(pickWithCaps(ranked, 3, 0.4, true).map((s) => s.key)).toEqual(['h1', 'h2', 'z1']);
    expect(pickWithCaps(ranked, 4, 0.25, true).map((s) => s.key)).toEqual(['h1', 'h2', 'z1', 'h3']);
  });
});

describe('authorOf', () => {
  it('reads the author from blog platforms only', () => {
    expect(authorOf({ key: 'zenn.dev/kame/articles/x' })).toBe('zenn.dev/kame');
    expect(authorOf({ key: 'qiita.com/kame/items/x' })).toBe('qiita.com/kame');
    expect(authorOf({ key: 'github.blog/changelog/x' })).toBeUndefined();
    expect(authorOf({ key: 'dev.to' })).toBeUndefined();
  });

  it('reads the author of a slide deck', () => {
    expect(authorOf({ key: 'speakerdeck.com/kame/deck' })).toBe('speakerdeck.com/kame');
    expect(authorOf({ key: 'docswell.com/s/kame/ABC-deck' })).toBe('docswell.com/kame');
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
    per_topic: 2,
    trending: 2,
    repos: 1,
    max_source_ratio: 1,
  };
  const now = new Date('2026-11-08T09:00:00Z');
  const today = '2026-11-08';
  const base = { layout, language: 'en' as const, topics: ['ai', 'rust'], today, now, seen: {}, spare: 0 };
  const sectionKeys = (sections: ReturnType<typeof buildSections>) =>
    Object.fromEntries(sections.map((s) => [s.title ?? s.id, s.stories.map((st) => st.key)]));

  it('lists official news, then one section per topic, then the rest by popularity', () => {
    const stories = [
      story({ key: 'official', appearances: from('official', null), publisher: 'Node.js' }),
      story({ key: 'old-official', appearances: from('official', null), publishedAt: '2026-10-01T00:00:00Z' }),
      story({ key: 'ai-hot', interest: 1, topics: ['ai'], pop: 0.9 }),
      story({ key: 'ai-cold', interest: 1, topics: ['ai'], pop: 0.3 }),
      story({ key: 'ai-low', interest: 1, topics: ['ai'], pop: 0.1 }),
      story({ key: 'rust-and-ai', interest: 1, topics: ['rust', 'ai'], pop: 0.5 }),
      story({ key: 'hot', pop: 0.99 }),
      story({ key: 'warm', pop: 0.9 }),
      story({ key: 'cool', pop: 0.8 }),
      story({ key: 'repo', appearances: from('github_new_repos', 0.9), pop: 0.9 }),
    ];
    const sections = buildSections({ ...base, stories });
    expect(sections.map((s) => [s.id, s.limit])).toEqual([
      ['official', 1],
      ['topic-0', 2],
      ['topic-1', 2],
      ['trending', 2],
      ['repos', 1],
    ]);
    expect(sectionKeys(sections)).toEqual({
      official: ['official'],
      ai: ['ai-hot', 'ai-cold'],
      rust: ['rust-and-ai'],
      trending: ['hot', 'warm'],
      repos: ['repo'],
    });
  });

  it('keeps a section for a topic with nothing today', () => {
    expect(sectionKeys(buildSections({ ...base, stories: [] })).rust).toEqual([]);
  });

  it('hides stories shown before, but brings back ones that kept climbing', () => {
    const mine = { interest: 1, topics: ['ai'] };
    const stories = [
      story({ key: 'shown', ...mine, pop: 0.5 }),
      story({ key: 'grew', ...mine, pop: 0.8 }),
      story({ key: 'today', ...mine, pop: 0.4 }),
    ];
    const seen = {
      shown: { date: '2026-11-06', pop: 0.45 },
      grew: { date: '2026-11-06', pop: 0.5 },
      today: { date: today, pop: 0.4 },
    };
    const ai = buildSections({ ...base, stories, seen }).find((s) => s.title === 'ai')?.stories;
    expect(ai?.map((s) => [s.key, s.resurfaced ?? false])).toEqual([
      ['grew', true],
      ['today', false],
    ]);
  });

  it('keeps a story for the day after it was first shown, so a skipped day loses nothing', () => {
    const stories = [story({ key: 'yesterday', interest: 1, topics: ['ai'], pop: 0.5 })];
    const seen = { yesterday: { date: '2026-11-07', pop: 0.5 } };
    const ai = buildSections({ ...base, stories, seen }).find((s) => s.title === 'ai')?.stories;
    expect(ai?.map((s) => [s.key, s.resurfaced ?? false])).toEqual([['yesterday', false]]);
  });

  it('ranks a story that only carries the topic as a tag as if it were less popular', () => {
    const tagged = story({ key: 'tagged', interest: 1, topics: ['ai'], pop: 0.9 });
    const named = (pop: number) => story({ key: 'named', interest: 1, topics: ['ai'], pop, titleMatch: true });
    expect(sectionKeys(buildSections({ ...base, stories: [tagged, named(0.7)] })).ai).toEqual(['named', 'tagged']);
    expect(sectionKeys(buildSections({ ...base, stories: [tagged, named(0.4)] })).ai).toEqual(['tagged', 'named']);
  });

  it('fills a quiet topic with older stories, up to two weeks old', () => {
    const stories = [
      story({ key: 'fresh', interest: 1, topics: ['rust'], pop: 0.3 }),
      story({ key: 'last-week', interest: 1, topics: ['rust'], pop: 0.9, publishedAt: '2026-11-01T00:00:00Z' }),
      story({ key: 'last-month', interest: 1, topics: ['rust'], pop: 0.9, publishedAt: '2026-10-10T00:00:00Z' }),
    ];
    expect(sectionKeys(buildSections({ ...base, stories })).rust).toEqual(['fresh', 'last-week']);
  });

  it('shows one story per author in a section while others have stories', () => {
    const post = (key: string, author: string, pop: number) =>
      story({ key: `dev.to/${author}/${key}`, interest: 1, topics: ['ai'], pop, appearances: from('devto', pop) });
    const stories = [post('a', 'promo', 0.99), post('b', 'promo', 0.98), post('c', 'someone', 0.5)];
    expect(sectionKeys(buildSections({ ...base, stories })).ai).toEqual(['dev.to/promo/a', 'dev.to/someone/c']);
  });

  it('drops old platform stories', () => {
    const stories = [story({ key: 'stale', interest: 1, topics: ['ai'], publishedAt: '2026-10-01T00:00:00Z' })];
    expect(sectionKeys(buildSections({ ...base, stories })).ai).toEqual([]);
  });

  it('appends the rest of a topic after its limit, for "Show more"', () => {
    const stories = ['a', 'b', 'c', 'd'].map((k, i) =>
      story({ key: k, interest: 1, topics: ['ai'], pop: 0.9 - i * 0.1 }),
    );
    const ai = buildSections({ ...base, stories, spare: 1 }).find((s) => s.title === 'ai');
    expect(ai?.limit).toBe(2);
    expect(ai?.stories.map((s) => s.key)).toEqual(['a', 'b', 'c']);
  });

  it('fills a topic from one platform when no other platform has stories for it', () => {
    const stories = ['z1', 'z2'].map((k) => story({ key: k, interest: 1, topics: ['ai'], appearances: from('zenn') }));
    const strict = { ...layout, max_source_ratio: 0.4 };
    expect(sectionKeys(buildSections({ ...base, layout: strict, stories })).ai).toEqual(['z1', 'z2']);
  });

  it('prefers repositories described in the page language', () => {
    const repo = (key: string, lang: Story['lang'], pop: number) =>
      story({ key, lang, pop, appearances: from('github_new_repos', pop) });
    const stories = [repo('zh-hot', 'zh', 0.99), repo('en-warm', 'en', 0.8)];
    expect(sectionKeys(buildSections({ ...base, stories })).repos).toEqual(['en-warm']);
  });

  it('treats an undated platform story as fresh', () => {
    const undated = story({ key: 'undated', interest: 1, topics: ['ai'], publishedAt: null });
    expect(sectionKeys(buildSections({ ...base, stories: [undated] })).ai).toEqual(['undated']);
  });

  it('keeps undated stories and ranks equal repositories by popularity', () => {
    const repo = (key: string, pop: number) =>
      story({ key, pop, publishedAt: null, appearances: from('github_new_repos', pop) });
    const stories = [repo('low', 0.5), repo('high', 0.9)];
    expect(sectionKeys(buildSections({ ...base, layout: { ...layout, repos: 2 }, stories })).repos).toEqual([
      'high',
      'low',
    ]);
  });
});
