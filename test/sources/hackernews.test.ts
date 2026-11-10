import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { hackernews } from '#src/sources/hackernews.ts';

vi.mock('#src/lib/http.ts', () => ({
  fetchJson: vi.fn(),
  fetchText: vi.fn(),
  githubHeaders: () => ({ Accept: 'application/vnd.github+json' }),
}));

const json = vi.mocked(fetchJson);
const now = new Date('2026-11-08T09:00:00Z');

beforeEach(() => {
  vi.mocked(fetchJson).mockReset();
  vi.mocked(fetchText).mockReset();
});

describe('front page', () => {
  it('links to the article, and to the discussion when the post has no link', async () => {
    json.mockResolvedValue({
      hits: [
        { objectID: '1', title: 'Link post', url: 'https://a.dev/x', points: 300, created_at: '2026-11-08T00:00:00Z' },
        { objectID: '2', title: 'Ask HN: y', url: null, points: 50, created_at: '2026-11-08T01:00:00Z' },
      ],
    });
    const [link, ask] = await hackernews.frontPage(now);
    expect(link).toMatchObject({
      url: 'https://a.dev/x',
      discussionUrl: 'https://news.ycombinator.com/item?id=1',
      score: 300,
    });
    expect(ask).toMatchObject({ url: 'https://news.ycombinator.com/item?id=2', discussionUrl: undefined });
  });
});
