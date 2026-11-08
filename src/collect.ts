/**
 * 収集の本体: 取得 → URLでまとめる → 人気度・関心度 → セクション分け → data/feed.json
 * `npm run collect` で実行する。GitHub Actions からも定期的に呼ばれる。
 */
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
  loadInterests,
  loadScoreWindow,
  loadSeen,
  loadSources,
  localDate,
  saveFeed,
  saveScoreSnapshot,
  saveSeen,
  type ScoreSnapshot,
} from './store.ts';
import type { Feed, RawItem } from './types.ts';

interface Job {
  label: string;
  run: () => Promise<RawItem[]>;
}

function buildJobs(sources: Awaited<ReturnType<typeof loadSources>>, now: Date): Job[] {
  const enabled = (id: string) => sources.platforms[id]?.enabled !== false;
  const platformJobs: [string, () => Promise<RawItem[]>][] = [
    ['hackernews', fetchHackerNews],
    ['hatena', fetchHatena],
    ['zenn', fetchZenn],
    ['qiita', () => fetchQiita(now)],
    ['devto', fetchDevto],
    ['lobsters', fetchLobsters],
    ['huggingface', fetchHuggingFace],
    ['github_new_repos', () => fetchGithubNewRepos(now)],
  ];
  return [
    ...platformJobs.filter(([id]) => enabled(id)).map(([label, run]) => ({ label, run })),
    ...(sources.official_feeds ?? []).map((f) => ({
      label: f.name,
      run: () => fetchOfficialFeed(f.name, f.url),
    })),
    ...(sources.github_releases ?? []).map((repo) => ({
      label: repo,
      run: () => fetchGithubReleases(repo),
    })),
  ];
}

/** ブラウザ側のミュートで減った分を埋めるため、各セクションに足しておく予備の件数 */
const SPARE_PER_SECTION = 10;

export async function collect(log: (msg: string) => void = () => undefined): Promise<Feed> {
  const now = new Date();
  const today = localDate(now);
  const [sources, interests, seen, history] = await Promise.all([
    loadSources(),
    loadInterests(),
    loadSeen(today),
    loadScoreWindow(today),
  ]);

  // 1. 取得(ホストごとに直列・ホスト間は並列。1つ失敗しても他は続ける)
  const errors: Feed['errors'] = [];
  const results = await Promise.all(
    buildJobs(sources, now).map(async (job) => {
      try {
        const items = await job.run();
        log(`  ✓ ${job.label}: ${items.length}件`);
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

  // 2. 今日のスコアを保存し、直近14日分と合わせてパーセンタイルを出す
  const todayScores: ScoreSnapshot = {};
  for (const item of items) {
    if (item.score !== null) (todayScores[item.source] ??= []).push(item.score);
  }
  await saveScoreSnapshot(today, todayScores);
  const windows: ScoreSnapshot = {};
  for (const source of new Set([...Object.keys(history), ...Object.keys(todayScores)])) {
    windows[source] = [...(history[source] ?? []), ...(todayScores[source] ?? [])];
  }

  // 3. 同じURLをまとめ、人気度・関心度を付け、設定ファイルのミュートを除く
  //    (画面から追加したミュートはブラウザに保存されているので、ブラウザ側で除く)
  const stories = mergeIntoStories(items, (item) =>
    item.score === null ? null : percentile(item.score, windows[item.source] ?? []),
  )
    .map((s) => ({ ...s, pop: popularity(s), ...scoreInterest(s, interests) }))
    .filter((s) => !isMuted(s, interests.mute));

  // 4. セクション分け
  const sections = buildSections({ stories, layout: sources.layout, today, now, seen, spare: SPARE_PER_SECTION });

  // 5. 表示した記事を記録(翌日以降は出さない)。予備の記事は表示されないことが多いので記録しない
  for (const section of sections) {
    for (const s of section.stories.slice(0, section.limit)) {
      const prev = seen[s.key];
      if (!prev || prev.date === today || s.resurfaced) seen[s.key] = { date: today, pop: s.pop };
    }
  }
  await saveSeen(seen);

  const feed: Feed = { generatedAt: now.toISOString(), date: today, sections, errors };
  await saveFeed(feed);
  return feed;
}

// `node src/collect.ts` で直接実行されたとき
if (import.meta.main) {
  console.log('収集を開始します…');
  const feed = await collect((m) => console.log(m));
  const total = feed.sections.reduce((n, s) => n + Math.min(s.limit, s.stories.length), 0);
  console.log(`\n${feed.date}: ${total}件を data/feed.json に書き出しました`);
  for (const s of feed.sections) console.log(`  ${s.title}: ${Math.min(s.limit, s.stories.length)}件(予備込み ${s.stories.length}件)`);
  if (feed.errors.length) console.log(`  失敗した情報源: ${feed.errors.map((e) => e.source).join(', ')}`);
}
