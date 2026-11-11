// One run: fetch → merge → score → sections → what people said → feed.json
import { appendFile } from 'node:fs/promises';
import type { Log } from '#src/cli.ts';
import { type Config, loadConfig } from '#src/config/config.ts';
import { localDate } from '#src/lib/dates.ts';
import { ownRepository } from '#src/lib/http.ts';
import { feedPath, loadScoreWindow, loadSeen, saveFeed, saveScoreSnapshot, saveSeen } from '#src/lib/store.ts';
import { interestScorer, muteFilter } from '#src/ranking/matching.ts';
import { mergeIntoStories } from '#src/ranking/merge.ts';
import { percentile, popularity } from '#src/ranking/popularity.ts';
import { buildSections } from '#src/ranking/sections.ts';
import { findVoices } from '#src/sources/voices.ts';
import type { Feed, RawItem, ScoreSnapshot, Section, SeenEntry, Story, Voices } from '#src/types.ts';
import { fetchJobs, runJobs } from './jobs.ts';
import { sectionLabel, shownCount, summarize } from './summary.ts';

/** Extra stories per section, for "Show more" and for refilling places freed by mutes in the browser */
const SPARE_PER_SECTION = 10;

function scoresBySource(items: RawItem[]): ScoreSnapshot {
  const scores: ScoreSnapshot = {};
  for (const item of items) {
    if (item.score === null) continue;
    scores[item.source] ??= [];
    scores[item.source]?.push(item.score);
  }
  return scores;
}

function withHistory(today: ScoreSnapshot, history: ScoreSnapshot): ScoreSnapshot {
  const all: ScoreSnapshot = { ...today };
  for (const [source, scores] of Object.entries(history)) all[source] = [...scores, ...(all[source] ?? [])];
  return all;
}

/** Mutes added on the page live in the browser and are applied there; these are the configured ones */
function rankStories(items: RawItem[], windows: ScoreSnapshot, config: Config): Story[] {
  const interestOf = interestScorer(config);
  const isMuted = muteFilter(config.mute);
  return mergeIntoStories(items, (item) => (item.score === null ? null : percentile(item.score, windows[item.source])))
    .map((story) => ({ ...story, pop: popularity(story), ...interestOf(story) }))
    .filter((story) => !isMuted(story));
}

/** New repos have no discussion to quote */
async function voicesFor(sections: Section[], config: Config): Promise<Map<string, Voices>> {
  const hatena = config.language === 'ja' && config.sources.includes('hatena');
  const shown = sections.filter((s) => s.id !== 'repos').flatMap((s) => s.stories.slice(0, s.limit));
  const found = await Promise.all(
    shown.map(async (story) => [story.key, await findVoices(story, { hatena })] as const),
  );
  return new Map(found.filter((entry): entry is [string, Voices] => entry[1] !== undefined));
}

/** Only the stories a section shows count as seen; a story keeps the day it was first shown */
function markSeen(seen: Record<string, SeenEntry>, sections: Section[], today: string): Record<string, SeenEntry> {
  const updated = { ...seen };
  for (const story of sections.flatMap((s) => s.stories.slice(0, s.limit))) {
    updated[story.key] = { date: seen[story.key]?.date ?? today, pop: story.pop };
  }
  return updated;
}

/** What the page needs: ranking details stay out, what people said goes in */
function forPage({ titleMatch, lookups, ...story }: Story, voices: Voices | undefined): Story {
  return voices ? { ...story, voices } : story;
}

export async function collect(
  config: Config,
  log: Log = () => undefined,
): Promise<{ feed: Feed; counts: Record<string, number> }> {
  const now = new Date();
  const today = localDate(now);
  const [seen, history] = await Promise.all([loadSeen(today), loadScoreWindow(today)]);

  const fetched = await runJobs(fetchJobs(config, now), log);
  const todaysScores = scoresBySource(fetched.calibrating);
  await saveScoreSnapshot(today, todaysScores);

  const stories = rankStories(fetched.items, withHistory(todaysScores, history), config);
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

  const voices = await voicesFor(sections, config);
  log(`  ✓ voices: ${voices.size}`);
  await saveSeen(markSeen(seen, sections, today));

  const feed: Feed = {
    generatedAt: now.toISOString(),
    date: today,
    language: config.language,
    title: config.title,
    officialDays: config.layout.official_days,
    repository: ownRepository(),
    sections: sections.map((s) => ({ ...s, stories: s.stories.map((story) => forPage(story, voices.get(story.key))) })),
    errors: fetched.errors,
  };
  await saveFeed(feed);
  return { feed, counts: fetched.counts };
}

/** The `collect` command; returns the exit code */
export async function runCollect(env: NodeJS.ProcessEnv, log: Log): Promise<number> {
  const config = await loadConfig(env);
  // Date reads the time zone from the process, so "today" follows the configured one
  process.env.TZ = config.timezone;
  const topics = Object.keys(config.topics);
  log(`Collecting (${config.language}, ${config.timezone}; topics: ${topics.join(', ') || 'none'})…`);
  const { feed, counts } = await collect(config, log);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summarize(config, feed, counts));
  log(`\n${feed.date}: wrote ${feedPath()}`);
  for (const s of feed.sections) {
    log(`  ${sectionLabel(s)}: ${shownCount(s)} (+${s.stories.length - shownCount(s)} more)`);
  }
  if (feed.errors.length) log(`  failed: ${feed.errors.map((e) => e.source).join(', ')}`);
  if (topics.length === 0) log('\nTip: add `topics` or `presets` to get a section for each of your interests.');
  // The scheduled smoke test sets this to fail loudly when a source breaks
  return env.TECHCREMA_STRICT === '1' && feed.errors.length > 0 ? 1 : 0;
}
