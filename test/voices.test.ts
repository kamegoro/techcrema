import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from '#src/http.ts';
import { findVoices } from '#src/sources/voices.ts';
import type { Appearance, Story } from '#src/types.ts';

vi.mock('#src/http.ts', () => ({ fetchJson: vi.fn() }));

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
const LONG = 'This is a comment with enough to say that it is worth reading.';

beforeEach(() => {
  json.mockReset();
});

describe('findVoices from Hacker News', () => {
  it('takes the top-ranked comments, skipping deleted, dead and one-line ones', async () => {
    serve({
      [hnItem(1)]: { kids: [2, 3, 4, 5, 6, 7], descendants: 120 },
      [hnItem(2)]: { deleted: true },
      [hnItem(3)]: { text: 'Agreed.' },
      [hnItem(4)]: { dead: true, text: LONG },
      [hnItem(5)]: { text: `${LONG}<p>And it&#x27;s &quot;quoted&quot;.` },
      [hnItem(6)]: { text: LONG },
      [hnItem(7)]: { text: 'never fetched, two are enough' },
    });
    const voices = await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: false });
    expect(voices).toEqual({
      source: 'hackernews',
      count: 120,
      url: HN_URL,
      comments: [
        { text: `${LONG}\nAnd it's "quoted".`, lang: 'en' },
        { text: LONG, lang: 'en' },
      ],
    });
    expect(json).not.toHaveBeenCalledWith(hnItem(7));
  });

  it('cuts long comments', async () => {
    serve({ [hnItem(1)]: { kids: [2] }, [hnItem(2)]: { text: 'word '.repeat(100) } });
    const voices = await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: false });
    expect(Array.from(voices?.comments[0]?.text ?? '')).toHaveLength(280);
    expect(voices?.comments[0]?.text.endsWith('…')).toBe(true);
    expect(voices?.count).toBe(0);
  });

  it('has nothing to show for a discussion without comments or without an id', async () => {
    serve({ [hnItem(1)]: null });
    expect(await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: false })).toBeUndefined();
    expect(
      await findVoices(story([{ discussionUrl: 'https://news.ycombinator.com/item' }]), { hatena: false }),
    ).toBeUndefined();
  });
});

describe('findVoices from Lobsters', () => {
  it('takes the highest-scored comments that start a thread', async () => {
    serve({
      'https://lobste.rs/s/abc/post.json': {
        comment_count: 14,
        comments: [
          { comment_plain: `Low score. ${LONG}`, score: 1, depth: 0 },
          { comment_plain: `Reply. ${LONG}`, score: 50, depth: 1 },
          { comment_plain: `Deleted. ${LONG}`, score: 40, depth: 0, is_deleted: true },
          { comment_plain: 'Short.', score: 30, depth: 0 },
          { comment_plain: `Top. ${LONG}`, score: 20, depth: 0 },
          { comment_plain: `Second. ${LONG}`, score: 10, depth: 0 },
        ],
      },
    });
    const voices = await findVoices(story([{ source: 'lobsters', discussionUrl: 'https://lobste.rs/s/abc/post/' }]), {
      hatena: false,
    });
    expect(voices?.comments.map((c) => c.text)).toEqual([`Top. ${LONG}`, `Second. ${LONG}`]);
    expect(voices).toMatchObject({ source: 'lobsters', count: 14, url: 'https://lobste.rs/s/abc/post/' });
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
  const SHORT_WITTY = '仕様変更を検出できたんだから良いテストじゃんよ';
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
    expect(voices).toEqual({
      source: 'hatena',
      count: 144,
      url: 'https://b.hatena.ne.jp/entry/s/a.dev/post',
      comments: [
        { text: SHORT_WITTY, lang: 'ja' },
        { text: REASONED, lang: 'ja' },
      ],
    });
  });

  it('counts colored stars, and puts the longer comment first among equals', async () => {
    serveHatena([bookmark('plain', SHORT_WITTY), bookmark('colored', REASONED), bookmark('long', LONG_QUOTE)], {
      [page('plain')]: 2,
    });
    const voices = await findVoices(story([]), { hatena: true });
    expect(voices?.comments.map((c) => c.text)).toEqual([REASONED, SHORT_WITTY]);
    serveHatena([bookmark('a', SHORT_WITTY), bookmark('b', LONG_QUOTE)], {});
    expect((await findVoices(story([]), { hatena: true }))?.comments.map((c) => c.text)).toEqual([
      LONG_QUOTE,
      SHORT_WITTY,
    ]);
  });

  it('weighs the newest 100 comments, asking Hatena Star about 50 at a time', async () => {
    serveHatena(
      Array.from({ length: 120 }, (_, i) => bookmark(`user${i}`, `${REASONED} ${i}`)),
      { [page('user99')]: 5 },
    );
    const voices = await findVoices(story([]), { hatena: true });
    expect(voices?.comments[0]?.text).toBe(`${REASONED} 99`);
    const starRequests = json.mock.calls.map(([url]) => url).filter((url) => url.startsWith('https://s.hatena.com'));
    expect(starRequests.map((url) => new URL(url).searchParams.getAll('uri').length)).toEqual([50, 50]);
  });

  it('picks by length when the stars cannot be read', async () => {
    serveHatena([bookmark('witty', SHORT_WITTY), bookmark('quiet', LONG_QUOTE)], null);
    expect((await findVoices(story([]), { hatena: true }))?.comments.map((c) => c.text)).toEqual([
      LONG_QUOTE,
      SHORT_WITTY,
    ]);
  });

  it('falls back to Hacker News when Hatena has no entry or nothing worth showing', async () => {
    serve({
      [HATENA_URL]: null,
      [hnItem(1)]: { kids: [2], descendants: 3 },
      [hnItem(2)]: { text: LONG },
    });
    expect((await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: true }))?.source).toBe('hackernews');
    serve({
      [HATENA_URL]: { eid: '1', count: 3, bookmarks: [{ user: 'a', timestamp: '2026/11/07 12:34', comment: 'nice' }] },
      [hnItem(1)]: { kids: [2], descendants: 3 },
      [hnItem(2)]: { text: LONG },
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
