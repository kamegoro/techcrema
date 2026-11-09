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
  TAG_FETCHERS,
  type TagPlatform,
} from './sources/platforms.ts';
import { dataDir, loadScoreWindow, loadSeen, localDate, saveFeed, saveScoreSnapshot, saveSeen } from './store.ts';
import type { Feed, RawItem, Section } from './types.ts';

/** Extra stories per section, behind "Show more" and for refilling slots freed by mutes in the browser */
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
  /**
   * Whether the scores feed the platform's popularity scale. Tag lookups don't: they would fill it
   * with small numbers and make every front-page story look more popular than it is.
   */
  calibrates: boolean;
}

function tagJobs(config: Config, now: Date): Job[] {
  const tags = [...new Set(Object.values(config.topics).flatMap((t) => t.tags))];
  return config.sources
    .filter((id): id is TagPlatform => Object.hasOwn(TAG_FETCHERS, id))
    .flatMap((id) =>
      tags.map((tag) => ({ label: `${id} #${tag}`, run: () => TAG_FETCHERS[id](tag, now), calibrates: false })),
    );
}

function buildJobs(config: Config, now: Date): Job[] {
  return [
    ...config.sources.map((id) => ({ label: id, run: () => PLATFORM_FETCHERS[id](now), calibrates: true })),
    ...tagJobs(config, now),
    ...config.official.feeds.map((f) => ({
      label: f.name ?? f.url,
      run: () => fetchOfficialFeed(f.name, f.url),
      calibrates: false,
    })),
    ...config.official.releases.map((repo) => ({
      label: repo,
      run: () => fetchGithubReleases(repo),
      calibrates: false,
    })),
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
        return { items, calibrates: job.calibrates };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`  ✗ ${job.label}: ${message}`);
        errors.push({ source: job.label, message });
        return { items: [], calibrates: false };
      }
    }),
  );
  const items = results.flatMap((r) => r.items);

  const windows = new Map<string, number[]>();
  for (const item of results.filter((r) => r.calibrates).flatMap((r) => r.items)) {
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
    topics: Object.keys(config.topics),
    today,
    now,
    seen,
    spare: SPARE_PER_SECTION,
  });

  // Spares are usually not shown, so only the visible stories count as seen
  for (const section of sections) {
    // The first day shown is kept: a story leaves the page the day after that
    for (const s of section.stories.slice(0, section.limit))
      seen[s.key] = { date: seen[s.key]?.date ?? today, pop: s.pop };
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

/** Text from a source's error message, safe inside a Markdown table cell */
const tableCell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ');

/** Markdown for the Actions run page: what each section got and what was fetched */
export function summarize(config: Config, feed: Feed, counts: Record<string, number>): string {
  const shown = (s: Section) => Math.min(s.limit, s.stories.length);
  const lines = [
    `## ☕ TechCrema — ${feed.date}`,
    '',
    `Language \`${config.language}\`, time zone \`${config.timezone}\``,
    '',
    '| Section | Shown | More |',
    '|---|---:|---:|',
    ...feed.sections.map((s) => `| ${s.title ?? s.id} | ${shown(s)} | ${s.stories.length - shown(s)} |`),
    '',
    '| Source | Items |',
    '|---|---:|',
    ...Object.entries(counts).map(([label, n]) => `| ${label} | ${n} |`),
    ...feed.errors.map((e) => `| ❌ ${e.source} | ${tableCell(e.message)} |`),
  ];
  const quiet = feed.sections.filter((s) => s.title !== undefined && s.stories.length === 0).map((s) => s.title);
  if (Object.keys(config.topics).length === 0) {
    lines.push('', '> No `topics` configured, so the page only shows what is popular. Add a few to personalize it.');
  } else if (quiet.length) {
    lines.push(
      '',
      `> Topics with no stories today: ${quiet.join(', ')}. That is normal on quiet days; if it keeps happening, try broader keywords or tags.`,
    );
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
    const shown = Math.min(s.limit, s.stories.length);
    log(`  ${s.title ?? s.id}: ${shown} (+${s.stories.length - shown} more)`);
  }
  if (feed.errors.length) log(`  failed: ${feed.errors.map((e) => e.source).join(', ')}`);
  if (topics.length === 0) log('\nTip: add `topics` or `presets` to get a section for each of your interests.');
  // The scheduled smoke test sets this to fail loudly when a source breaks
  return env.TECHCREMA_STRICT === '1' && feed.errors.length > 0 ? 1 : 0;
}
