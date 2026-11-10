import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { qiita } from '#src/sources/qiita.ts';

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
  const item = { title: 'Q', url: 'https://qiita.com/q', likes_count: 3, created_at: 'c', tags: [{ name: 'Rust' }] };

  it('asks for recent, saved articles and keeps their tags', async () => {
    json.mockResolvedValue([item]);
    expect(await qiita.frontPage(now)).toEqual([expect.objectContaining({ score: 3, tags: ['Rust'] })]);
    expect(json).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('created:>2026-11-05 stocks:>2')), {});
  });

  it('sends the token when one is set', async () => {
    vi.stubEnv('QIITA_TOKEN', 'secret');
    json.mockResolvedValue([]);
    await qiita.frontPage(now);
    expect(json).toHaveBeenCalledWith(expect.any(String), { Authorization: 'Bearer secret' });
  });
});

describe('looking up a tag', () => {
  it('searches the tag as written, within the last few days', async () => {
    json.mockResolvedValue([
      { title: 'Q', url: 'https://qiita.com/q', likes_count: 5, created_at: 'c', tags: [{ name: 'Node.js' }] },
    ]);
    expect(await qiita.byTag?.('Node.js', now)).toEqual([expect.objectContaining({ title: 'Q', tags: ['Node.js'] })]);
    expect(json).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('tag:Node.js created:>2026-11-04')),
      {},
    );
  });
});
