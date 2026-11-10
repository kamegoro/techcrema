import { fetchJson } from '#src/lib/http.ts';
import { tagSlug } from '#src/lib/text.ts';
import type { Platform, RawItem } from '#src/types.ts';

interface DevtoArticle {
  title: string;
  url: string;
  public_reactions_count: number;
  published_timestamp: string;
  tag_list: string[] | null;
}

/** dev.to's own community threads (challenges, pet photos, site news): popular there, but not tech news */
const COMMUNITY_TAGS = new Set(['devchallenge', 'watercooler', 'community', 'meta']);

async function articles(query: string): Promise<RawItem[]> {
  const items = await fetchJson<DevtoArticle[]>(`https://dev.to/api/articles?${query}`);
  return items
    .filter((a) => !(a.tag_list ?? []).some((t) => COMMUNITY_TAGS.has(t)))
    .map((a) => ({
      source: 'devto',
      title: a.title,
      url: a.url,
      score: a.public_reactions_count,
      scoreLabel: 'reactions',
      tags: a.tag_list ?? [],
      publishedAt: a.published_timestamp,
    }));
}

export const devto: Platform = {
  frontPage: () => articles('top=1&per_page=60'),
  byTag: async (tag) => {
    const slug = tagSlug(tag);
    return slug ? articles(`tag=${slug}&top=4&per_page=30`) : [];
  },
};
