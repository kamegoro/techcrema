import { fetchJson } from '#src/lib/http.ts';
import { tagSlug } from '#src/lib/text.ts';
import type { Platform, RawItem } from '#src/types.ts';

interface LobstersStory {
  title: string;
  url: string;
  score: number;
  created_at: string;
  tags: string[];
  comments_url: string;
}

async function stories(path: string): Promise<RawItem[]> {
  const items = await fetchJson<LobstersStory[]>(`https://lobste.rs/${path}`);
  return items.map((s) => ({
    source: 'lobsters',
    title: s.title,
    url: s.url || s.comments_url,
    discussionUrl: s.url ? s.comments_url : undefined,
    score: s.score,
    scoreLabel: 'pt',
    tags: s.tags,
    publishedAt: s.created_at,
  }));
}

// Lobsters answers an unknown tag with an error page, so only the tags it lists are asked for
let knownTags: Promise<Set<string>> | undefined;
function lobstersTags(): Promise<Set<string>> {
  knownTags ??= fetchJson<{ tag: string }[]>('https://lobste.rs/tags.json').then(
    (tags) => new Set(tags.map((t) => t.tag)),
  );
  return knownTags;
}

export const lobsters: Platform = {
  frontPage: () => stories('hottest.json'),
  async byTag(tag) {
    const slug = tagSlug(tag);
    return (await lobstersTags()).has(slug) ? stories(`t/${slug}.json`) : [];
  },
};
