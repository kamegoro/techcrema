import { XMLParser } from 'fast-xml-parser';
import { decodeEntities, truncate } from './text.ts';

export interface FeedEntry {
  title: string;
  link: string;
  publishedAt: string | null;
  categories: string[];
  /** hatena:bookmarkcount from Hatena Bookmark's RSS */
  bookmarkCount: number | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Keep values as strings, so a title like "2048" doesn't become a number
  parseTagValue: false,
  trimValues: true,
  // RSS 1.0 feeds write non-ASCII text as numeric character references (&#x...;)
  htmlEntities: true,
});

type XmlNode = Record<string, unknown>;

const isNode = (value: unknown): value is XmlNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const child = (node: unknown, key: string): unknown => (isNode(node) ? node[key] : undefined);

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** A text node arrives either as a string or as {#text: ...} */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (isNode(value)) return text(value['#text']);
  return '';
}

function toIso(value: string): string | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Blogs (WordPress among them) often escape their titles twice, leaving "&#8211;" after the XML is read */
const cleanTitle = (title: string) => decodeEntities(title).replace(/\s+/g, ' ').trim();

/** Links may be relative to the feed's own address */
function absolute(link: string, base: string | undefined): string {
  if (!link || !base) return link;
  try {
    return new URL(link, base).href;
  } catch {
    return link;
  }
}

/** An item without a <link> can still have a permalink in its <guid> */
function rssLink(item: unknown): string {
  const link = text(child(item, 'link'));
  if (link) return link;
  const guid = child(item, 'guid');
  return child(guid, '@_isPermaLink') === 'false' ? '' : text(guid);
}

function atomLink(link: unknown): string {
  const links = asArray(link);
  const alternate = links.find((l) => !child(l, '@_rel') || child(l, '@_rel') === 'alternate') ?? links[0];
  return typeof alternate === 'string' ? alternate : text(child(alternate, '@_href'));
}

const categoryText = (c: unknown) => text(c) || text(child(c, '@_term'));

/**
 * True when the document declares a DTD or entities. CDATA sections and comments are ignored:
 * feeds often embed whole HTML pages there (the GitHub Blog includes "<!DOCTYPE html …>"),
 * and the parser treats that text as plain characters.
 */
export function hasDtd(xml: string): boolean {
  // One left-to-right pass, like the parser: whichever construct starts first wins, so a "<![CDATA["
  // inside a comment (or "<!--" inside CDATA) can't hide a declaration that follows it
  for (const [match] of xml.matchAll(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<!(?:DOCTYPE|ENTITY)/gi)) {
    if (!match.startsWith('<![') && !match.startsWith('<!--')) return true;
  }
  return false;
}

function parse(xml: string): XmlNode {
  // RSS/Atom never needs a DTD; rejecting it rules out entity-expansion attacks such as Billion Laughs
  if (hasDtd(xml)) throw new Error('Feeds with a DTD are not accepted');
  return parser.parse(xml) as XmlNode;
}

/** A web page rather than a feed: someone gave a blog's address instead of its feed's */
export const isHtmlPage = (body: string) => /^\s*(?:<!--[\s\S]*?-->\s*)*<(?:!doctype\s+html|html)[\s>]/i.test(body);

const FEED_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/json',
]);

/** The feed a page announces with <link rel="alternate" type="application/rss+xml" href="…">, as an absolute URL */
export function discoverFeed(html: string, pageUrl: string): string | null {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = new Map(
      [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)].map((m) => [
        (m[1] as string).toLowerCase(),
        // One of the three forms always matched: double-quoted, single-quoted or bare
        m[2] ?? m[3] ?? (m[4] as string),
      ]),
    );
    const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
    const href = attrs.get('href');
    if (!rel.includes('alternate') || !FEED_TYPES.has((attrs.get('type') ?? '').toLowerCase()) || !href) continue;
    try {
      return new URL(decodeEntities(href), pageUrl).href;
    } catch {
      // A broken href; a later link may still work
    }
  }
  return null;
}

interface JsonFeed {
  title?: unknown;
  items: {
    url?: unknown;
    external_url?: unknown;
    title?: unknown;
    summary?: unknown;
    content_text?: unknown;
    date_published?: unknown;
    date_modified?: unknown;
    tags?: unknown;
  }[];
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** JSON Feed (jsonfeed.org): an object with an `items` array */
function jsonFeed(body: string): JsonFeed | null {
  if (!body.trimStart().startsWith('{')) return null;
  const doc: unknown = JSON.parse(body);
  if (!isNode(doc) || !Array.isArray(doc.items)) throw new Error('Unsupported feed format');
  return { title: doc.title, items: doc.items.filter(isNode) };
}

const JSON_UNTITLED_CHARS = 80;

function parseJsonFeed(feed: JsonFeed, base: string | undefined): FeedEntry[] {
  return feed.items.map((item) => ({
    // Microblog posts have no title, so their first words stand in for one
    title: cleanTitle(str(item.title) || truncate(str(item.summary) || str(item.content_text), JSON_UNTITLED_CHARS)),
    link: absolute(str(item.url) || str(item.external_url), base),
    publishedAt: toIso(str(item.date_published) || str(item.date_modified)),
    categories: asArray(item.tags).map(str).filter(Boolean),
    bookmarkCount: null,
  }));
}

/** Title of the feed itself, used as the publisher name when none is configured */
export function parseFeedTitle(body: string): string {
  const json = jsonFeed(body);
  if (json) return str(json.title);
  const doc = parse(body);
  return (
    text(child(child(doc.rss, 'channel'), 'title')) ||
    text(child(child(doc['rdf:RDF'], 'channel'), 'title')) ||
    text(child(doc.feed, 'title'))
  );
}

/** RSS 2.0, RSS 1.0 (RDF), Atom or JSON Feed; `base` resolves relative links */
export function parseFeed(body: string, base?: string): FeedEntry[] {
  const json = jsonFeed(body);
  if (json) return parseJsonFeed(json, base);
  const doc = parse(body);

  const rssChannel = child(doc.rss, 'channel');
  if (rssChannel) {
    return asArray(child(rssChannel, 'item')).map((item) => ({
      title: cleanTitle(text(child(item, 'title'))),
      link: absolute(rssLink(item), base),
      publishedAt: toIso(text(child(item, 'pubDate')) || text(child(item, 'dc:date'))),
      categories: asArray(child(item, 'category')).map(text).filter(Boolean),
      bookmarkCount: null,
    }));
  }

  const rdf = doc['rdf:RDF'];
  if (rdf) {
    return asArray(child(rdf, 'item')).map((item) => {
      const count = Number.parseInt(text(child(item, 'hatena:bookmarkcount')), 10);
      return {
        title: cleanTitle(text(child(item, 'title'))),
        link: absolute(text(child(item, 'link')), base),
        publishedAt: toIso(text(child(item, 'dc:date'))),
        categories: asArray(child(item, 'dc:subject')).map(text).filter(Boolean),
        bookmarkCount: Number.isNaN(count) ? null : count,
      };
    });
  }

  if (doc.feed) {
    return asArray(child(doc.feed, 'entry')).map((entry) => ({
      title: cleanTitle(text(child(entry, 'title'))),
      link: absolute(atomLink(child(entry, 'link')), base),
      publishedAt: toIso(text(child(entry, 'published')) || text(child(entry, 'updated'))),
      categories: asArray(child(entry, 'category')).map(categoryText).filter(Boolean),
      bookmarkCount: null,
    }));
  }

  throw new Error('Unsupported feed format');
}
