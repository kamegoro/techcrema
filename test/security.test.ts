import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readLimited } from '../src/http.ts';
import { parseFeed } from '../src/feed-parser.ts';
import { mergeIntoStories } from '../src/normalize.ts';
import { isHttpUrl } from '../src/security.ts';
import type { RawItem } from '../src/types.ts';

describe('isHttpUrl', () => {
  it('rejects schemes other than http(s)', () => {
    assert.equal(isHttpUrl('https://example.com'), true);
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl('data:text/html,x'), false);
    assert.equal(isHttpUrl(42), false);
  });
});

describe('defending against outside data', () => {
  it('rejects feeds with a DTD (entity expansion attacks)', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><rss><channel><item><title>&lol;</title></item></channel></rss>`;
    assert.throws(() => parseFeed(xml), /DTD/);
  });

  it('stops reading responses over the size limit', async () => {
    const big = new Response('x'.repeat(100));
    await assert.rejects(() => readLimited(big, 10), /too large/);
    assert.equal(await readLimited(new Response('ok'), 10), 'ok');
  });

  it('ignores javascript: URLs and non-string titles', () => {
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
