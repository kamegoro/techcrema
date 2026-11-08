/** data/ 以下の読み書き。すべてローカルのJSONファイル。 */
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SeenEntry } from './rank.ts';
import type { Feed, InterestConfig, SourcesConfig, UserState } from './types.ts';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = process.env.TECH_CATCHUP_DATA_DIR ?? path.join(ROOT, 'data');
const CONFIG_DIR = path.join(ROOT, 'config');

const FEED_FILE = 'feed.json';
const SEEN_FILE = 'seen.json';
const STATE_FILE = 'state.json';
const SCORES_DIR = 'scores';
/** 人気度のパーセンタイルを計算する期間 */
export const SCORE_WINDOW_DAYS = 14;
/** seen.json に残す期間 */
const SEEN_RETENTION_DAYS = 30;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** 書きかけのファイルを読まれないよう、一時ファイルに書いてから置き換える */
async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}

export async function loadInterests(): Promise<InterestConfig> {
  const raw = parseYaml(await readFile(path.join(CONFIG_DIR, 'interests.yaml'), 'utf8')) as Partial<InterestConfig>;
  return {
    topics: raw.topics ?? {},
    mute: { keywords: raw.mute?.keywords ?? [], domains: raw.mute?.domains ?? [] },
  };
}

export async function loadSources(): Promise<SourcesConfig> {
  return parseYaml(await readFile(path.join(CONFIG_DIR, 'sources.yaml'), 'utf8')) as SourcesConfig;
}

// --- フィード ---
export function loadFeed(): Promise<Feed | null> {
  return readJson<Feed | null>(path.join(DATA_DIR, FEED_FILE), null);
}

export function saveFeed(feed: Feed): Promise<void> {
  return writeJson(path.join(DATA_DIR, FEED_FILE), feed);
}

// --- 人気度の履歴(パーセンタイル計算用) ---
export type ScoreSnapshot = Record<string, number[]>;

/** 直近 SCORE_WINDOW_DAYS 日分のスコアをソースごとにまとめて返す(今日の分は含めない) */
export async function loadScoreWindow(today: string): Promise<ScoreSnapshot> {
  const dir = path.join(DATA_DIR, SCORES_DIR);
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
      await unlink(path.join(dir, f)).catch(() => undefined);
      continue;
    }
    const snap = await readJson<ScoreSnapshot>(path.join(dir, f), {});
    for (const [source, scores] of Object.entries(snap)) {
      (merged[source] ??= []).push(...scores);
    }
  }
  return merged;
}

/** 今日のスコアを保存する。1日に何度collectしても、その日の最新の値で上書きする。 */
export function saveScoreSnapshot(today: string, snapshot: ScoreSnapshot): Promise<void> {
  return writeJson(path.join(DATA_DIR, SCORES_DIR, `${today}.json`), snapshot);
}

// --- 表示済み記事 ---
export async function loadSeen(today: string): Promise<Record<string, SeenEntry>> {
  const seen = await readJson<Record<string, SeenEntry>>(path.join(DATA_DIR, SEEN_FILE), {});
  const cutoff = shiftDate(today, -SEEN_RETENTION_DAYS);
  return Object.fromEntries(Object.entries(seen).filter(([, v]) => v.date >= cutoff));
}

export function saveSeen(seen: Record<string, SeenEntry>): Promise<void> {
  return writeJson(path.join(DATA_DIR, SEEN_FILE), seen);
}

// --- ユーザー操作の状態(👍・既読・あとで読む・ミュート) ---
export function emptyState(): UserState {
  return { liked: {}, read: {}, later: {}, mute: { keywords: [], domains: [] } };
}

export async function loadState(): Promise<UserState> {
  const state = await readJson<Partial<UserState>>(path.join(DATA_DIR, STATE_FILE), {});
  const base = emptyState();
  return {
    liked: state.liked ?? base.liked,
    read: state.read ?? base.read,
    later: state.later ?? base.later,
    mute: {
      keywords: state.mute?.keywords ?? [],
      domains: state.mute?.domains ?? [],
    },
  };
}

export function saveState(state: UserState): Promise<void> {
  return writeJson(path.join(DATA_DIR, STATE_FILE), state);
}

// --- 日付 ---
/** ローカルタイムゾーンでの 'YYYY-MM-DD' */
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
