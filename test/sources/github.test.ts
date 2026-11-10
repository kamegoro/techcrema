import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { github } from '#src/sources/github.ts';

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
  it('titles repos with their description and tags them with their topics only', async () => {
    const base = { html_url: 'https://github.com/a/b', stargazers_count: 100, created_at: 'c' };
    json.mockResolvedValue({
      items: [
        { ...base, full_name: 'a/b', description: 'A tool', topics: ['cli'] },
        { ...base, full_name: 'a/c', description: 'Another tool' },
      ],
    });
    const [described, untagged] = await github.frontPage(now);
    expect(described).toMatchObject({ title: 'a/b — A tool', tags: ['cli'] });
    expect(untagged).toMatchObject({ title: 'a/c — Another tool', tags: [] });
    expect(json).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('created:>2026-11-01')), {
      Accept: 'application/vnd.github+json',
    });
  });

  it('drops repos with no description, a description that repeats the name, or a known lure', async () => {
    const base = { html_url: 'https://github.com/x/y', stargazers_count: 400, created_at: 'c' };
    json.mockResolvedValue({
      items: [
        { ...base, full_name: 'x/none', description: null },
        { ...base, full_name: 'x/blank', description: '  ' },
        { ...base, full_name: 'x/Free_Pro_Auto', description: 'Free_Pro_Auto' },
        { ...base, full_name: 'x/capcut', description: 'Capcut 2026 pre-configured environment for video editing' },
        { ...base, full_name: 'x/opt', description: 'Optimizer automated deployment pipeline for desktops' },
        { ...base, full_name: 'x/real', description: 'A real project' },
      ],
    });
    expect((await github.frontPage(now)).map((r) => r.title)).toEqual(['x/real — A real project']);
  });
});
