import { XMLParser } from 'fast-xml-parser';

/** RSS 2.0 / RSS 1.0(RDF) / Atom を共通の形にしたもの */
export interface FeedEntry {
  title: string;
  link: string;
  publishedAt: string | null;
  categories: string[];
  /** はてブRSSの hatena:bookmarkcount */
  bookmarkCount: number | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // 数値っぽいタイトルが数値化されないように、値の型変換はしない
  parseTagValue: false,
  trimValues: true,
  // RSS 1.0のように数値文字参照(&#x...;)で書かれた日本語を復元する
  htmlEntities: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** テキストノードは文字列か {#text: ...} のどちらかで来る */
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

export function parseFeed(xml: string): FeedEntry[] {
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

  // RSS 1.0 (RDF) — はてブ
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

  throw new Error('未対応のフィード形式です');
}
