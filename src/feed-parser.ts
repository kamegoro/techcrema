import { XMLParser } from 'fast-xml-parser';

/** RSS 2.0 / RSS 1.0 (RDF) / Atom entries in one common shape */
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
  // Don't convert values, so a title like "2048" stays a string
  parseTagValue: false,
  trimValues: true,
  // Decode numeric character references (&#x...;), which RSS 1.0 feeds use for non-ASCII text
  htmlEntities: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** A text node arrives either as a string or as {#text: ...} */
function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return text((value as Record<string, unknown>)['#text']);
  }
  return '';
}

function toIso(value: string): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function atomLink(link: unknown): string {
  const links = asArray(link as Record<string, string> | Record<string, string>[]);
  const alternate = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
  if (!alternate) return '';
  return typeof alternate === 'string' ? alternate : (alternate['@_href'] ?? '');
}

/**
 * True when the document declares a DTD or entities. Text inside CDATA sections and comments
 * is ignored: feeds often embed whole HTML pages there (GitHub's blog includes "<!DOCTYPE html …>"),
 * and the parser treats that text as plain characters.
 */
export function hasDtd(xml: string): boolean {
  const outsideText = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  return /<!DOCTYPE|<!ENTITY/i.test(outsideText);
}

/** Title of the feed itself (channel/feed title), used as the publisher name when none is configured */
export function parseFeedTitle(xml: string): string {
  if (hasDtd(xml)) return '';
  const doc = parser.parse(xml) as Record<string, any>;
  return text(doc.rss?.channel?.title) || text(doc['rdf:RDF']?.channel?.title) || text(doc.feed?.title);
}

export function parseFeed(xml: string): FeedEntry[] {
  // RSS/Atom never needs a DTD. Rejecting it rules out entity-expansion attacks such as Billion Laughs.
  if (hasDtd(xml)) {
    throw new Error('Feeds with a DTD are not accepted');
  }
  const doc = parser.parse(xml) as Record<string, any>;

  // RSS 2.0
  if (doc.rss?.channel) {
    return asArray(doc.rss.channel.item).map((item: any) => ({
      title: text(item.title),
      link: text(item.link),
      publishedAt: toIso(text(item.pubDate) || text(item['dc:date'])),
      categories: asArray(item.category).map(text).filter(Boolean),
      bookmarkCount: null,
    }));
  }

  // RSS 1.0 (RDF), used by Hatena Bookmark
  if (doc['rdf:RDF']) {
    return asArray(doc['rdf:RDF'].item).map((item: any) => {
      const count = Number.parseInt(text(item['hatena:bookmarkcount']), 10);
      return {
        title: text(item.title),
        link: text(item.link),
        publishedAt: toIso(text(item['dc:date'])),
        categories: asArray(item['dc:subject']).map(text).filter(Boolean),
        bookmarkCount: Number.isNaN(count) ? null : count,
      };
    });
  }

  // Atom
  if (doc.feed) {
    return asArray(doc.feed.entry).map((entry: any) => ({
      title: text(entry.title),
      link: atomLink(entry.link),
      publishedAt: toIso(text(entry.published) || text(entry.updated)),
      categories: asArray(entry.category)
        .map((c: any) => (typeof c === 'string' ? c : (c['@_term'] ?? '')))
        .filter(Boolean),
      bookmarkCount: null,
    }));
  }

  throw new Error('Unsupported feed format');
}
