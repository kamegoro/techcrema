import { type FeedEntry, parseFeed } from '#src/lib/feed-parser.ts';
import { fetchText } from '#src/lib/http.ts';
import type { Platform, RawItem } from '#src/types.ts';

/** Hatena's "Technology" category: every entry in the IT feed has it, so it says nothing */
const TECHNOLOGY_CATEGORY = '\u30c6\u30af\u30ce\u30ed\u30b8\u30fc';

/** Speaker Deck closes its own feeds to crawlers, so decks come from Hatena's per-site feeds */
const SLIDE_SITES = ['speakerdeck.com', 'www.docswell.com'];

/** The page with Hatena users' comments on `link` */
export function hatenaEntryUrl(link: string): string {
  if (link.startsWith('https://')) return `https://b.hatena.ne.jp/entry/s/${link.slice('https://'.length)}`;
  return `https://b.hatena.ne.jp/entry/${link.replace(/^http:\/\//, '')}`;
}

function toItem(entry: FeedEntry): RawItem {
  return {
    source: 'hatena',
    title: entry.title,
    url: entry.link,
    discussionUrl: hatenaEntryUrl(entry.link),
    score: entry.bookmarkCount,
    scoreLabel: 'users',
    tags: entry.categories.filter((c) => c !== TECHNOLOGY_CATEGORY),
    publishedAt: entry.publishedAt,
  };
}

export const hatena: Platform = {
  frontPage: async () => parseFeed(await fetchText('https://b.hatena.ne.jp/hotentry/it.rss')).map(toItem),
};

export const slides: Platform = {
  async frontPage() {
    const items: RawItem[] = [];
    for (const site of SLIDE_SITES) {
      const xml = await fetchText(`https://b.hatena.ne.jp/site/${site}/?mode=rss`);
      items.push(...parseFeed(xml).map((entry) => ({ ...toItem(entry), source: 'slides' as const })));
    }
    return items;
  },
};
