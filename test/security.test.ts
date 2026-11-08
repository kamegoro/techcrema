import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readLimited } from '../src/http.ts';
import { parseFeed } from '../src/feed-parser.ts';
import { mergeIntoStories } from '../src/normalize.ts';
import { isHttpUrl } from '../src/security.ts';
import type { RawItem } from '../src/types.ts';

describe('isHttpUrl', () => {
  it('http(s) 以外のスキームを弾く', () => {
    assert.equal(isHttpUrl('https://example.com'), true);
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl('data:text/html,x'), false);
    assert.equal(isHttpUrl(42), false);
  });
});

describe('外部データの防御', () => {
  it('DTDを含むフィード(エンティティ展開攻撃)は拒否する', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><rss><channel><item><title>&lol;</title></item></channel></rss>`;
    assert.throws(() => parseFeed(xml), /DTD/);
  });

  it('上限を超えるレスポンスは途中で打ち切る', async () => {
    const big = new Response('x'.repeat(100));
    await assert.rejects(() => readLimited(big, 10), /大きすぎ/);
    assert.equal(await readLimited(new Response('ok'), 10), 'ok');
  });

  it('javascript: のURLや文字列でないタイトルは記事にしない', () => {
    const base: RawItem = { source: 'hackernews', title: 'ok', url: 'https://example.com/a', score: 1, tags: [], publishedAt: null };
    const stories = mergeIntoStories(
      [
        { ...base, url: 'javascript:alert(1)' },
        { ...base, title: 123 as unknown as string, url: 'https://example.com/b' },
        { ...base, url: 'https://example.com/c', discussionUrl: 'javascript:alert(1)', score: Number.NaN },
      ],
      () => 0.5,
    );
    assert.equal(stories.length, 1);
    assert.equal(stories[0]!.appearances[0]!.discussionUrl, undefined);
    assert.equal(stories[0]!.appearances[0]!.score, null);
  });
});
