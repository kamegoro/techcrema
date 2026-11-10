// Plain JSON files. On GitHub Actions the data directory is carried between runs in the cache.
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Feed, ScoreSnapshot, SeenEntry } from '#src/types.ts';
import { shiftDate } from './dates.ts';
import { ROOT } from './paths.ts';

export const dataDir = () => process.env.TECHCREMA_DATA_DIR ?? path.join(ROOT, 'data');
export const feedPath = () => path.join(dataDir(), 'feed.json');
const seenPath = () => path.join(dataDir(), 'seen.json');
const scoresDir = () => path.join(dataDir(), 'scores');

const SCORE_WINDOW_DAYS = 14;
const SEEN_RETENTION_DAYS = 30;

const isMissing = (err: unknown) => (err as NodeJS.ErrnoException).code === 'ENOENT';

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    if (isMissing(err)) return fallback;
    throw err;
  }
}

// Write then rename, so a reader never sees half a file
async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}

export function loadFeed(): Promise<Feed | null> {
  return readJson<Feed | null>(feedPath(), null);
}

export function saveFeed(feed: Feed): Promise<void> {
  return writeJson(feedPath(), feed);
}

async function snapshotDates(): Promise<string[]> {
  try {
    const files = await readdir(scoresDir());
    return files.map((f) => f.replace(/\.json$/, '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

/** Scores of the days before `today` within the window, grouped by source */
export async function loadScoreWindow(today: string): Promise<ScoreSnapshot> {
  const cutoff = shiftDate(today, -SCORE_WINDOW_DAYS);
  const merged: ScoreSnapshot = {};
  for (const date of await snapshotDates()) {
    if (date === today || date < cutoff) continue;
    const snapshot = await readJson<ScoreSnapshot>(path.join(scoresDir(), `${date}.json`), {});
    for (const [source, scores] of Object.entries(snapshot)) {
      merged[source] ??= [];
      merged[source].push(...scores);
    }
  }
  return merged;
}

/** Saves today's scores (a second run on the same day replaces them) and drops days outside the window */
export async function saveScoreSnapshot(today: string, snapshot: ScoreSnapshot): Promise<void> {
  const cutoff = shiftDate(today, -SCORE_WINDOW_DAYS);
  for (const date of await snapshotDates()) {
    if (date < cutoff) await rm(path.join(scoresDir(), `${date}.json`), { force: true });
  }
  await writeJson(path.join(scoresDir(), `${today}.json`), snapshot);
}

export async function loadSeen(today: string): Promise<Record<string, SeenEntry>> {
  const seen = await readJson<Record<string, SeenEntry>>(seenPath(), {});
  const cutoff = shiftDate(today, -SEEN_RETENTION_DAYS);
  return Object.fromEntries(Object.entries(seen).filter(([, entry]) => entry.date >= cutoff));
}

export function saveSeen(seen: Record<string, SeenEntry>): Promise<void> {
  return writeJson(seenPath(), seen);
}
