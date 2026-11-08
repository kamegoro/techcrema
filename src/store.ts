/** Plain JSON files; on GitHub Actions the directory is carried over between runs in the cache */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SeenEntry } from './rank.ts';
import type { Feed } from './types.ts';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const dataDir = () => process.env.TECH_CATCHUP_DATA_DIR ?? path.join(ROOT, 'data');

const FEED_FILE = 'feed.json';
const SEEN_FILE = 'seen.json';
const SCORES_DIR = 'scores';
/** How many days of scores the popularity percentile is computed over */
export const SCORE_WINDOW_DAYS = 14;
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

export function loadFeed(): Promise<Feed | null> {
  return readJson<Feed | null>(path.join(dataDir(), FEED_FILE), null);
}

export function saveFeed(feed: Feed): Promise<void> {
  return writeJson(path.join(dataDir(), FEED_FILE), feed);
}

export type ScoreSnapshot = Record<string, number[]>;

/** Scores from the last SCORE_WINDOW_DAYS days, grouped by source (today excluded) */
export async function loadScoreWindow(today: string): Promise<ScoreSnapshot> {
  const dir = path.join(dataDir(), SCORES_DIR);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return {};
  }
  const cutoff = shiftDate(today, -SCORE_WINDOW_DAYS);
  const merged: ScoreSnapshot = {};
  for (const f of files) {
    const date = f.replace(/\.json$/, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date === today) continue;
    if (date < cutoff) {
      await rm(path.join(dir, f), { force: true });
      continue;
    }
    const snap = await readJson<ScoreSnapshot>(path.join(dir, f), {});
    for (const [source, scores] of Object.entries(snap)) {
      merged[source] = [...(merged[source] ?? []), ...scores];
    }
  }
  return merged;
}

/** Saves today's scores. Running collect again the same day overwrites them with the latest values. */
export function saveScoreSnapshot(today: string, snapshot: ScoreSnapshot): Promise<void> {
  return writeJson(path.join(dataDir(), SCORES_DIR, `${today}.json`), snapshot);
}

export async function loadSeen(today: string): Promise<Record<string, SeenEntry>> {
  const seen = await readJson<Record<string, SeenEntry>>(path.join(dataDir(), SEEN_FILE), {});
  const cutoff = shiftDate(today, -SEEN_RETENTION_DAYS);
  return Object.fromEntries(Object.entries(seen).filter(([, v]) => v.date >= cutoff));
}

export function saveSeen(seen: Record<string, SeenEntry>): Promise<void> {
  return writeJson(path.join(dataDir(), SEEN_FILE), seen);
}

/** 'YYYY-MM-DD' in the process time zone (set from the `timezone` option) */
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return localDate(new Date(y, m - 1, d + days));
}
