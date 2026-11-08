import { XMLParser } from 'fast-xml-parser';

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

/** Title of the feed itself, used as the publisher name when none is configured */
export function parseFeedTitle(xml: string): string {
  const doc = parse(xml);
  return (
    text(child(child(doc.rss, 'channel'), 'title')) ||
    text(child(child(doc['rdf:RDF'], 'channel'), 'title')) ||
    text(child(doc.feed, 'title'))
  );
}

export function parseFeed(xml: string): FeedEntry[] {
  const doc = parse(xml);

  const rssChannel = child(doc.rss, 'channel');
  if (rssChannel) {
    return asArray(child(rssChannel, 'item')).map((item) => ({
      title: text(child(item, 'title')),
      link: text(child(item, 'link')),
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
        title: text(child(item, 'title')),
        link: text(child(item, 'link')),
        publishedAt: toIso(text(child(item, 'dc:date'))),
        categories: asArray(child(item, 'dc:subject')).map(text).filter(Boolean),
        bookmarkCount: Number.isNaN(count) ? null : count,
      };
    });
  }

  if (doc.feed) {
    return asArray(child(doc.feed, 'entry')).map((entry) => ({
      title: text(child(entry, 'title')),
      link: atomLink(child(entry, 'link')),
      publishedAt: toIso(text(child(entry, 'published')) || text(child(entry, 'updated'))),
      categories: asArray(child(entry, 'category')).map(categoryText).filter(Boolean),
      bookmarkCount: null,
    }));
  }

  throw new Error('Unsupported feed format');
}
