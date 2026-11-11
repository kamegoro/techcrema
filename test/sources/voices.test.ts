import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from '#src/lib/http.ts';
import { findVoices } from '#src/sources/voices.ts';
import type { Appearance, Story } from '#src/types.ts';

vi.mock('#src/lib/http.ts', () => ({ fetchJson: vi.fn() }));

const json = vi.mocked(fetchJson);

/** Answers each URL from `responses`; anything else fails like a missing page */
function serve(responses: Record<string, unknown>) {
  json.mockImplementation(async (url: string) => {
    if (url in responses) return responses[url];
    throw new Error(`HTTP 404 (${url})`);
  });
}

const story = (appearances: Partial<Appearance>[]): Story => ({
  key: 'a.dev/post',
  url: 'https://a.dev/post',
  title: 'A post',
  domain: 'a.dev',
  lang: 'en',
  tags: [],
  publishedAt: null,
  appearances: appearances.map((a) => ({ source: 'hackernews', score: 1, percentile: 0.5, ...a })),
  pop: 0.5,
  interest: 0,
  topics: [],
  matchedKeywords: [],
});

const HN_URL = 'https://news.ycombinator.com/item?id=1';
const hnItem = (id: number | string) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const HATENA_URL = `https://b.hatena.ne.jp/entry/json/?url=${encodeURIComponent('https://a.dev/post')}`;
const LONG = 'This is a comment with enough to say that it is worth reading, twice over.';

beforeEach(() => {
  json.mockReset();
});

describe('findVoices from Hacker News', () => {
  it('takes the top-ranked comments, skipping deleted, dead and one-line ones', async () => {
    serve({
      [hnItem(1)]: { kids: [2, 3, 4, 5, 6, 7], descendants: 120 },
      [hnItem(2)]: { deleted: true },
      [hnItem(3)]: { by: 'brief', text: 'Agreed.' },
      [hnItem(4)]: { by: 'gone', dead: true, text: LONG },
      [hnItem(5)]: { by: 'pat', text: `${LONG}<p>And it&#x27;s &quot;quoted&quot;.` },
      [hnItem(6)]: { by: 'sam', text: LONG },
      [hnItem(7)]: { by: 'late', text: 'never fetched, two are enough' },
    });
    const voices = await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: false });
    expect(voices).toMatchObject({ source: 'hackernews', count: 120, url: HN_URL });
    expect(voices?.comments.map(({ author, url, lang }) => ({ author, url, lang }))).toEqual([
      { author: 'pat', url: 'https://news.ycombinator.com/item?id=5', lang: 'en' },
      { author: 'sam', url: 'https://news.ycombinator.com/item?id=6', lang: 'en' },
    ]);
    expect(json).not.toHaveBeenCalledWith(hnItem(7));
  });

  it('shows only a part of each comment: at most half of it, and never more than 100 characters', async () => {
    serve({ [hnItem(1)]: { kids: [2] }, [hnItem(2)]: { by: 'pat', text: 'word '.repeat(100) } });
    const long = await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: false });
    expect(Array.from(long?.comments[0]?.text ?? '')).toHaveLength(100);
    expect(long?.count).toBe(0);
    serve({ [hnItem(1)]: { kids: [2] }, [hnItem(2)]: { by: 'pat', text: LONG } });
    const short = await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: false });
    expect(short?.comments[0]?.text).toBe('This is a comment with enough to say…');
  });

  it('has nothing to show for a discussion without comments or without an id', async () => {
    serve({ [hnItem(1)]: null });
    expect(await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: false })).toBeUndefined();
    expect(
      await findVoices(story([{ discussionUrl: 'https://news.ycombinator.com/item' }]), { hatena: false }),
    ).toBeUndefined();
  });
});

describe('findVoices from Hatena Bookmark', () => {
  const EID = '42';
  const bookmark = (user: string, comment: string) => ({ user, timestamp: '2026/11/07 12:34', comment });
  const page = (user: string) => `https://b.hatena.ne.jp/${user}/20261107#bookmark-${EID}`;
  /** Hatena Star's answer for the pages a request asks about */
  const starAnswer = (url: string, stars: Record<string, number>) => ({
    entries: new URL(url).searchParams.getAll('uri').map((uri) => ({
      uri,
      stars: Array.from({ length: stars[uri] ?? 0 }, () => ({ name: 'someone' })),
      colored_stars: uri === page('colored') ? [{ color: 'green', stars: [{}, {}, {}] }] : undefined,
    })),
  });
  const SHORT_WITTY = '仕様変更をちゃんと検出できたんだから、むしろ良いテストだったと言えるのでは';
  const LONG_QUOTE =
    '「ある日突然 (内部的に) ubuntu-26.04 に切り替わりました」という引用だけのコメントで、スターは付いていない';
  const REASONED = '明治5年以前は太陰暦なので、単に西暦を明治にしただけでは済まない';

  function serveHatena(bookmarks: ReturnType<typeof bookmark>[], stars: Record<string, number> | null) {
    json.mockImplementation(async (url: string) => {
      if (url === HATENA_URL) return { eid: EID, count: 144, bookmarks };
      if (url.startsWith('https://s.hatena.com/entry.json?') && stars) return starAnswer(url, stars);
      throw new Error(`HTTP 404 (${url})`);
    });
  }

  it("takes the comments Hatena users starred most, like Hatena's popular comments", async () => {
    serveHatena(
      [
        bookmark('quiet', LONG_QUOTE),
        bookmark('witty', SHORT_WITTY),
        bookmark('reader', 'あとで読む'),
        bookmark('reasoned', REASONED),
      ],
      { [page('witty')]: 22, [page('reasoned')]: 9 },
    );
    const voices = await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: true });
    expect(voices).toMatchObject({ source: 'hatena', count: 144, url: 'https://b.hatena.ne.jp/entry/s/a.dev/post' });
    expect(voices?.comments).toEqual([
      { text: '仕様変更をちゃんと検出できたんだか…', lang: 'ja', author: 'id:witty', url: page('witty') },
      { text: '明治5年以前は太陰暦なので、単…', lang: 'ja', author: 'id:reasoned', url: page('reasoned') },
    ]);
  });

  it('counts colored stars, and puts the longer comment first among equals', async () => {
    serveHatena([bookmark('plain', SHORT_WITTY), bookmark('colored', REASONED), bookmark('long', LONG_QUOTE)], {
      [page('plain')]: 2,
    });
    const voices = await findVoices(story([]), { hatena: true });
    expect(voices?.comments.map((c) => c.author)).toEqual(['id:colored', 'id:plain']);
    serveHatena([bookmark('a', SHORT_WITTY), bookmark('b', LONG_QUOTE)], {});
    expect((await findVoices(story([]), { hatena: true }))?.comments.map((c) => c.author)).toEqual(['id:b', 'id:a']);
  });

  it('weighs the newest 100 comments, asking Hatena Star about 50 at a time', async () => {
    serveHatena(
      Array.from({ length: 120 }, (_, i) => bookmark(`user${i}`, `${REASONED} ${i}`)),
      { [page('user99')]: 5 },
    );
    const voices = await findVoices(story([]), { hatena: true });
    expect(voices?.comments[0]?.author).toBe('id:user99');
    const starRequests = json.mock.calls.map(([url]) => url).filter((url) => new URL(url).host === 's.hatena.com');
    expect(starRequests.map((url) => new URL(url).searchParams.getAll('uri').length)).toEqual([50, 50]);
  });

  it('picks by length when the stars cannot be read', async () => {
    serveHatena([bookmark('witty', SHORT_WITTY), bookmark('quiet', LONG_QUOTE)], null);
    expect((await findVoices(story([]), { hatena: true }))?.comments.map((c) => c.author)).toEqual([
      'id:quiet',
      'id:witty',
    ]);
  });

  it('falls back to Hacker News when Hatena has no entry or nothing worth showing', async () => {
    serve({
      [HATENA_URL]: null,
      [hnItem(1)]: { kids: [2], descendants: 3 },
      [hnItem(2)]: { by: 'pat', text: LONG },
    });
    expect((await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: true }))?.source).toBe('hackernews');
    serve({
      [HATENA_URL]: { eid: '1', count: 3, bookmarks: [{ user: 'a', timestamp: '2026/11/07 12:34', comment: 'nice' }] },
      [hnItem(1)]: { kids: [2], descendants: 3 },
      [hnItem(2)]: { by: 'pat', text: LONG },
    });
    expect((await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: true }))?.source).toBe('hackernews');
  });

  it('is not asked on pages that do not use Hatena', async () => {
    serve({});
    expect(await findVoices(story([{ source: 'devto' }]), { hatena: false })).toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('treats a discussion that fails to load as having nothing to say', async () => {
    serve({});
    expect(await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: true })).toBeUndefined();
  });
});
