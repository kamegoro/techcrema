import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { lobsters } from '#src/sources/lobsters.ts';

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
  it('uses the comments page for text posts', async () => {
    const base = { score: 20, created_at: 'c', tags: ['rust'], comments_url: 'https://lobste.rs/s/x' };
    json.mockResolvedValue([
      { ...base, title: 'Link', url: 'https://a.dev/x' },
      { ...base, title: 'Text', url: '' },
    ]);
    const [link, text] = await lobsters.frontPage(now);
    expect(link).toMatchObject({ url: 'https://a.dev/x', discussionUrl: 'https://lobste.rs/s/x' });
    expect(text).toMatchObject({ url: 'https://lobste.rs/s/x', discussionUrl: undefined });
  });
});

describe('looking up a tag', () => {
  it('only asks for tags it has, fetching its tag list once', async () => {
    const story = {
      title: 'L',
      url: 'https://a.dev/l',
      score: 7,
      created_at: 'c',
      tags: ['java'],
      comments_url: 'https://lobste.rs/s/l',
    };
    json.mockImplementation(async (url: string) => (url.endsWith('tags.json') ? [{ tag: 'java' }] : [story]));
    expect(await lobsters.byTag?.('Java', now)).toEqual([expect.objectContaining({ title: 'L' })]);
    expect(await lobsters.byTag?.('e2e', now)).toEqual([]);
    expect(json.mock.calls.map(([url]) => url)).toEqual([
      'https://lobste.rs/tags.json',
      'https://lobste.rs/t/java.json',
    ]);
  });
});
