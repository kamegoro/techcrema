/** fetch → merge by URL → popularity & interest → sections → feed.json */
import { appendFile } from 'node:fs/promises';
import { type Config, loadConfig, type PlatformId } from './config.ts';
import { mergeIntoStories } from './normalize.ts';
import { buildSections, isMuted, percentile, popularity, scoreInterest } from './rank.ts';
import { fetchGithubReleases, fetchOfficialFeed } from './sources/official.ts';
import {
  fetchDevto,
  fetchGithubNewRepos,
  fetchHackerNews,
  fetchHatena,
  fetchHuggingFace,
  fetchLobsters,
  fetchQiita,
  fetchZenn,
} from './sources/platforms.ts';
import { dataDir, loadScoreWindow, loadSeen, localDate, saveFeed, saveScoreSnapshot, saveSeen } from './store.ts';
import type { Feed, RawItem } from './types.ts';

/** Extra stories per section so that mutes applied in the browser can be backfilled */
const SPARE_PER_SECTION = 10;

const PLATFORM_FETCHERS: Record<PlatformId, (now: Date) => Promise<RawItem[]>> = {
  hackernews: fetchHackerNews,
  lobsters: fetchLobsters,
  devto: fetchDevto,
  huggingface: fetchHuggingFace,
  github: fetchGithubNewRepos,
  hatena: fetchHatena,
  zenn: fetchZenn,
  qiita: fetchQiita,
};

interface Job {
  label: string;
  run: () => Promise<RawItem[]>;
}

function buildJobs(config: Config, now: Date): Job[] {
  return [
    ...config.sources.map((id) => ({ label: id, run: () => PLATFORM_FETCHERS[id](now) })),
    ...config.official.feeds.map((f) => ({ label: f.name ?? f.url, run: () => fetchOfficialFeed(f.name, f.url) })),
    ...config.official.releases.map((repo) => ({ label: repo, run: () => fetchGithubReleases(repo) })),
  ];
}

export async function collect(
  config: Config,
  log: (msg: string) => void = () => undefined,
  counts: Record<string, number> = {},
): Promise<Feed> {
  const now = new Date();
  const today = localDate(now);
  const [seen, history] = await Promise.all([loadSeen(today), loadScoreWindow(today)]);

  // One failing source must not stop the others
  const errors: Feed['errors'] = [];
  const results = await Promise.all(
    buildJobs(config, now).map(async (job) => {
      try {
        const items = await job.run();
        counts[job.label] = items.length;
        log(`  ✓ ${job.label}: ${items.length}`);
        return items;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`  ✗ ${job.label}: ${message}`);
        errors.push({ source: job.label, message });
        return [];
      }
    }),
  );
  const items = results.flat();

  const windows = new Map<string, number[]>();
  for (const item of items) {
    if (item.score !== null) windows.set(item.source, [...(windows.get(item.source) ?? []), item.score]);
  }
  await saveScoreSnapshot(today, Object.fromEntries(windows));
  for (const [source, scores] of Object.entries(history)) {
    windows.set(source, [...scores, ...(windows.get(source) ?? [])]);
  }

  // Mutes added on the page live in the browser and are applied there
  const stories = mergeIntoStories(items, (item) =>
    item.score === null ? null : percentile(item.score, windows.get(item.source)),
  )
    .map((s) => ({ ...s, pop: popularity(s), ...scoreInterest(s, config) }))
    .filter((s) => !isMuted(s, config.mute));

  const sections = buildSections({
    stories,
    layout: config.layout,
    language: config.language,
    today,
    now,
    seen,
    spare: SPARE_PER_SECTION,
  });

  // Spares are usually not shown, so only the visible stories count as seen
  for (const section of sections) {
    for (const s of section.stories.slice(0, section.limit)) seen[s.key] = { date: today, pop: s.pop };
  }
  await saveSeen(seen);

  const feed: Feed = {
    generatedAt: now.toISOString(),
    date: today,
    language: config.language,
    title: config.title,
    officialDays: config.layout.official_days,
    sections,
    errors,
  };
  await saveFeed(feed);
  return feed;
}

/** Markdown for the Actions run page: what was fetched, what each section got, which topics matched */
export function summarize(config: Config, feed: Feed, counts: Record<string, number>): string {
  const visible = feed.sections.map((s) => ({ ...s, stories: s.stories.slice(0, s.limit) }));
  const topicHits = new Map<string, number>(Object.keys(config.topics).map((t) => [t, 0]));
  for (const s of visible.flatMap((sec) => sec.stories)) {
    for (const t of s.topics) {
      const hits = topicHits.get(t);
      if (hits !== undefined) topicHits.set(t, hits + 1);
    }
  }
  const lines = [
    `## ☕ TechCrema — ${feed.date}`,
    '',
    `Language \`${config.language}\`, time zone \`${config.timezone}\``,
    '',
    '| Section | Shown | Spare |',
    '|---|---:|---:|',
    ...feed.sections.map(
      (s) => `| ${s.id} | ${Math.min(s.limit, s.stories.length)} | ${Math.max(0, s.stories.length - s.limit)} |`,
    ),
    '',
    '| Source | Items |',
    '|---|---:|',
    ...Object.entries(counts).map(([label, n]) => `| ${label} | ${n} |`),
    ...feed.errors.map((e) => `| ❌ ${e.source} | ${e.message.replace(/\|/g, '\\|')} |`),
  ];
  if (topicHits.size > 0) {
    lines.push(
      '',
      "| Topic | Stories on today's page |",
      '|---|---:|',
      ...[...topicHits].map(([t, n]) => `| ${t} | ${n} |`),
    );
    const unused = [...topicHits].filter(([, n]) => n === 0).map(([t]) => t);
    if (unused.length)
      lines.push(
        '',
        `> Topics with no stories today: ${unused.join(', ')}. That is normal on quiet days; if it keeps happening, try broader keywords.`,
      );
  } else {
    lines.push('', '> No `topics` configured, so "For you" is empty. Add a few to personalize the page.');
  }
  return `${lines.join('\n')}\n`;
}

/** The `collect` command. Returns the exit code. */
export async function runCollect(env: NodeJS.ProcessEnv, log: (message: string) => void): Promise<number> {
  const config = await loadConfig(env);
  // "Today" follows the configured time zone, not the machine's
  env.TZ = config.timezone;
  const topics = Object.keys(config.topics);
  log(`Collecting (${config.language}, ${config.timezone}; topics: ${topics.join(', ') || 'none'})…`);
  const counts: Record<string, number> = {};
  const feed = await collect(config, log, counts);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summarize(config, feed, counts));
  log(`\n${feed.date}: wrote ${dataDir()}/feed.json`);
  for (const s of feed.sections) {
    log(`  ${s.id}: ${Math.min(s.limit, s.stories.length)} (+${Math.max(0, s.stories.length - s.limit)} spare)`);
  }
  if (feed.errors.length) log(`  failed: ${feed.errors.map((e) => e.source).join(', ')}`);
  if (topics.length === 0) log('\nTip: add `topics` or `presets` to get a personalized "For you" section.');
  // The scheduled smoke test sets this to fail loudly when a source breaks
  return env.TECHCREMA_STRICT === '1' && feed.errors.length > 0 ? 1 : 0;
}
