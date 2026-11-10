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
  it('takes the longest comments, which say more than a quick reaction', async () => {
    serve({
      [HATENA_URL]: {
        count: 296,
        bookmarks: [
          { comment: '' },
          { comment: 'あとで読む' },
          { comment: 'ローカルLLMで患者情報を外に出さない構成は、現場の要件をよく分かっている。' },
          {
            comment:
              '院長がClaude Codeで診療支援システムを自作し、カルテ要約や問診票の読み取りまでしている。人が最終確認する作りも良い。',
          },
        ],
      },
    });
    const voices = await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: true });
    expect(voices).toEqual({
      source: 'hatena',
      count: 296,
      url: 'https://b.hatena.ne.jp/entry/s/a.dev/post',
      comments: [
        {
          text: '院長がClaude Codeで診療支援システムを自作し、カルテ要約や問診票の読み取りまでしている。人が最終確認する作りも良い。',
          lang: 'ja',
        },
        { text: 'ローカルLLMで患者情報を外に出さない構成は、現場の要件をよく分かっている。', lang: 'ja' },
      ],
    });
  });

  it('falls back to Hacker News when Hatena has no entry or nothing worth showing', async () => {
    serve({
      [HATENA_URL]: null,
      [hnItem(1)]: { kids: [2], descendants: 3 },
      [hnItem(2)]: { text: LONG },
    });
    expect((await findVoices(story([{ discussionUrl: HN_URL }]), { hatena: true }))?.source).toBe('hackernews');
    serve({
      [HATENA_URL]: { count: 3, bookmarks: [{ comment: 'nice' }] },
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
