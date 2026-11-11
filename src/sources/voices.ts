// What people said about a story, from its discussion on Hatena Bookmark or Hacker News.
import { fetchJson } from '#src/lib/http.ts';
import { detectLang, htmlToText, truncate } from '#src/lib/text.ts';
import type { Comment, Story, Voices } from '#src/types.ts';
import { hatenaEntryUrl } from './hatena.ts';

const VOICES_PER_STORY = 2;
/**
 * A comment is someone's work, so only a part of it is shown, like a search result's snippet:
 * at most half of it and never more than this, credited to its author and linking to the whole
 */
const MAX_EXCERPT_CHARS = 100;
/** Shorter ones are usually reactions ("+1", "nice"), and half of them says nothing */
const MIN_COMMENT_CHARS = { hackernews: 60, hatena: 30 } as const;
/** HN lists comments best first, so the first few are enough */
const HN_COMMENTS_TO_TRY = 5;

function excerpt(text: string, author: string, url: string): Comment {
  const half = Math.floor(Array.from(text).length / 2);
  const part = truncate(text, Math.min(MAX_EXCERPT_CHARS, half));
  return { text: part, lang: detectLang(part), author, url };
}

interface HnItem {
  by?: string;
  kids?: number[];
  descendants?: number;
  text?: string;
  deleted?: boolean;
  dead?: boolean;
}

async function hackerNewsVoices(discussionUrl: string): Promise<Voices | null> {
  const id = new URL(discussionUrl).searchParams.get('id');
  if (!id) return null;
  const item = (url: string | number) =>
    fetchJson<HnItem | null>(`https://hacker-news.firebaseio.com/v0/item/${url}.json`);
  const story = await item(id);
  const comments: Comment[] = [];
  for (const kid of (story?.kids ?? []).slice(0, HN_COMMENTS_TO_TRY)) {
    const c = await item(kid);
    const text = c && !c.deleted && !c.dead && c.by && c.text ? htmlToText(c.text) : '';
    if (c?.by && text.length >= MIN_COMMENT_CHARS.hackernews) {
      comments.push(excerpt(text, c.by, `https://news.ycombinator.com/item?id=${kid}`));
    }
    if (comments.length === VOICES_PER_STORY) break;
  }
  return { source: 'hackernews', count: story?.descendants ?? 0, url: discussionUrl, comments };
}

interface HatenaBookmark {
  user: string;
  /** "2026/11/07 12:34" */
  timestamp: string;
  comment: string;
}

interface HatenaEntry {
  eid: string;
  count: number;
  bookmarks: HatenaBookmark[];
}

interface StarEntries {
  /** Only pages with stars are listed; colored_stars only when some are not yellow */
  entries: { uri: string; stars: unknown[]; colored_stars?: { stars: unknown[] }[] }[];
}

/** Hatena lists the newest first */
const HATENA_COMMENTS_TO_WEIGH = 100;
/** Keeps each Hatena Star request's URL a sensible length */
const STAR_URIS_PER_REQUEST = 50;

/** A bookmark comment's own page, which is what Hatena Star files its stars under */
const bookmarkPage = (eid: string, b: HatenaBookmark) =>
  `https://b.hatena.ne.jp/${b.user}/${b.timestamp.slice(0, 10).replaceAll('/', '')}#bookmark-${eid}`;

async function starsOn(pages: string[]): Promise<Map<string, number>> {
  const stars = new Map<string, number>();
  for (let i = 0; i < pages.length; i += STAR_URIS_PER_REQUEST) {
    const query = pages
      .slice(i, i + STAR_URIS_PER_REQUEST)
      .map((page) => `uri=${encodeURIComponent(page)}`)
      .join('&');
    const data = await fetchJson<StarEntries>(`https://s.hatena.com/entry.json?${query}`);
    for (const e of data.entries) {
      const colored = (e.colored_stars ?? []).reduce((n, c) => n + c.stars.length, 0);
      stars.set(e.uri, e.stars.length + colored);
    }
  }
  return stars;
}

/** The most-starred comments, like Hatena's own "popular comments"; by length when the stars can't be read */
async function hatenaVoices(url: string): Promise<Voices | null> {
  const entry = await fetchJson<HatenaEntry | null>(
    `https://b.hatena.ne.jp/entry/json/?url=${encodeURIComponent(url)}`,
  );
  if (!entry) return null;
  const candidates = entry.bookmarks
    .filter((b) => b.comment.trim().length >= MIN_COMMENT_CHARS.hatena)
    .slice(0, HATENA_COMMENTS_TO_WEIGH)
    .map((b) => ({ text: b.comment.trim(), user: b.user, page: bookmarkPage(entry.eid, b) }));
  const stars = await starsOn(candidates.map((c) => c.page)).catch(() => new Map<string, number>());
  const starsOf = (c: { page: string }) => stars.get(c.page) ?? 0;
  const comments = candidates
    .sort((a, b) => starsOf(b) - starsOf(a) || b.text.length - a.text.length)
    .slice(0, VOICES_PER_STORY)
    .map((c) => excerpt(c.text, `id:${c.user}`, c.page));
  return { source: 'hatena', count: entry.count, url: hatenaEntryUrl(url), comments };
}

/** The first discussion with something to say; Hatena, which is in Japanese, comes first when `hatena` is set */
export async function findVoices(story: Story, options: { hatena: boolean }): Promise<Voices | undefined> {
  const discussion = (source: string) => story.appearances.find((a) => a.source === source)?.discussionUrl;
  const hn = discussion('hackernews');
  const candidates = [options.hatena ? () => hatenaVoices(story.url) : null, hn ? () => hackerNewsVoices(hn) : null];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const voices = await candidate();
      if (voices?.comments.length) return voices;
    } catch {
      // A discussion that can't be read just means no voices from it
    }
  }
  return undefined;
}
