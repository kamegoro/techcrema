import { fetchJson } from '#src/lib/http.ts';
import type { Platform, RawItem } from '#src/types.ts';

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  created_at: string;
}

async function frontPage(): Promise<RawItem[]> {
  const data = await fetchJson<{ hits: HnHit[] }>(
    'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60',
  );
  return data.hits.map((hit) => {
    const discussionUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
    return {
      source: 'hackernews',
      title: hit.title,
      // Ask HN and other posts without a link are their own discussion
      url: hit.url ?? discussionUrl,
      discussionUrl: hit.url ? discussionUrl : undefined,
      score: hit.points,
      scoreLabel: 'pt',
      tags: [],
      publishedAt: hit.created_at,
    };
  });
}

export const hackernews: Platform = { frontPage };
