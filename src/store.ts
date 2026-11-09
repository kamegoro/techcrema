/** Plain JSON files; on GitHub Actions the directory is carried over between runs in the cache */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { shiftDate } from './dates.ts';
import type { Feed, ScoreSnapshot, SeenEntry } from './types.ts';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const dataDir = () => process.env.TECHCREMA_DATA_DIR ?? path.join(ROOT, 'data');

const FEED_FILE = 'feed.json';
const SEEN_FILE = 'seen.json';
const SCORES_DIR = 'scores';
/** How many days of scores the popularity percentile is computed over */
const SCORE_WINDOW_DAYS = 14;
const SEEN_RETENTION_DAYS = 30;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Writes to a temporary file and renames it, so readers never see a half-written file */
async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}

export const feedPath = () => path.join(dataDir(), FEED_FILE);

export function loadFeed(): Promise<Feed | null> {
  return readJson<Feed | null>(feedPath(), null);
}

export function saveFeed(feed: Feed): Promise<void> {
  return writeJson(feedPath(), feed);
}

/** Dates (YYYY-MM-DD) of the saved score snapshots */
async function snapshotDates(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.map((f) => f.replace(/\.json$/, '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** Scores from the last SCORE_WINDOW_DAYS days, grouped by source (today excluded) */
export async function loadScoreWindow(today: string): Promise<ScoreSnapshot> {
  const dir = path.join(dataDir(), SCORES_DIR);
  const cutoff = shiftDate(today, -SCORE_WINDOW_DAYS);
  const merged: ScoreSnapshot = {};
  for (const date of await snapshotDates(dir)) {
    if (date === today || date < cutoff) continue;
    const snap = await readJson<ScoreSnapshot>(path.join(dir, `${date}.json`), {});
    for (const [source, scores] of Object.entries(snap)) {
      merged[source] ??= [];
      merged[source].push(...scores);
    }
  }
  return merged;
}

/**
 * Saves today's scores and deletes snapshots that fell out of the window.
 * Running collect again the same day overwrites them with the latest values.
 */
export async function saveScoreSnapshot(today: string, snapshot: ScoreSnapshot): Promise<void> {
  const dir = path.join(dataDir(), SCORES_DIR);
  const cutoff = shiftDate(today, -SCORE_WINDOW_DAYS);
  for (const date of await snapshotDates(dir)) {
    if (date < cutoff) await rm(path.join(dir, `${date}.json`), { force: true });
  }
  await writeJson(path.join(dir, `${today}.json`), snapshot);
}

export async function loadSeen(today: string): Promise<Record<string, SeenEntry>> {
  const seen = await readJson<Record<string, SeenEntry>>(path.join(dataDir(), SEEN_FILE), {});
  const cutoff = shiftDate(today, -SEEN_RETENTION_DAYS);
  return Object.fromEntries(Object.entries(seen).filter(([, v]) => v.date >= cutoff));
}

export function saveSeen(seen: Record<string, SeenEntry>): Promise<void> {
  return writeJson(path.join(dataDir(), SEEN_FILE), seen);
}
