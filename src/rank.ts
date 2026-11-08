/**
 * 並べ方のロジック。I/Oを持たない純粋関数だけを置く(テスト対象)。
 *
 * 考え方:
 * - 人気度(pop): 「そのプラットフォームの直近の記事の中で上から何%か」。
 *   HNの300ptとはてブの300usersのように単位の違う数字を同じ物差しにする。
 * - 関心度(interest): interests.yaml のキーワードに当たったトピックの重みの最大。
 * - この2つを混ぜずに、組み合わせでセクションに振り分ける。
 */
import type { InterestConfig, LayoutConfig, Section, SourceId, Story } from './types.ts';

// ---------------------------------------------------------------------------
// 人気度
// ---------------------------------------------------------------------------

/**
 * window の中で score が上から何%に位置するか(0〜1)。同点は半分ずつ数える。
 * 例: 60件中の1位 → (59 + 0.5) / 60 ≒ 0.99
 */
export function percentile(score: number, window: readonly number[]): number {
  if (window.length === 0) return 0.5;
  let less = 0;
  let equal = 0;
  for (const v of window) {
    if (v < score) less++;
    else if (v === score) equal++;
  }
  if (equal === 0) {
    // window に自分自身が含まれていない場合も破綻しないように、自分を1件として足す
    return (less + 0.5) / (window.length + 1);
  }
  return (less + equal / 2) / window.length;
}

const MULTI_PLATFORM_BONUS = 0.05;

/** 各プラットフォームのパーセンタイルの最大 + 複数プラットフォームに出ている分のボーナス */
export function popularity(story: Pick<Story, 'appearances'>): number {
  const ranked = story.appearances.filter((a) => a.percentile !== null);
  if (ranked.length === 0) return 0;
  const best = Math.max(...ranked.map((a) => a.percentile as number));
  return Math.min(1, best + MULTI_PLATFORM_BONUS * (ranked.length - 1));
}

// ---------------------------------------------------------------------------
// 関心度・ミュート
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * キーワード照合関数を作る。
 * 英数字のみのキーワードは単語単位("go" は "google" に当たらない)、
 * 日本語を含むキーワードは部分一致。大文字小文字は区別しない。
 */
export function keywordMatcher(keyword: string): (text: string) => boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return () => false;
  if (/^[\x00-\x7f]+$/.test(k)) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(k)}(?![a-z0-9])`, 'i');
    return (text) => re.test(text);
  }
  return (text) => text.toLowerCase().includes(k);
}

function storyText(story: Pick<Story, 'title' | 'tags'>): string {
  return `${story.title} ${story.tags.join(' ')}`;
}

export interface InterestResult {
  interest: number;
  topics: string[];
  matchedKeywords: string[];
}

export function scoreInterest(story: Pick<Story, 'title' | 'tags'>, config: InterestConfig): InterestResult {
  const text = storyText(story);
  let interest = 0;
  const topics: string[] = [];
  const matchedKeywords: string[] = [];
  for (const [name, topic] of Object.entries(config.topics)) {
    const hits = topic.keywords.filter((k) => keywordMatcher(k)(text));
    if (hits.length === 0) continue;
    topics.push(name);
    matchedKeywords.push(...hits);
    interest = Math.max(interest, topic.weight);
  }
  return { interest, topics, matchedKeywords: [...new Set(matchedKeywords)] };
}

export function isMuted(
  story: Pick<Story, 'title' | 'tags' | 'domain'>,
  mute: { keywords: string[]; domains: string[] },
): boolean {
  const domain = story.domain.toLowerCase();
  if (mute.domains.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`))) {
    return true;
  }
  const text = storyText(story);
  return mute.keywords.some((k) => keywordMatcher(k)(text));
}

// ---------------------------------------------------------------------------
// 日付シード付き乱数(同じ日に何度開いても同じ並びになる)
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

// ---------------------------------------------------------------------------
// セクション組み立て
// ---------------------------------------------------------------------------

const OFFICIAL_SOURCES: ReadonlySet<SourceId> = new Set(['official', 'github_release']);
const RESURFACE_DELTA = 0.1;
const PLATFORM_FRESH_DAYS = 4;

export interface SeenEntry {
  date: string;
  pop: number;
}

export interface BuildInput {
  stories: Story[];
  layout: LayoutConfig;
  /** 'YYYY-MM-DD'(ローカル日付) */
  today: string;
  now: Date;
  /** 前日までに表示した記事 */
  seen: Record<string, SeenEntry>;
}

/** パーセンタイルが最も高いプラットフォーム(セクション内の偏り制限に使う) */
export function primarySource(story: Story): SourceId {
  let best = story.appearances[0]!;
  for (const a of story.appearances) {
    if ((a.percentile ?? -1) > (best.percentile ?? -1)) best = a;
  }
  return best.source;
}

function isOfficial(story: Story): boolean {
  return story.appearances.every((a) => OFFICIAL_SOURCES.has(a.source));
}

function isRepoOnly(story: Story): boolean {
  return story.appearances.every((a) => a.source === 'github_new_repos');
}

function ageDays(story: Story, now: Date): number {
  if (!story.publishedAt) return 0;
  return (now.getTime() - Date.parse(story.publishedAt)) / 86_400_000;
}

/**
 * 上から順に取りつつ、1つのプラットフォームが max 件を超えないようにする。
 * 最初に mustInclude 条件を満たすものを quota 件まで確保する(日本語の最低件数など)。
 */
export function pickWithCaps(
  ranked: readonly Story[],
  limit: number,
  maxRatio: number,
  quota?: { count: number; test: (s: Story) => boolean },
): Story[] {
  const maxPerSource = Math.max(1, Math.ceil(limit * maxRatio));
  const counts = new Map<SourceId, number>();
  const picked: Story[] = [];
  const tryPick = (s: Story): boolean => {
    if (picked.length >= limit || picked.includes(s)) return false;
    const src = primarySource(s);
    const n = counts.get(src) ?? 0;
    if (n >= maxPerSource) return false;
    counts.set(src, n + 1);
    picked.push(s);
    return true;
  };
  if (quota) {
    let got = 0;
    for (const s of ranked) {
      if (got >= quota.count) break;
      if (quota.test(s) && tryPick(s)) got++;
    }
  }
  for (const s of ranked) tryPick(s);
  // 元の順位に並べ直す
  return ranked.filter((s) => picked.includes(s));
}

/** 公式枠: 同じ発信元の新着は最新1件にまとめ、「ほかN件」を付ける */
export function groupOfficial(stories: readonly Story[]): Story[] {
  const sorted = [...stories].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const byPublisher = new Map<string, Story>();
  for (const s of sorted) {
    const key = s.publisher ?? s.domain;
    const head = byPublisher.get(key);
    if (!head) {
      byPublisher.set(key, { ...s, groupedCount: 0 });
    } else {
      head.groupedCount = (head.groupedCount ?? 0) + 1;
    }
  }
  return [...byPublisher.values()];
}

export function buildSections(input: BuildInput): Section[] {
  const { layout, today, now, seen } = input;

  // 前日以前に出した記事は除く。ただし人気度が大きく伸びたものは「再浮上」として1度だけ戻す。
  const visible: Story[] = [];
  for (const s of input.stories) {
    const prev = seen[s.key];
    if (!prev || prev.date === today) {
      visible.push(s);
    } else if (!isOfficial(s) && s.pop - prev.pop >= RESURFACE_DELTA) {
      visible.push({ ...s, resurfaced: true });
    }
  }

  const official = groupOfficial(
    visible.filter((s) => isOfficial(s) && ageDays(s, now) <= layout.official_days),
  );

  const platform = visible.filter(
    (s) => !isOfficial(s) && !isRepoOnly(s) && ageDays(s, now) <= PLATFORM_FRESH_DAYS,
  );
  const byPop = (a: Story, b: Story) => b.pop - a.pop || b.interest - a.interest || a.key.localeCompare(b.key);

  const forYou = pickWithCaps(
    platform.filter((s) => s.interest > 0).sort(byPop),
    layout.for_you,
    layout.max_source_ratio,
    { count: layout.for_you_min_japanese, test: (s) => s.lang === 'ja' },
  );

  const trending = pickWithCaps(
    platform.filter((s) => s.interest === 0 && s.pop >= 0.97).sort(byPop),
    layout.trending,
    layout.max_source_ratio,
  );

  const discoverPool = platform
    .filter((s) => s.interest === 0 && s.pop >= 0.85 && !trending.includes(s))
    .sort((a, b) => a.key.localeCompare(b.key));
  const discover = seededShuffle(discoverPool, today).slice(0, layout.discover);

  const repos = visible
    .filter((s) => isRepoOnly(s))
    .sort((a, b) => Number(b.interest > 0) - Number(a.interest > 0) || byPop(a, b))
    .slice(0, layout.repos);

  return [
    {
      id: 'official',
      title: '公式',
      description: `公式ブログとリリース(${layout.official_days}日以内の新着)`,
      stories: official,
    },
    {
      id: 'forYou',
      title: 'あなた向け',
      description: '関心に合う記事を人気順に',
      stories: forYou,
    },
    {
      id: 'trending',
      title: '話題',
      description: '関心外だが各プラットフォームで上位3%',
      stories: trending,
    },
    {
      id: 'discover',
      title: '発見',
      description: '関心外から日替わりで',
      stories: discover,
    },
    {
      id: 'repos',
      title: '新しいリポジトリ',
      description: '直近7日に作られ、スターを集めているもの',
      stories: repos,
    },
  ];
}
