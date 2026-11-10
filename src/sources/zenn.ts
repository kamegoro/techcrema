import { fetchJson } from '#src/lib/http.ts';
import { tagSlug } from '#src/lib/text.ts';
import type { Platform, RawItem } from '#src/types.ts';

interface ZennArticle {
  title: string;
  path: string;
  liked_count: number;
  published_at: string;
  article_type: string;
}

async function articles(query: string): Promise<RawItem[]> {
  const data = await fetchJson<{ articles: ZennArticle[] }>(`https://zenn.dev/api/articles?${query}`);
  return data.articles.map((a) => ({
    source: 'zenn',
    title: a.title,
    url: `https://zenn.dev${a.path}`,
    score: a.liked_count,
    scoreLabel: 'likes',
    tags: a.article_type === 'idea' ? ['idea'] : [],
    publishedAt: a.published_at,
  }));
}

export const zenn: Platform = {
  frontPage: () => articles('order=daily&count=60'),
  byTag: async (tag) => {
    const slug = tagSlug(tag);
    return slug ? articles(`topicname=${slug}&order=latest&count=30`) : [];
  },
};
