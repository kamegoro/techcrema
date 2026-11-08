import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectLang, domainOf, mergeIntoStories, normalizeUrl } from '../src/normalize.ts';
import type { RawItem } from '../src/types.ts';

describe('normalizeUrl', () => {
  it('www・末尾スラッシュ・フラグメント・追跡パラメータを落とす', () => {
    assert.equal(normalizeUrl('https://www.Example.com/post/?utm_source=hn&fbclid=x#top'), 'example.com/post');
  });

  it('意味のあるクエリは残し、順序を揃える', () => {
    assert.equal(normalizeUrl('https://example.com/a?b=2&a=1'), 'example.com/a?a=1&b=2');
  });

  it('http と https は同じ記事として扱う', () => {
    assert.equal(normalizeUrl('http://example.com/a'), normalizeUrl('https://example.com/a'));
  });

  it('パスの大文字小文字は保持する', () => {
    assert.equal(normalizeUrl('https://example.com/Foo'), 'example.com/Foo');
  });

  it('URLとして解釈できない文字列はそのまま小文字にする', () => {
    assert.equal(normalizeUrl(' Not A URL '), 'not a url');
  });
});

describe('domainOf', () => {
  it('www を除いたホスト名を返す', () => {
    assert.equal(domainOf('https://www.zenn.dev/x'), 'zenn.dev');
  });
});

describe('detectLang', () => {
  it('かなを含めば日本語', () => {
    assert.equal(detectLang('Neovim 0.12 の新機能'), 'ja');
  });
  it('漢字だけなら中国語', () => {
    assert.equal(detectLang('让你的命令行 Agent 在后台自己接活'), 'zh');
  });
  it('それ以外は英語', () => {
    assert.equal(detectLang('Node.js 27 released'), 'en');
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

  it('同じ記事が複数プラットフォームにあれば1件にまとめ、出現を並べる', () => {
    const stories = mergeIntoStories(
      [
        item({ source: 'hackernews', score: 300, tags: ['a'] }),
        item({ source: 'hatena', url: 'https://www.example.com/post/?utm_source=x', score: 200, tags: ['b'] }),
      ],
      (i) => (i.source === 'hackernews' ? 0.9 : 0.8),
    );
    assert.equal(stories.length, 1);
    assert.deepEqual(
      stories[0]!.appearances.map((a) => [a.source, a.score, a.percentile]),
      [
        ['hackernews', 300, 0.9],
        ['hatena', 200, 0.8],
      ],
    );
    assert.deepEqual(stories[0]!.tags, ['a', 'b']);
  });

  it('同じプラットフォームの重複はスコアの高いほうを残す', () => {
    const stories = mergeIntoStories([item({ score: 5 }), item({ score: 50 })], () => 0.5);
    assert.equal(stories[0]!.appearances.length, 1);
    assert.equal(stories[0]!.appearances[0]!.score, 50);
  });

  it('タイトルかURLが空のものは捨てる', () => {
    assert.equal(mergeIntoStories([item({ title: '' }), item({ url: '' })], () => 0.5).length, 0);
  });
});
