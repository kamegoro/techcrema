import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/lib/http.ts';
import { hatena, slides } from '#src/sources/hatena.ts';

vi.mock('#src/lib/http.ts', () => ({
  fetchJson: vi.fn(),
  fetchText: vi.fn(),
  githubHeaders: () => ({ Accept: 'application/vnd.github+json' }),
}));

const now = new Date('2026-11-08T09:00:00Z');

beforeEach(() => {
  vi.mocked(fetchJson).mockReset();
  vi.mocked(fetchText).mockReset();
});

describe('front page', () => {
  it('reads bookmark counts and drops the "Technology" category every entry has', async () => {
    vi.mocked(fetchText).mockResolvedValue(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
        <item><title>A</title><link>https://a.dev/x</link><dc:subject>&#x30C6;&#x30AF;&#x30CE;&#x30ED;&#x30B8;&#x30FC;</dc:subject>
          <dc:subject>neovim</dc:subject><hatena:bookmarkcount>185</hatena:bookmarkcount></item>
      </rdf:RDF>`);
    expect(await hatena.frontPage(now)).toEqual([
      expect.objectContaining({
        score: 185,
        tags: ['neovim'],
        discussionUrl: 'https://b.hatena.ne.jp/entry/s/a.dev/x',
      }),
    ]);
  });

  it('links http articles to the comment page without the /s/ prefix', async () => {
    vi.mocked(fetchText).mockResolvedValue(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
        <item><title>B</title><link>http://b.dev/y</link></item>
      </rdf:RDF>`);
    expect((await hatena.frontPage(now))[0]?.discussionUrl).toBe('https://b.hatena.ne.jp/entry/b.dev/y');
  });
});

describe('slides', () => {
  it('reads the decks Hatena users bookmarked on each slide site', async () => {
    const deck = (link: string, count: number) => `<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"
        xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
        <item><title>Deck</title><link>${link}</link><hatena:bookmarkcount>${count}</hatena:bookmarkcount></item>
      </rdf:RDF>`;
    vi.mocked(fetchText)
      .mockResolvedValueOnce(deck('https://speakerdeck.com/kame/deck', 120))
      .mockResolvedValueOnce(deck('https://www.docswell.com/s/kame/ABC-deck', 40));
    expect(await slides.frontPage(now)).toEqual([
      expect.objectContaining({
        source: 'slides',
        url: 'https://speakerdeck.com/kame/deck',
        score: 120,
        scoreLabel: 'users',
        discussionUrl: 'https://b.hatena.ne.jp/entry/s/speakerdeck.com/kame/deck',
      }),
      expect.objectContaining({ source: 'slides', url: 'https://www.docswell.com/s/kame/ABC-deck', score: 40 }),
    ]);
    expect(vi.mocked(fetchText).mock.calls.map(([url]) => url)).toEqual([
      'https://b.hatena.ne.jp/site/speakerdeck.com/?mode=rss',
      'https://b.hatena.ne.jp/site/www.docswell.com/?mode=rss',
    ]);
  });
});
