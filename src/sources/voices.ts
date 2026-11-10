/**
 * What people said about a story: the top comments on Hacker News or Lobsters, or the fuller comments on
 * Hatena Bookmark. Public APIs only, read once per run for the stories on the page.
 */
import { fetchJson } from '#src/http.ts';
import { detectLang } from '#src/normalize.ts';
import { htmlToText, truncate } from '#src/text.ts';
import type { Story, Voices } from '#src/types.ts';
import { hatenaEntryUrl } from './platforms.ts';

/** How many comments a story shows */
const VOICES_PER_STORY = 2;
/** Long comments are cut; the full text is one tap away on the discussion page */
const MAX_COMMENT_CHARS = 280;
/** Shorter comments are usually reactions ("+1", "nice") rather than something to learn from */
const MIN_COMMENT_CHARS = { hackernews: 40, lobsters: 40, hatena: 25 } as const;
/** HN comments to look at before giving up; the first ones are the top-ranked */
const HN_COMMENTS_TO_TRY = 5;

const comment = (text: string) => {
  const cut = truncate(text, MAX_COMMENT_CHARS);
  return { text: cut, lang: detectLang(cut) };
};

interface HnItem {
  kids?: number[];
  descendants?: number;
  text?: string;
  deleted?: boolean;
  dead?: boolean;
}

/** The top-ranked comments, in HN's own order */
async function hackerNewsVoices(discussionUrl: string): Promise<Voices | null> {
  const id = new URL(discussionUrl).searchParams.get('id');
  if (!id) return null;
  const item = (url: string | number) =>
    fetchJson<HnItem | null>(`https://hacker-news.firebaseio.com/v0/item/${url}.json`);
  const story = await item(id);
  const comments: Voices['comments'] = [];
  for (const kid of (story?.kids ?? []).slice(0, HN_COMMENTS_TO_TRY)) {
    const c = await item(kid);
    const text = c && !c.deleted && !c.dead && c.text ? htmlToText(c.text) : '';
    if (text.length >= MIN_COMMENT_CHARS.hackernews) comments.push(comment(text));
    if (comments.length === VOICES_PER_STORY) break;
  }
  return { source: 'hackernews', count: story?.descendants ?? 0, url: discussionUrl, comments };
}

interface LobstersStory {
  comment_count: number;
  comments: { comment_plain: string; score: number; depth: number; is_deleted?: boolean }[];
}

/** The highest-scored comments that start a thread */
async function lobstersVoices(discussionUrl: string): Promise<Voices> {
  const data = await fetchJson<LobstersStory>(`${discussionUrl.replace(/\/$/, '')}.json`);
  const comments = data.comments
    .filter((c) => c.depth === 0 && !c.is_deleted && c.comment_plain.trim().length >= MIN_COMMENT_CHARS.lobsters)
    .sort((a, b) => b.score - a.score)
    .slice(0, VOICES_PER_STORY)
    .map((c) => comment(c.comment_plain.trim()));
  return { source: 'lobsters', count: data.comment_count, url: discussionUrl, comments };
}

interface HatenaEntry {
  count: number;
  bookmarks: { comment: string }[];
}

/**
 * Hatena can't sort comments by stars without its private API, so the longest ones are taken:
 * a summary or an opinion with reasons, more often than a one-word reaction
 */
async function hatenaVoices(url: string): Promise<Voices | null> {
  const entry = await fetchJson<HatenaEntry | null>(
    `https://b.hatena.ne.jp/entry/json/?url=${encodeURIComponent(url)}`,
  );
  if (!entry) return null;
  const comments = entry.bookmarks
    .map((b) => b.comment.trim())
    .filter((text) => text.length >= MIN_COMMENT_CHARS.hatena)
    .sort((a, b) => b.length - a.length)
    .slice(0, VOICES_PER_STORY)
    .map(comment);
  return { source: 'hatena', count: entry.count, url: hatenaEntryUrl(url), comments };
}

/**
 * The first discussion with something to show, in the order a reader of `language` would want:
 * Hatena (in Japanese) first on Japanese pages, when Hatena is one of the sources
 */
export async function findVoices(story: Story, options: { hatena: boolean }): Promise<Voices | undefined> {
  const discussion = (source: string) => story.appearances.find((a) => a.source === source)?.discussionUrl;
  const hn = discussion('hackernews');
  const lobsters = discussion('lobsters');
  const candidates = [
    options.hatena ? () => hatenaVoices(story.url) : null,
    hn ? () => hackerNewsVoices(hn) : null,
    lobsters ? () => lobstersVoices(lobsters) : null,
  ];
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
