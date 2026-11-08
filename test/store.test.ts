import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dataDir,
  loadFeed,
  loadScoreWindow,
  loadSeen,
  localDate,
  ROOT,
  saveFeed,
  saveScoreSnapshot,
  saveSeen,
  shiftDate,
} from '../src/store.ts';
import type { Feed } from '../src/types.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tc-store-'));
  vi.stubEnv('TECHCREMA_DATA_DIR', dir);
});

describe('dataDir', () => {
  it('defaults to data/ in the project', () => {
    vi.stubEnv('TECHCREMA_DATA_DIR', undefined);
    expect(dataDir()).toBe(path.join(ROOT, 'data'));
  });
});

describe('feed', () => {
  it('is null before the first save, then round-trips', async () => {
    expect(await loadFeed()).toBeNull();
    const feed = { date: '2026-11-08' } as Feed;
    await saveFeed(feed);
    expect(await loadFeed()).toEqual(feed);
    expect(await readdir(dir)).toEqual(['feed.json']);
  });

  it('reports a damaged file instead of treating it as empty', async () => {
    await writeFile(path.join(dir, 'feed.json'), '{ broken');
    await expect(loadFeed()).rejects.toThrow(SyntaxError);
  });
});

describe('score window', () => {
  it('is empty when nothing was saved yet', async () => {
    expect(await loadScoreWindow('2026-11-08')).toEqual({});
  });

  it('merges the last 14 days without today, and deletes older files', async () => {
    await saveScoreSnapshot('2026-11-08', { hackernews: [999] });
    await saveScoreSnapshot('2026-11-07', { hackernews: [1, 2] });
    await saveScoreSnapshot('2026-10-25', { hackernews: [3], zenn: [4] });
    await saveScoreSnapshot('2026-10-24', { hackernews: [5] });
    await writeFile(path.join(dir, 'scores', 'notes.txt'), 'not a snapshot');

    expect(await loadScoreWindow('2026-11-08')).toEqual({ hackernews: [3, 1, 2], zenn: [4] });
    expect((await readdir(path.join(dir, 'scores'))).sort()).toEqual([
      '2026-10-25.json',
      '2026-11-07.json',
      '2026-11-08.json',
      'notes.txt',
    ]);
  });
});

describe('seen stories', () => {
  it('forgets entries older than 30 days', async () => {
    await saveSeen({ recent: { date: '2026-10-09', pop: 0.5 }, old: { date: '2026-10-08', pop: 0.9 } });
    expect(await loadSeen('2026-11-08')).toEqual({ recent: { date: '2026-10-09', pop: 0.5 } });
  });

  it('is empty before the first save', async () => {
    await mkdir(dir, { recursive: true });
    expect(await loadSeen('2026-11-08')).toEqual({});
  });
});

describe('dates', () => {
  it('formats in the process time zone and shifts across months', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
