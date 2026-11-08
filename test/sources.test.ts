import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFeed } from '../src/feed-parser.ts';
import { classifyRelease } from '../src/sources/official.ts';
import { hatenaEntryUrl } from '../src/sources/platforms.ts';

describe('parseFeed', () => {
  it('reads Hatena RSS 1.0: escaped Japanese text, bookmark counts and tags', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
<item rdf:about="https://example.com/a">
<title>&#x30C6;&#x30B9;&#x30C8; &amp; Neovim</title>
<link>https://example.com/a</link>
<dc:date>2026-11-06T07:33:34Z</dc:date>
<dc:subject>&#x30C6;&#x30AF;&#x30CE;&#x30ED;&#x30B8;&#x30FC;</dc:subject>
<dc:subject>neovim</dc:subject>
<hatena:bookmarkcount>185</hatena:bookmarkcount>
</item>
</rdf:RDF>`;
    assert.deepEqual(parseFeed(xml), [
      {
        title: 'テスト & Neovim',
        link: 'https://example.com/a',
        publishedAt: '2026-11-06T07:33:34.000Z',
        categories: ['テクノロジー', 'neovim'],
        bookmarkCount: 185,
      },
    ]);
  });

  it('reads RSS 2.0 (CDATA title, a single item)', () => {
    const xml = `<rss version="2.0"><channel><title>Node.js Blog</title>
<item><title><![CDATA[Node.js 27 <Alpha>]]></title><link>https://nodejs.org/en/blog/x</link>
<pubDate>Sun, 08 Nov 2026 08:52:35 GMT</pubDate><category>release</category></item>
</channel></rss>`;
    assert.deepEqual(parseFeed(xml), [
      {
        title: 'Node.js 27 <Alpha>',
        link: 'https://nodejs.org/en/blog/x',
        publishedAt: '2026-11-08T08:52:35.000Z',
        categories: ['release'],
        bookmarkCount: null,
      },
    ]);
  });

  it('reads Atom (alternate link, category term)', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>v0.12.0</title>
<link rel="replies" href="https://example.com/comments"/>
<link rel="alternate" href="https://example.com/release"/>
<updated>2026-11-01T00:00:00Z</updated><category term="release"/></entry>
</feed>`;
    const [entry] = parseFeed(xml);
    assert.equal(entry?.link, 'https://example.com/release');
    assert.deepEqual(entry?.categories, ['release']);
    assert.equal(entry?.publishedAt, '2026-11-01T00:00:00.000Z');
  });

  it('throws on unsupported formats', () => {
    assert.throws(() => parseFeed('<html></html>'));
  });
});

describe('classifyRelease', () => {
  it('tells major, minor and patch apart from the version', () => {
    assert.equal(classifyRelease('v27.0.0'), 'major');
    assert.equal(classifyRelease('v1.65.0'), 'minor');
    assert.equal(classifyRelease('v0.11.5'), 'patch');
    assert.equal(classifyRelease('nightly'), 'other');
  });
});

describe('hatenaEntryUrl', () => {
  it('uses different comment paths for https and http', () => {
    assert.equal(hatenaEntryUrl('https://example.com/a'), 'https://b.hatena.ne.jp/entry/s/example.com/a');
    assert.equal(hatenaEntryUrl('http://example.com/a'), 'https://b.hatena.ne.jp/entry/example.com/a');
  });
});
