import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { huggingface } from '#src/sources/huggingface.ts';

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
  it('links to the paper page', async () => {
    json.mockResolvedValue([{ title: 'P', publishedAt: 'p', paper: { id: '2611.0001', upvotes: 42 } }]);
    expect(await huggingface.frontPage(now)).toEqual([
      expect.objectContaining({ url: 'https://huggingface.co/papers/2611.0001', score: 42 }),
    ]);
  });
});
