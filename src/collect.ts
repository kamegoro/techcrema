/**
 * The pipeline: fetch → merge by URL → popularity & interest → sections → feed.json
 * Run with `npm run collect`; the GitHub Action runs it on a schedule.
 */
import { appendFile } from 'node:fs/promises';
import { loadConfig, type Config, type PlatformId } from './config.ts';
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
import {
  DATA_DIR,
  loadScoreWindow,
  loadSeen,
  localDate,
  saveFeed,
  saveScoreSnapshot,
  saveSeen,
  type ScoreSnapshot,
} from './store.ts';
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
  /** Filled with the number of items each source returned */
  counts: Record<string, number> = {},
): Promise<Feed> {
  const now = new Date();
  const today = localDate(now);
  const [seen, history] = await Promise.all([loadSeen(today), loadScoreWindow(today)]);

  // 1. Fetch. Hosts run in parallel, requests to the same host one at a time; one failure doesn't stop the rest.
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

  // 2. Save today's scores and compute percentiles against the last 14 days plus today
  const todayScores: ScoreSnapshot = {};
  for (const item of items) {
    if (item.score !== null) (todayScores[item.source] ??= []).push(item.score);
  }
  await saveScoreSnapshot(today, todayScores);
  const windows: ScoreSnapshot = {};
  for (const source of new Set([...Object.keys(history), ...Object.keys(todayScores)])) {
    windows[source] = [...(history[source] ?? []), ...(todayScores[source] ?? [])];
  }

  // 3. Merge by URL, score popularity and interest, drop muted stories.
  //    (Mutes added from the page live in the browser and are applied there.)
  const stories = mergeIntoStories(items, (item) =>
    item.score === null ? null : percentile(item.score, windows[item.source] ?? []),
  )
    .map((s) => ({ ...s, pop: popularity(s), ...scoreInterest(s, config) }))
    .filter((s) => !isMuted(s, config.mute));

  // 4. Sections
  const sections = buildSections({
    stories,
    layout: config.layout,
    language: config.language,
    today,
    now,
    seen,
    spare: SPARE_PER_SECTION,
  });

  // 5. Remember what was shown so it isn't repeated on later days. Spares are usually not shown, so skip them.
  for (const section of sections) {
    for (const s of section.stories.slice(0, section.limit)) {
      const prev = seen[s.key];
      if (!prev || prev.date === today || s.resurfaced) seen[s.key] = { date: today, pop: s.pop };
    }
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
    for (const t of s.topics) if (topicHits.has(t)) topicHits.set(t, topicHits.get(t)! + 1);
  }
  const lines = [
    `## ☕ Tech Catchup — ${feed.date}`,
    '',
    `Language \`${config.language}\`, time zone \`${config.timezone}\``,
    '',
    '| Section | Shown | Spare |',
    '|---|---:|---:|',
    ...feed.sections.map((s) => `| ${s.id} | ${Math.min(s.limit, s.stories.length)} | ${Math.max(0, s.stories.length - s.limit)} |`),
    '',
    '| Source | Items |',
    '|---|---:|',
    ...Object.entries(counts).map(([label, n]) => `| ${label} | ${n} |`),
    ...feed.errors.map((e) => `| ❌ ${e.source} | ${e.message.replace(/\|/g, '\\|')} |`),
  ];
  if (topicHits.size > 0) {
    lines.push('', '| Topic | Stories on today\'s page |', '|---|---:|', ...[...topicHits].map(([t, n]) => `| ${t} | ${n} |`));
    const unused = [...topicHits].filter(([, n]) => n === 0).map(([t]) => t);
    if (unused.length) lines.push('', `> Topics with no stories today: ${unused.join(', ')}. That is normal on quiet days; if it keeps happening, try broader keywords.`);
  } else {
    lines.push('', '> No `topics` configured, so "For you" is empty. Add a few to personalize the page.');
  }
  return `${lines.join('\n')}\n`;
}

if (import.meta.main) {
  const config = await loadConfig();
  // "Today" follows the configured time zone, not the machine's
  process.env.TZ = config.timezone;
  const topics = Object.keys(config.topics);
  console.log(`Collecting (${config.language}, ${config.timezone}; topics: ${topics.join(', ') || 'none'})…`);
  const counts: Record<string, number> = {};
  const feed = await collect(config, (m) => console.log(m), counts);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summarize(config, feed, counts));
  console.log(`\n${feed.date}: wrote ${DATA_DIR}/feed.json`);
  for (const s of feed.sections) console.log(`  ${s.id}: ${Math.min(s.limit, s.stories.length)} (+${Math.max(0, s.stories.length - s.limit)} spare)`);
  if (feed.errors.length) console.log(`  failed: ${feed.errors.map((e) => e.source).join(', ')}`);
  if (topics.length === 0) console.log('\nTip: add `topics` to get a personalized "For you" section.');
  // Used by the scheduled smoke test: fail loudly when a source breaks (an API change, for example)
  if (process.env.TECH_CATCHUP_STRICT === '1' && feed.errors.length > 0) process.exit(1);
}
