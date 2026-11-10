import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, runCollect, summarize } from '#src/collect.ts';
import { resolveConfig } from '#src/config.ts';
import { fetchGithubReleases, fetchOfficialFeed } from '#src/sources/official.ts';
import { fetchHackerNews, fetchLobsters, TAG_FETCHERS } from '#src/sources/platforms.ts';
import { findVoices } from '#src/sources/voices.ts';
import { loadFeed, loadScoreWindow, loadSeen, saveScoreSnapshot, saveSeen } from '#src/store.ts';
import type { Feed, RawItem, Story } from '#src/types.ts';
import { tempDir } from './support/temp-dir.ts';

vi.mock('#src/sources/platforms.ts', () => {
  const none = vi.fn(async () => []);
  return {
    fetchHackerNews: vi.fn(),
    fetchLobsters: vi.fn(),
    fetchDevto: none,
    fetchHuggingFace: none,
    fetchGithubNewRepos: none,
    fetchHatena: none,
    fetchZenn: none,
    fetchQiita: none,
    fetchSlides: none,
    TAG_FETCHERS: { zenn: none, qiita: none, devto: none, lobsters: vi.fn() },
  };
});
vi.mock('#src/sources/official.ts', () => ({ fetchOfficialFeed: vi.fn(), fetchGithubReleases: vi.fn() }));
vi.mock('#src/sources/voices.ts', () => ({ findVoices: vi.fn(async () => undefined) }));

const NOW = new Date('2026-11-08T09:00:00Z');
const TODAY = '2026-11-08';

const item = (over: Partial<RawItem>): RawItem => ({
  source: 'hackernews',
  title: 'A story',
  url: 'https://a.dev/story',
  score: 100,
  tags: [],
  publishedAt: '2026-11-08T06:00:00Z',
  ...over,
});

let tmp: string;

beforeEach(async () => {
  tmp = await tempDir('collect');
  vi.stubEnv('TECHCREMA_DATA_DIR', path.join(tmp, 'data'));
  vi.stubEnv('TZ', 'UTC');
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.mocked(fetchHackerNews).mockResolvedValue([
    item({ title: 'Rust 2.0 released', url: 'https://a.dev/rust', score: 500 }),
    item({ title: 'Something else', url: 'https://b.dev/else', score: 50 }),
  ]);
  vi.mocked(fetchLobsters).mockRejectedValue(new Error('HTTP 503'));
  vi.mocked(TAG_FETCHERS.lobsters).mockResolvedValue([
    item({ source: 'lobsters', title: 'Borrow checker notes', url: 'https://c.dev/notes', score: 4, tags: ['rust'] }),
  ]);
  vi.mocked(fetchOfficialFeed).mockResolvedValue([
    item({
      source: 'official',
      score: null,
      title: 'Node.js 26.1',
      url: 'https://nodejs.org/26.1',
      publisher: 'Node.js',
    }),
  ]);
  vi.mocked(fetchGithubReleases).mockRejectedValue('rate limited');
});

describe('collect', () => {
  const config = () =>
    resolveConfig(
      {
        sources: ['hackernews', 'lobsters'],
        topics: { rust: ['rust'] },
        mute: { keywords: ['else'] },
        official: ['https://nodejs.org/feed.xml', 'Node.js https://nodejs.org/feed2.xml', 'nodejs/node'],
      },
      {},
    );

  it('fetches every source, keeps going past failures and reports them', async () => {
    const listed = await fetchHackerNews();
    // An item without a usable link is dropped before it is counted
    vi.mocked(fetchHackerNews).mockResolvedValue([...listed, item({ url: 'javascript:alert(1)' })]);
    const log = vi.fn();
    const { feed, counts } = await collect(config(), log);
    expect(counts).toEqual({ hackernews: 2, 'lobsters #rust': 1, 'https://nodejs.org/feed.xml': 1, 'Node.js': 1 });
    expect(feed.errors).toEqual([
      { source: 'lobsters', message: 'HTTP 503' },
      { source: 'nodejs/node', message: 'rate limited' },
    ]);
    expect(log).toHaveBeenCalledWith('  ✗ lobsters: HTTP 503');
  });

  it('ranks, applies mutes from the settings and writes the feed', async () => {
    const { feed } = await collect(config());
    const byId = Object.fromEntries(feed.sections.map((s) => [s.title ?? s.id, s.stories.map((st) => st.title)]));
    expect(byId.rust).toEqual(['Rust 2.0 released', 'Borrow checker notes']);
    expect(byId.official).toEqual(['Node.js 26.1']);
    expect(JSON.stringify(feed)).not.toContain('Something else');
    expect(feed).toMatchObject({ date: TODAY, language: 'en', title: 'TechCrema', officialDays: 3 });
    expect(await loadFeed()).toEqual(feed);
    // Ranking details stay out of the published feed
    expect(JSON.stringify(feed)).not.toMatch(/titleMatch|lookups/);
  });

  it("saves today's scores and compares them with earlier days", async () => {
    await saveScoreSnapshot('2026-11-07', { hackernews: [1000, 2000], lobsters: [10] });
    const listed = await fetchHackerNews();
    // A story without a score (e.g. a Hatena entry missing its count) stays out of the scale
    vi.mocked(fetchHackerNews).mockResolvedValue([...listed, item({ url: 'https://d.dev/unscored', score: null })]);
    const { feed } = await collect(config());
    const rust = feed.sections.flatMap((s) => s.stories).find((s) => s.title === 'Rust 2.0 released');
    // 500 among [1000, 2000, 500, 50]: one lower, itself counted half → (1 + 0.5) / 4
    expect(rust?.appearances[0]?.percentile).toBe(0.375);
    // Scores from the tag lookup don't go into the scale
    expect(await loadScoreWindow('2026-11-09')).toEqual({ hackernews: [1000, 2000, 500, 50], lobsters: [10] });
  });

  it('adds what people said to the stories on the page, looking on Hatena only for Japanese pages', async () => {
    const voices = {
      source: 'hackernews' as const,
      count: 9,
      url: 'https://news.ycombinator.com/item?id=1',
      comments: [],
    };
    vi.mocked(findVoices).mockImplementation(async (story) =>
      story.title === 'Rust 2.0 released' ? voices : undefined,
    );
    const log = vi.fn();
    const { feed } = await collect(config(), log);
    const stories = feed.sections.flatMap((s) => s.stories);
    expect(stories.find((s) => s.title === 'Rust 2.0 released')?.voices).toEqual(voices);
    expect(stories.find((s) => s.title === 'Node.js 26.1')).not.toHaveProperty('voices');
    expect(log).toHaveBeenCalledWith('  ✓ voices: 1');
    expect(vi.mocked(findVoices).mock.calls.every(([, options]) => options.hatena === false)).toBe(true);

    vi.mocked(findVoices).mockClear();
    await collect(resolveConfig({ language: 'ja', sources: ['hackernews', 'hatena'], topics: { rust: ['rust'] } }, {}));
    expect(vi.mocked(findVoices).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(findVoices).mock.calls.every(([, options]) => options.hatena)).toBe(true);
  });

  it('remembers what was shown so it is not repeated tomorrow', async () => {
    await saveSeen({ older: { date: '2026-11-01', pop: 0.2 } });
    await collect(config());
    expect(Object.keys(await loadSeen(TODAY)).sort()).toEqual([
      'a.dev/rust',
      'c.dev/notes',
      'nodejs.org/26.1',
      'older',
    ]);
  });
});

describe('runCollect', () => {
  const env = (over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    TECHCREMA_CONFIG: path.join(tmp, 'config.yml'),
    ...over,
  });

  beforeEach(async () => {
    await writeFile(path.join(tmp, 'config.yml'), 'sources: [hackernews, lobsters]\ntimezone: Asia/Tokyo\n');
  });

  it('collects with the configured time zone and suggests topics when there are none', async () => {
    const log = vi.fn();
    const e = env();
    expect(await runCollect(e, log)).toBe(0);
    expect(process.env.TZ).toBe('Asia/Tokyo');
    expect(log).toHaveBeenCalledWith('Collecting (en, Asia/Tokyo; topics: none)…');
    expect(log).toHaveBeenCalledWith('  failed: lobsters');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Tip: add `topics`'));
  });

  it('writes the run summary when GitHub provides a file for it', async () => {
    const summary = path.join(tmp, 'summary.md');
    await runCollect(env({ GITHUB_STEP_SUMMARY: summary, TC_TOPICS: 'rust: [rust]' }), vi.fn());
    expect(await readFile(summary, 'utf8')).toContain('| hackernews | 2 |');
  });

  it('fails in strict mode when a source failed, and passes when none did', async () => {
    expect(await runCollect(env({ TECHCREMA_STRICT: '1' }), vi.fn())).toBe(1);
    vi.mocked(fetchLobsters).mockResolvedValue([]);
    const log = vi.fn();
    expect(await runCollect(env({ TECHCREMA_STRICT: '1', TC_TOPICS: 'rust: [rust]' }), log)).toBe(0);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('failed:'));
  });
});

describe('summarize', () => {
  const story = (key: string, topics: string[]) => ({ key, topics }) as unknown as Story;
  const feed: Feed = {
    generatedAt: '2026-11-08T00:00:00Z',
    date: '2026-11-08',
    language: 'en',
    title: 'TechCrema',
    officialDays: 3,
    sections: [
      { id: 'topic-0', title: 'rust', limit: 1, stories: [story('a', ['rust']), story('b', ['rust'])] },
      { id: 'topic-1', title: 'go', limit: 1, stories: [] },
      { id: 'trending', limit: 2, stories: [] },
    ],
    errors: [{ source: 'lobsters', message: 'HTTP 503 | down\\ |\nnext line' }],
  };

  it('reports sections, sources, failures and topics without stories', () => {
    const config = resolveConfig({ topics: { rust: ['rust'], go: ['go'] } }, {});
    const md = summarize(config, feed, { hackernews: 30 });
    expect(md).toMatch(/\| rust \| 1 \| 1 \|/);
    expect(md).toMatch(/\| trending \| 0 \| 0 \|/);
    expect(md).toMatch(/\| hackernews \| 30 \|/);
    // Pipes, backslashes and line breaks from a remote error message can't break out of the table cell
    expect(md).toContain('| ❌ lobsters | HTTP 503 \\| down\\\\ \\| next line |');
    expect(md).toMatch(/Topics with no stories today: go\./);
  });

  it('says nothing about topics when every topic has stories', () => {
    const config = resolveConfig({ topics: { rust: ['rust'] } }, {});
    expect(summarize(config, { ...feed, sections: feed.sections.slice(0, 1) }, {})).not.toMatch(/no stories today/);
  });

  it('suggests adding topics when there are none', () => {
    expect(summarize(resolveConfig({}, {}), feed, {})).toMatch(/No `topics` configured/);
  });
});
