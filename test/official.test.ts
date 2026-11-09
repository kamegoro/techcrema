import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '../src/http.ts';
import { classifyRelease, fetchGithubReleases, fetchOfficialFeed, releaseSummary } from '../src/sources/official.ts';

vi.mock('../src/http.ts', () => ({ fetchJson: vi.fn(), fetchText: vi.fn(), githubHeaders: () => ({}) }));

const rss = (channelTitle: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${channelTitle}</title>
  <item><title>Post</title><link>https://blog.example.com/post</link><pubDate>Sun, 08 Nov 2026 00:00:00 GMT</pubDate>
  <category>release</category></item></channel></rss>`;

beforeEach(() => {
  vi.mocked(fetchText).mockReset();
  vi.mocked(fetchJson).mockReset();
});

describe('fetchOfficialFeed', () => {
  it('uses the configured name as the publisher', async () => {
    vi.mocked(fetchText).mockResolvedValue(rss('Ignored'));
    expect(await fetchOfficialFeed('Node.js', 'https://blog.example.com/feed')).toEqual([
      {
        source: 'official',
        title: 'Post',
        url: 'https://blog.example.com/post',
        score: null,
        tags: ['release'],
        publishedAt: '2026-11-08T00:00:00.000Z',
        publisher: 'Node.js',
      },
    ]);
  });

  it("falls back to the feed's own title, cut to 40 characters, then to the host name", async () => {
    vi.mocked(fetchText).mockResolvedValue(rss('A'.repeat(50)));
    expect((await fetchOfficialFeed(undefined, 'https://blog.example.com/feed'))[0]?.publisher).toBe('A'.repeat(40));
    vi.mocked(fetchText).mockResolvedValue(rss(''));
    expect((await fetchOfficialFeed(undefined, 'https://blog.example.com/feed'))[0]?.publisher).toBe(
      'blog.example.com',
    );
  });
});

describe('fetchGithubReleases', () => {
  const release = { html_url: 'https://github.com/a/b/releases/x', published_at: 'p', draft: false, prerelease: false };

  it('keeps published, versioned releases and names them after the repo', async () => {
    vi.mocked(fetchJson).mockResolvedValue([
      { ...release, name: ' v2.1.0 ', tag_name: 'v2.1.0' },
      { ...release, name: null, tag_name: 'v2.0.1' },
      { ...release, name: 'Draft', tag_name: 'v3.0.0', draft: true },
      { ...release, name: 'RC', tag_name: 'v3.0.0-rc.1', prerelease: true },
      { ...release, name: 'Nightly', tag_name: 'nightly' },
    ]);
    const items = await fetchGithubReleases('a/b');
    expect(items.map((i) => [i.title, i.releaseKind, i.publisher])).toEqual([
      ['b v2.1.0', 'minor', 'a/b'],
      ['b v2.0.1', 'patch', 'a/b'],
    ]);
  });

  it('adds the first point of the release notes to the title', async () => {
    vi.mocked(fetchJson).mockResolvedValue([
      { ...release, name: 'v2.1.319', tag_name: 'v2.1.319', body: "## What's changed\n\n- Added `/usage` spend" },
    ]);
    expect((await fetchGithubReleases('a/claude-code'))[0]?.title).toBe('claude-code v2.1.319: Added /usage spend');
  });
});

describe('releaseSummary', () => {
  it('takes the first specific heading or list item, as plain text', () => {
    expect(releaseSummary('## 🥟 Run tests with [Bun](https://bun.com)\n- other')).toBe('🥟 Run tests with Bun');
    expect(releaseSummary('### Notable Changes\n#### V8 15.6\n')).toBe('V8 15.6');
    expect(releaseSummary('Intro text\n* **Fixed** a crash')).toBe('Fixed a crash');
  });

  it('shortens a long point and gives up on notes with neither', () => {
    expect(releaseSummary(`- ${'x'.repeat(200)}`)).toBe(`${'x'.repeat(89)}…`);
    expect(releaseSummary('Just a paragraph.')).toBeUndefined();
    expect(releaseSummary(null)).toBeUndefined();
  });
});

describe('classifyRelease', () => {
  it('tells major, minor and patch apart from the version', () => {
    expect(classifyRelease('v27.0.0')).toBe('major');
    expect(classifyRelease('v27.0')).toBe('major');
    expect(classifyRelease('v1.65.0')).toBe('minor');
    expect(classifyRelease('nvim-0.11.5')).toBe('patch');
    expect(classifyRelease('nightly')).toBe('other');
  });
});
