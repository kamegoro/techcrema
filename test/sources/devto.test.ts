import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { devto } from '#src/sources/devto.ts';

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
  it('treats a missing tag list as no tags', async () => {
    json.mockResolvedValue([
      { title: 'D', url: 'https://dev.to/d', public_reactions_count: 9, published_timestamp: 'p', tag_list: ['ai'] },
      { title: 'E', url: 'https://dev.to/e', public_reactions_count: 1, published_timestamp: 'p', tag_list: null },
    ]);
    const [withTags, without] = await devto.frontPage(now);
    expect(withTags?.tags).toEqual(['ai']);
    expect(without?.tags).toEqual([]);
  });

  it("leaves out dev.to's own challenges, chat threads and site news", async () => {
    const post = (title: string, tags: string[]) => ({
      title,
      url: `https://dev.to/${title}`,
      public_reactions_count: 50,
      published_timestamp: 'p',
      tag_list: tags,
    });
    json.mockResolvedValue([post('pets', ['watercooler']), post('news', ['meta']), post('rust', ['rust'])]);
    expect((await devto.frontPage(now)).map((a) => a.title)).toEqual(['rust']);
  });
});

describe('looking up a tag', () => {
  it("asks for the tag's top posts of the last few days", async () => {
    json.mockResolvedValue([
      { title: 'D', url: 'https://dev.to/d', public_reactions_count: 9, published_timestamp: 'p', tag_list: ['node'] },
    ]);
    expect(await devto.byTag?.('node', now)).toEqual([expect.objectContaining({ score: 9 })]);
    expect(json).toHaveBeenCalledWith('https://dev.to/api/articles?tag=node&top=4&per_page=30');
  });

  it('skips tags that have no letters or digits to look up', async () => {
    expect(await devto.byTag?.('テスト', now)).toEqual([]);
    expect(json).not.toHaveBeenCalled();
  });
});
