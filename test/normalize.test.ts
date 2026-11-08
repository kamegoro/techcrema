import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectLang, domainOf, mergeIntoStories, normalizeUrl } from '../src/normalize.ts';
import type { RawItem } from '../src/types.ts';

describe('normalizeUrl', () => {
  it('drops www, trailing slashes, fragments and tracking parameters', () => {
    assert.equal(normalizeUrl('https://www.Example.com/post/?utm_source=hn&fbclid=x#top'), 'example.com/post');
  });

  it('keeps meaningful query parameters, sorted', () => {
    assert.equal(normalizeUrl('https://example.com/a?b=2&a=1'), 'example.com/a?a=1&b=2');
  });

  it('treats http and https as the same article', () => {
    assert.equal(normalizeUrl('http://example.com/a'), normalizeUrl('https://example.com/a'));
  });

  it('keeps the case of the path', () => {
    assert.equal(normalizeUrl('https://example.com/Foo'), 'example.com/Foo');
  });

  it('lowercases strings that are not URLs', () => {
    assert.equal(normalizeUrl(' Not A URL '), 'not a url');
  });
});

describe('domainOf', () => {
  it('returns the host name without www', () => {
    assert.equal(domainOf('https://www.zenn.dev/x'), 'zenn.dev');
  });
});

describe('detectLang', () => {
  it('kana means Japanese', () => {
    assert.equal(detectLang('Neovim 0.12 の新機能'), 'ja');
  });
  it('ideographs without kana mean Chinese', () => {
    assert.equal(detectLang('让你的命令行 Agent 在后台自己接活'), 'zh');
  });
  it('anything else is English', () => {
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

  it('merges the same story across platforms and lists each appearance', () => {
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

  it('keeps the higher score for duplicates on one platform', () => {
    const stories = mergeIntoStories([item({ score: 5 }), item({ score: 50 })], () => 0.5);
    assert.equal(stories[0]!.appearances.length, 1);
    assert.equal(stories[0]!.appearances[0]!.score, 50);
  });

  it('drops items without a title or URL', () => {
    assert.equal(mergeIntoStories([item({ title: '' }), item({ url: '' })], () => 0.5).length, 0);
  });
});
