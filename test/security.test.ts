import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readLimited } from '../src/http.ts';
import { parseFeed } from '../src/feed-parser.ts';
import { mergeIntoStories } from '../src/normalize.ts';
import {
  isAllowedHostHeader,
  isHttpUrl,
  isLoopbackAddress,
  isSameOrigin,
  isValidStoryKey,
  parseCookies,
  sanitizeMuteList,
  tokensEqual,
} from '../src/security.ts';
import type { RawItem } from '../src/types.ts';

describe('isAllowedHostHeader(DNSリバインディング対策)', () => {
  const lan = new Set(['192.168.1.10']);
  it('ループバックと許可したLANアドレスは通す', () => {
    assert.equal(isAllowedHostHeader('localhost:8787', 8787, new Set()), true);
    assert.equal(isAllowedHostHeader('127.0.0.1:8787', 8787, new Set()), true);
    assert.equal(isAllowedHostHeader('[::1]:8787', 8787, new Set()), true);
    assert.equal(isAllowedHostHeader('192.168.1.10:8787', 8787, lan), true);
  });
  it('攻撃者のドメイン名やポート違いは弾く', () => {
    assert.equal(isAllowedHostHeader('evil.example:8787', 8787, new Set()), false);
    assert.equal(isAllowedHostHeader('localhost:9999', 8787, new Set()), false);
    assert.equal(isAllowedHostHeader('192.168.1.10:8787', 8787, new Set()), false);
    assert.equal(isAllowedHostHeader(undefined, 8787, new Set()), false);
    assert.equal(isAllowedHostHeader('bad host', 8787, new Set()), false);
  });
});

describe('isSameOrigin(CSRF対策)', () => {
  it('Originが同じホストなら通す、無ければ通す', () => {
    assert.equal(isSameOrigin('http://localhost:8787', 'localhost:8787'), true);
    assert.equal(isSameOrigin(undefined, 'localhost:8787'), true);
  });
  it('別サイトや不正なOriginは弾く', () => {
    assert.equal(isSameOrigin('https://evil.example', 'localhost:8787'), false);
    assert.equal(isSameOrigin('null', 'localhost:8787'), false);
  });
});

describe('isLoopbackAddress', () => {
  it('IPv4/IPv6/IPv4射影のループバックを判定する', () => {
    assert.equal(isLoopbackAddress('127.0.0.1'), true);
    assert.equal(isLoopbackAddress('::1'), true);
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
    assert.equal(isLoopbackAddress('192.168.1.20'), false);
    assert.equal(isLoopbackAddress(undefined), false);
  });
});

describe('isValidStoryKey(プロトタイプ汚染対策)', () => {
  it('通常のキーは通す', () => {
    assert.equal(isValidStoryKey('example.com/post'), true);
  });
  it('__proto__ などの危険なキー・空・長すぎ・文字列以外は弾く', () => {
    for (const k of ['__proto__', 'constructor', 'prototype', '', 'x'.repeat(2049), 1, null, {}]) {
      assert.equal(isValidStoryKey(k), false, String(k));
    }
  });
});

describe('sanitizeMuteList', () => {
  it('空でない短い文字列だけを残す', () => {
    assert.deepEqual(sanitizeMuteList([' rust ', '', 3, 'x'.repeat(201), 'go']), ['rust', 'go']);
    assert.deepEqual(sanitizeMuteList('rust'), []);
  });
});

describe('tokensEqual / parseCookies', () => {
  it('一致するときだけ true', () => {
    assert.equal(tokensEqual('abc', 'abc'), true);
    assert.equal(tokensEqual('abd', 'abc'), false);
    assert.equal(tokensEqual('ab', 'abc'), false);
    assert.equal(tokensEqual(undefined, 'abc'), false);
  });
  it('Cookieヘッダーを読む(プロトタイプを持たないオブジェクトで返す)', () => {
    const c = parseCookies('a=1; tc_token=xyz; broken; b=%E3%81%82');
    assert.equal(c.tc_token, 'xyz');
    assert.equal(c.b, 'あ');
    assert.equal(Object.getPrototypeOf(c), null);
  });
});

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
