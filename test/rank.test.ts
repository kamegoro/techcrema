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
  it('上から何%かを返す(同点は半分ずつ数える)', () => {
    assert.equal(percentile(10, [1, 2, 3, 10]), (3 + 0.5) / 4);
    assert.equal(percentile(1, [1, 1]), 0.5);
  });
  it('window に自分が含まれなくても0〜1に収まる', () => {
    const p = percentile(100, [1, 2, 3]);
    assert.ok(p > 0.8 && p < 1);
  });
  it('window が空なら中央の0.5', () => {
    assert.equal(percentile(5, []), 0.5);
  });
});

describe('popularity', () => {
  it('最大パーセンタイル + 複数プラットフォームのボーナス', () => {
    const pop = popularity({
      appearances: [
        { source: 'hackernews', score: 1, percentile: 0.8 },
        { source: 'hatena', score: 1, percentile: 0.6 },
      ],
    });
    assert.equal(Math.round(pop * 100) / 100, 0.85);
  });
  it('1を超えない', () => {
    const pop = popularity({
      appearances: [
        { source: 'hackernews', score: 1, percentile: 0.99 },
        { source: 'hatena', score: 1, percentile: 0.99 },
      ],
    });
    assert.equal(pop, 1);
  });
  it('人気指標がなければ0', () => {
    assert.equal(popularity({ appearances: [{ source: 'official', score: null, percentile: null }] }), 0);
  });
});

describe('keywordMatcher', () => {
  it('英数字は単語単位で照合する', () => {
    assert.equal(keywordMatcher('go')('Go 1.30 released'), true);
    assert.equal(keywordMatcher('go')('Google announces'), false);
    assert.equal(keywordMatcher('node.js')('Node.js 27'), true);
    assert.equal(keywordMatcher('claude code')('Using Claude Code daily'), true);
  });
  it('日本語は部分一致', () => {
    assert.equal(keywordMatcher('テスト')('E2Eテストの書き方'), true);
  });
  it('空のキーワードは何にも当たらない', () => {
    assert.equal(keywordMatcher('  ')('anything'), false);
  });
});

describe('scoreInterest', () => {
  const config: InterestConfig = {
    topics: {
      neovim: { weight: 1, keywords: ['neovim', 'lua'] },
      em: { weight: 0.7, keywords: ['1on1'] },
    },
    mute: { keywords: [], domains: [] },
  };
  it('当たったトピックの重みの最大を返す', () => {
    const r = scoreInterest({ title: 'Neovim で 1on1 メモ', tags: [] }, config);
    assert.equal(r.interest, 1);
    assert.deepEqual(r.topics, ['neovim', 'em']);
    assert.deepEqual(r.matchedKeywords, ['neovim', '1on1']);
  });
  it('タグも照合対象', () => {
    assert.equal(scoreInterest({ title: 'Plugin tips', tags: ['Lua'] }, config).interest, 1);
  });
  it('何にも当たらなければ0', () => {
    assert.equal(scoreInterest({ title: 'Rust news', tags: [] }, config).interest, 0);
  });
});

describe('isMuted', () => {
  const mute = { keywords: ['crypto'], domains: ['example.org'] };
  it('キーワードで除外する', () => {
    assert.equal(isMuted({ title: 'Crypto winter', tags: [], domain: 'a.com' }, mute), true);
  });
  it('ドメインとそのサブドメインを除外する', () => {
    assert.equal(isMuted({ title: 'x', tags: [], domain: 'blog.example.org' }, mute), true);
    assert.equal(isMuted({ title: 'x', tags: [], domain: 'notexample.org' }, mute), false);
  });
});

describe('seededShuffle', () => {
  it('同じシードなら同じ並び、元の配列は変えない', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(seededShuffle(input, '2026-11-08'), seededShuffle(input, '2026-11-08'));
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual([...seededShuffle(input, 'x')].sort(), input);
  });
});

describe('pickWithCaps', () => {
  it('1つのプラットフォームが上限を超えないようにする', () => {
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
  it('クオータ分を先に確保し、結果は元の順位に並べる', () => {
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
  it('同じ発信元は最新1件にまとめ、残りを件数で持つ', () => {
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
    for_you_min_japanese: 0,
    trending: 2,
    discover: 1,
    repos: 1,
    max_source_ratio: 1,
  };
  const now = new Date('2026-11-08T09:00:00Z');
  const today = '2026-11-08';
  const sectionKeys = (sections: ReturnType<typeof buildSections>) =>
    Object.fromEntries(sections.map((s) => [s.id, s.stories.map((st) => st.key)]));

  it('人気度と関心度の組み合わせで振り分ける', () => {
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
    const keys = sectionKeys(buildSections({ stories, layout, today, now, seen: {} }));
    assert.deepEqual(keys, {
      official: ['official'],
      forYou: ['mine-hot', 'mine-cold'],
      trending: ['hot'],
      discover: ['warm'],
      repos: ['repo'],
    });
  });

  it('前日までに出した記事は出さないが、大きく伸びたものは再浮上させる', () => {
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
    const sections = buildSections({ stories, layout, today, now, seen });
    const forYou = sections.find((s) => s.id === 'forYou')!.stories;
    assert.deepEqual(
      forYou.map((s) => [s.key, s.resurfaced ?? false]),
      [
        ['grew', true],
        ['today', false],
      ],
    );
  });

  it('古いプラットフォーム記事は出さない', () => {
    const stories = [story({ key: 'stale', interest: 1, pop: 0.9, publishedAt: '2026-10-01T00:00:00Z' })];
    const keys = sectionKeys(buildSections({ stories, layout, today, now, seen: {} }));
    assert.deepEqual(keys.forYou, []);
  });
});
