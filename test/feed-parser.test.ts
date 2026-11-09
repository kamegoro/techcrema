import { describe, expect, it } from 'vitest';
import { hasDtd, parseFeed, parseFeedTitle } from '#src/feed-parser.ts';

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
    expect(parseFeed(xml)).toEqual([
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
    expect(parseFeed(xml)).toEqual([
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
    expect(entry?.link).toBe('https://example.com/release');
    expect(entry?.categories).toEqual(['release']);
    expect(entry?.publishedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('throws on unsupported formats', () => {
    expect(() => parseFeed('<html></html>')).toThrow();
  });

  it('rejects feeds with a DTD (entity expansion attacks)', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><rss><channel><item><title>&lol;</title></item></channel></rss>`;
    expect(() => parseFeed(xml)).toThrow(/DTD/);
  });

  it('accepts a DOCTYPE that is only text inside CDATA, but not one hidden after it', () => {
    const embedded = `<?xml version="1.0"?><rss><channel><item><title>ok</title><link>https://example.com/a</link>
      <description><![CDATA[<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN"><html></html>]]></description></item></channel></rss>`;
    expect(parseFeed(embedded).length).toBe(1);
    expect(hasDtd('<!-- <!DOCTYPE x> --><rss/>')).toBe(false);
    expect(hasDtd('<![CDATA[x]]><!DOCTYPE r [<!ENTITY a "b">]><rss/>')).toBe(true);
    // A CDATA opener inside a comment, or a comment opener inside CDATA, must not hide what follows
    expect(hasDtd('<!-- <![CDATA[ --><!DOCTYPE r [<!ENTITY a "b">]><rss>]]></rss>')).toBe(true);
    expect(hasDtd('<rss><![CDATA[ <!-- ]]><!DOCTYPE r [<!ENTITY a "b">]> --></rss>')).toBe(true);
    // An unterminated CDATA or comment hides nothing either
    expect(hasDtd('<![CDATA[ <!DOCTYPE r>')).toBe(true);
  });
});

describe('feed details', () => {
  it('picks the alternate link of an Atom entry, or a plain text link', () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
      <entry><title>A</title><link rel="self" href="https://a.dev/self"/><link href="https://a.dev/a"/></entry>
      <entry><title>B</title><link>https://a.dev/b</link></entry>
      <entry><title>C</title><link rel="related" href="https://a.dev/c"/></entry></feed>`;
    expect(parseFeed(atom).map((e) => e.link)).toEqual(['https://a.dev/a', 'https://a.dev/b', 'https://a.dev/c']);
    expect(parseFeedTitle(atom)).toBe('Blog');
  });

  it('leaves the bookmark count empty when Hatena does not send one', () => {
    const rdf = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
      <channel><title>Hatena</title></channel><item><title>A</title><link>https://a.dev/a</link></item></rdf:RDF>`;
    expect(parseFeed(rdf)[0]?.bookmarkCount).toBeNull();
    expect(parseFeedTitle(rdf)).toBe('Hatena');
  });

  it('reads the RSS channel title, and a missing date as null', () => {
    const rss =
      '<rss><channel><title>News</title><item><title>A</title><link>https://a.dev/a</link></item></channel></rss>';
    expect(parseFeedTitle(rss)).toBe('News');
    expect(parseFeed(rss)[0]?.publishedAt).toBeNull();
  });
});
