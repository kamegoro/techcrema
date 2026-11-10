import { utcDateDaysAgo } from '#src/lib/dates.ts';
import { fetchJson } from '#src/lib/http.ts';
import type { Platform, RawItem } from '#src/types.ts';

interface QiitaItem {
  title: string;
  url: string;
  likes_count: number;
  created_at: string;
  tags: { name: string }[];
}

async function search(query: string, perPage: number): Promise<RawItem[]> {
  const token = process.env.QIITA_TOKEN;
  const items = await fetchJson<QiitaItem[]>(
    `https://qiita.com/api/v2/items?per_page=${perPage}&query=${encodeURIComponent(query)}`,
    token ? { Authorization: `Bearer ${token}` } : {},
  );
  return items.map((i) => ({
    source: 'qiita',
    title: i.title,
    url: i.url,
    score: i.likes_count,
    scoreLabel: 'likes',
    tags: i.tags.map((t) => t.name),
    publishedAt: i.created_at,
  }));
}

export const qiita: Platform = {
  frontPage: (now) => search(`created:>${utcDateDaysAgo(3, now)} stocks:>2`, 100),
  byTag: (tag, now) => search(`tag:${tag} created:>${utcDateDaysAgo(4, now)}`, 30),
};
