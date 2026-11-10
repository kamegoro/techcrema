import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { zenn } from '#src/sources/zenn.ts';

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
  it('tags idea posts', async () => {
    json.mockResolvedValue({
      articles: [
        { title: 'Tech', path: '/u/articles/a', liked_count: 10, published_at: 'p', article_type: 'tech' },
        { title: 'Idea', path: '/u/articles/b', liked_count: 5, published_at: 'p', article_type: 'idea' },
      ],
    });
    const [tech, idea] = await zenn.frontPage(now);
    expect(tech).toMatchObject({ url: 'https://zenn.dev/u/articles/a', tags: [] });
    expect(idea?.tags).toEqual(['idea']);
  });
});

describe('looking up a tag', () => {
  it('asks for the topic by its slug', async () => {
    json.mockResolvedValue({
      articles: [{ title: 'Z', path: '/u/articles/z', liked_count: 12, published_at: 'p', article_type: 'tech' }],
    });
    expect(await zenn.byTag?.('Node.js', now)).toEqual([expect.objectContaining({ score: 12 })]);
    expect(json).toHaveBeenCalledWith('https://zenn.dev/api/articles?topicname=nodejs&order=latest&count=30');
  });

  it('skips tags that have no letters or digits to look up', async () => {
    expect(await zenn.byTag?.('テスト', now)).toEqual([]);
    expect(json).not.toHaveBeenCalled();
  });
});
