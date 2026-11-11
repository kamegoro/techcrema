import { describe, expect, it } from 'vitest';
import { discoverFeed, hasDtd, isHtmlPage, parseFeed, parseFeedTitle } from '#src/lib/feed-parser.ts';

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

  it('decodes titles escaped twice, as WordPress does, and resolves relative links', () => {
    const xml = `<rss version="2.0"><channel><title>Blog</title>
<item><title>TiDB &amp;#8211; Merpay &amp;#038; Mercoin</title><link>/blog/entry/1</link></item>
<item><title>From a guid</title><guid>https://blog.example.com/2</guid></item>
<item><title>Not a permalink</title><guid isPermaLink="false">tag:example,2026:3</guid></item>
</channel></rss>`;
    expect(parseFeed(xml, 'https://blog.example.com/feed.xml').map(({ title, link }) => ({ title, link }))).toEqual([
      { title: 'TiDB \u2013 Merpay & Mercoin', link: 'https://blog.example.com/blog/entry/1' },
      { title: 'From a guid', link: 'https://blog.example.com/2' },
      { title: 'Not a permalink', link: '' },
    ]);
    expect(parseFeed(xml)[0]?.link).toBe('/blog/entry/1');
    expect(parseFeed(xml, 'not a url')[0]?.link).toBe('/blog/entry/1');
  });

  it('reads JSON Feed, giving untitled posts their first words as a title', () => {
    const body = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'A microblog',
      items: [
        { title: 'Titled', url: '/posts/1', date_published: '2026-11-01T00:00:00Z', tags: ['rust', 3] },
        { summary: 'A short note', external_url: 'https://elsewhere.dev/x', date_modified: '2026-11-02T00:00:00Z' },
        { content_text: 'word '.repeat(40) },
        'not an item',
      ],
    });
    expect(parseFeed(body, 'https://micro.example.com/feed.json')).toEqual([
      {
        title: 'Titled',
        link: 'https://micro.example.com/posts/1',
        publishedAt: '2026-11-01T00:00:00.000Z',
        categories: ['rust'],
        bookmarkCount: null,
      },
      {
        title: 'A short note',
        link: 'https://elsewhere.dev/x',
        publishedAt: '2026-11-02T00:00:00.000Z',
        categories: [],
        bookmarkCount: null,
      },
      { title: `${'word '.repeat(16).trim()}…`, link: '', publishedAt: null, categories: [], bookmarkCount: null },
    ]);
    expect(parseFeedTitle(body)).toBe('A microblog');
    expect(parseFeedTitle(JSON.stringify({ items: [] }))).toBe('');
    expect(() => parseFeed('{"version": 1}')).toThrow('Unsupported feed format');
    expect(() => parseFeed('[1]')).toThrow();
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

describe('isHtmlPage', () => {
  it('tells a web page from a feed', () => {
    expect(isHtmlPage('\uFEFF<!DOCTYPE html><html lang="ja">')).toBe(true);
    expect(isHtmlPage('<!-- generated --> <html>')).toBe(true);
    expect(isHtmlPage('<?xml version="1.0"?><rss version="2.0"></rss>')).toBe(false);
    expect(isHtmlPage('{"items": []}')).toBe(false);
  });
});

describe('discoverFeed', () => {
  const PAGE = 'https://engineering.example.com/blog/';

  it('finds the feed a page announces, as an absolute URL', () => {
    const html = `<head>
      <link rel="stylesheet" href="/style.css">
      <link rel="alternate" href="https://engineering.example.com/en/" hreflang="en">
      <link rel="alternate" type="application/rss+xml" title="Blog" href="/blog/feed.xml?a=1&amp;b=2">
    </head>`;
    expect(discoverFeed(html, PAGE)).toBe('https://engineering.example.com/blog/feed.xml?a=1&b=2');
  });

  it('reads any attribute order and quoting, and Atom and JSON feeds', () => {
    expect(discoverFeed("<LINK HREF='atom.xml' TYPE='application/atom+xml' REL='alternate'>", PAGE)).toBe(
      'https://engineering.example.com/blog/atom.xml',
    );
    expect(discoverFeed('<link type=application/feed+json rel="alternate home" href=/feed.json>', PAGE)).toBe(
      'https://engineering.example.com/feed.json',
    );
  });

  it('skips links that are not feeds or cannot be read, and gives up when none is left', () => {
    const html = `<link rel="alternate" type="application/rss+xml">
      <link rel="alternate" type="application/rss+xml" href="http://[broken">
      <link rel="alternate" type="application/rss+xml" href="/ok.xml">`;
    expect(discoverFeed(html, PAGE)).toBe('https://engineering.example.com/ok.xml');
    expect(discoverFeed('<link rel="icon" href="/favicon.ico"><link type="text/css">', PAGE)).toBeNull();
  });
});
