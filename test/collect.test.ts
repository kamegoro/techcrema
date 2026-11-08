import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, runCollect, summarize } from '../src/collect.ts';
import { resolveConfig } from '../src/config.ts';
import { fetchGithubReleases, fetchOfficialFeed } from '../src/sources/official.ts';
import { fetchHackerNews, fetchLobsters } from '../src/sources/platforms.ts';
import { loadFeed, loadScoreWindow, loadSeen, saveScoreSnapshot, saveSeen } from '../src/store.ts';
import type { Feed, RawItem, Story } from '../src/types.ts';

vi.mock('../src/sources/platforms.ts', () => {
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
  };
});
vi.mock('../src/sources/official.ts', () => ({ fetchOfficialFeed: vi.fn(), fetchGithubReleases: vi.fn() }));

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
  tmp = await mkdtemp(path.join(tmpdir(), 'tc-collect-'));
  vi.stubEnv('TECHCREMA_DATA_DIR', path.join(tmp, 'data'));
  vi.stubEnv('TZ', 'UTC');
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.mocked(fetchHackerNews).mockResolvedValue([
    item({ title: 'Rust 2.0 released', url: 'https://a.dev/rust', score: 500 }),
    item({ title: 'Something else', url: 'https://b.dev/else', score: 50 }),
  ]);
  vi.mocked(fetchLobsters).mockRejectedValue(new Error('HTTP 503'));
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
    const counts: Record<string, number> = {};
    const log = vi.fn();
    const feed = await collect(config(), log, counts);
    expect(counts).toEqual({ hackernews: 2, 'https://nodejs.org/feed.xml': 1, 'Node.js': 1 });
    expect(feed.errors).toEqual([
      { source: 'lobsters', message: 'HTTP 503' },
      { source: 'nodejs/node', message: 'rate limited' },
    ]);
    expect(log).toHaveBeenCalledWith('  ✗ lobsters: HTTP 503');
  });

  it('ranks, applies mutes from the settings and writes the feed', async () => {
    const feed = await collect(config());
    const byId = Object.fromEntries(feed.sections.map((s) => [s.id, s.stories.map((st) => st.title)]));
    expect(byId.forYou).toEqual(['Rust 2.0 released']);
    expect(byId.official).toEqual(['Node.js 26.1']);
    expect(JSON.stringify(feed)).not.toContain('Something else');
    expect(feed).toMatchObject({ date: TODAY, language: 'en', title: 'TechCrema', officialDays: 3 });
    expect(await loadFeed()).toEqual(feed);
  });

  it("saves today's scores and compares them with earlier days", async () => {
    await saveScoreSnapshot('2026-11-07', { hackernews: [1000, 2000], lobsters: [10] });
    const feed = await collect(config());
    const rust = feed.sections.flatMap((s) => s.stories).find((s) => s.title === 'Rust 2.0 released');
    // 500 among [1000, 2000, 500, 50]: one lower, itself counted half → (1 + 0.5) / 4
    expect(rust?.appearances[0]?.percentile).toBe(0.375);
    expect(await loadScoreWindow('2026-11-09')).toEqual({ hackernews: [1000, 2000, 500, 50], lobsters: [10] });
  });

  it('remembers what was shown so it is not repeated tomorrow', async () => {
    await saveSeen({ older: { date: '2026-11-01', pop: 0.2 } });
    await collect(config());
    expect(Object.keys(await loadSeen(TODAY)).sort()).toEqual(['a.dev/rust', 'nodejs.org/26.1', 'older']);
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
    expect(e.TZ).toBe('Asia/Tokyo');
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
    sections: [{ id: 'forYou', limit: 1, stories: [story('a', ['rust']), story('b', ['go'])] }],
    errors: [{ source: 'lobsters', message: 'HTTP 503 | down' }],
  };

  it('reports sections, sources, failures and topics without matches', () => {
    const config = resolveConfig({ topics: { rust: ['rust'], go: ['go'] } }, {});
    const md = summarize(config, feed, { hackernews: 30 });
    expect(md).toMatch(/\| forYou \| 1 \| 1 \|/);
    expect(md).toMatch(/\| hackernews \| 30 \|/);
    expect(md).toMatch(/\| ❌ lobsters \| HTTP 503 \\\| down \|/);
    expect(md).toMatch(/\| rust \| 1 \|/);
    // "go" only appears in a spare story, which is not on the page
    expect(md).toMatch(/Topics with no stories today: go\./);
  });

  it('suggests adding topics when there are none', () => {
    expect(summarize(resolveConfig({}, {}), feed, {})).toMatch(/No `topics` configured/);
  });
});
