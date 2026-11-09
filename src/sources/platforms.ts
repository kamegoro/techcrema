/** Sources with a popularity signal. Official APIs, RSS and public JSON only; no HTML scraping. */

import { type FeedEntry, parseFeed } from '#src/feed-parser.ts';
import { fetchJson, fetchText, githubHeaders } from '#src/http.ts';
import type { RawItem } from '#src/types.ts';

/** The UTC date `days` before `now`, as YYYY-MM-DD (the form search APIs take) */
function dateDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** "owner/name" → "name" */
export const repoName = (fullName: string) => fullName.slice(fullName.indexOf('/') + 1);

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  created_at: string;
}

export async function fetchHackerNews(): Promise<RawItem[]> {
  const data = await fetchJson<{ hits: HnHit[] }>(
    'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60',
  );
  return data.hits.map((h) => {
    const discussionUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
    return {
      source: 'hackernews',
      title: h.title,
      // Posts without a link (Ask HN etc.) use the discussion page as the article
      url: h.url ?? discussionUrl,
      discussionUrl: h.url ? discussionUrl : undefined,
      score: h.points,
      scoreLabel: 'pt',
      tags: [],
      publishedAt: h.created_at,
    };
  });
}

/** Hatena's own "Technology" category label; every entry in this feed has it, so it's not a useful tag */
const HATENA_TECH_CATEGORY = '\u30c6\u30af\u30ce\u30ed\u30b8\u30fc';

/** Hatena's comment page: /entry/s/ for https articles, /entry/ for http ones */
function hatenaEntryUrl(link: string): string {
  if (link.startsWith('https://')) return `https://b.hatena.ne.jp/entry/s/${link.slice('https://'.length)}`;
  return `https://b.hatena.ne.jp/entry/${link.replace(/^http:\/\//, '')}`;
}

function hatenaItem(e: FeedEntry): RawItem {
  return {
    source: 'hatena',
    title: e.title,
    url: e.link,
    discussionUrl: hatenaEntryUrl(e.link),
    score: e.bookmarkCount,
    scoreLabel: 'users',
    tags: e.categories.filter((c) => c !== HATENA_TECH_CATEGORY),
    publishedAt: e.publishedAt,
  };
}

export async function fetchHatena(): Promise<RawItem[]> {
  return parseFeed(await fetchText('https://b.hatena.ne.jp/hotentry/it.rss')).map(hatenaItem);
}

/** Slide sites whose decks are picked up through Hatena's per-site feed (Speaker Deck's own feeds are closed to crawlers) */
const SLIDE_SITES = ['speakerdeck.com', 'www.docswell.com'];

/** Newest decks on each slide site that Hatena users bookmarked, with their bookmark counts */
export async function fetchSlides(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  for (const site of SLIDE_SITES) {
    const xml = await fetchText(`https://b.hatena.ne.jp/site/${site}/?mode=rss`);
    items.push(...parseFeed(xml).map((e) => ({ ...hatenaItem(e), source: 'slides' as const })));
  }
  return items;
}

interface ZennArticle {
  title: string;
  path: string;
  liked_count: number;
  published_at: string;
  article_type: string;
}

async function zennArticles(query: string): Promise<RawItem[]> {
  const data = await fetchJson<{ articles: ZennArticle[] }>(`https://zenn.dev/api/articles?${query}`);
  return data.articles.map((a) => ({
    source: 'zenn',
    title: a.title,
    url: `https://zenn.dev${a.path}`,
    score: a.liked_count,
    scoreLabel: 'likes',
    tags: a.article_type === 'idea' ? ['idea'] : [],
    publishedAt: a.published_at,
  }));
}

export function fetchZenn(): Promise<RawItem[]> {
  return zennArticles('order=daily&count=60');
}

interface QiitaItem {
  title: string;
  url: string;
  likes_count: number;
  created_at: string;
  tags: { name: string }[];
}

async function searchQiita(query: string, perPage: number): Promise<RawItem[]> {
  const token = process.env.QIITA_TOKEN;
  const items = await fetchJson<QiitaItem[]>(
    `https://qiita.com/api/v2/items?per_page=${perPage}&query=${encodeURIComponent(query)}`,
    token ? { Authorization: `Bearer ${token}` } : {},
  );
  return items.map((i) => ({
    source: 'qiita',
    title: i.title,
    url: i.url,
    score: i.likes_count,
    scoreLabel: 'likes',
    tags: i.tags.map((t) => t.name),
    publishedAt: i.created_at,
  }));
}

export function fetchQiita(now: Date): Promise<RawItem[]> {
  return searchQiita(`created:>${dateDaysAgo(3, now)} stocks:>2`, 100);
}

interface DevtoArticle {
  title: string;
  url: string;
  public_reactions_count: number;
  published_timestamp: string;
  tag_list: string[] | null;
}

/** dev.to's own community threads (challenges, pet photos, site news): popular there, but not tech news */
const DEVTO_COMMUNITY_TAGS = new Set(['devchallenge', 'watercooler', 'community', 'meta']);

async function devtoArticles(url: string): Promise<RawItem[]> {
  const items = await fetchJson<DevtoArticle[]>(url);
  return items
    .filter((a) => !(a.tag_list ?? []).some((t) => DEVTO_COMMUNITY_TAGS.has(t)))
    .map((a) => ({
      source: 'devto',
      title: a.title,
      url: a.url,
      score: a.public_reactions_count,
      scoreLabel: 'reactions',
      tags: a.tag_list ?? [],
      publishedAt: a.published_timestamp,
    }));
}

export function fetchDevto(): Promise<RawItem[]> {
  return devtoArticles('https://dev.to/api/articles?top=1&per_page=60');
}

interface LobstersStory {
  title: string;
  url: string;
  score: number;
  created_at: string;
  tags: string[];
  comments_url: string;
}

async function lobstersStories(url: string): Promise<RawItem[]> {
  const items = await fetchJson<LobstersStory[]>(url);
  return items.map((s) => ({
    source: 'lobsters',
    title: s.title,
    url: s.url || s.comments_url,
    discussionUrl: s.url ? s.comments_url : undefined,
    score: s.score,
    scoreLabel: 'pt',
    tags: s.tags,
    publishedAt: s.created_at,
  }));
}

export function fetchLobsters(): Promise<RawItem[]> {
  return lobstersStories('https://lobste.rs/hottest.json');
}

interface HfDailyPaper {
  title: string;
  publishedAt: string;
  paper: { id: string; upvotes: number };
}

export async function fetchHuggingFace(): Promise<RawItem[]> {
  const items = await fetchJson<HfDailyPaper[]>('https://huggingface.co/api/daily_papers?limit=50');
  return items.map((p) => ({
    source: 'huggingface',
    title: p.title,
    url: `https://huggingface.co/papers/${p.paper.id}`,
    score: p.paper.upvotes,
    scoreLabel: 'upvotes',
    tags: ['paper', 'ai'],
    publishedAt: p.publishedAt,
  }));
}

interface GithubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  topics?: string[];
  created_at: string;
}

/**
 * New-repo rankings are full of bought stars: a wave of repos promising a "pre-configured environment"
 * for some paid app (malware lures), and repos with no description or one that only repeats the name.
 */
const SPAM_DESCRIPTION = /pre-?configured (environment|production build)|automated deployment pipeline/i;

/** The repo's description, or null when it looks like spam */
function realDescription(r: GithubRepo): string | null {
  const description = r.description?.trim();
  if (!description || description === repoName(r.full_name) || SPAM_DESCRIPTION.test(description)) return null;
  return description;
}

export async function fetchGithubNewRepos(now: Date): Promise<RawItem[]> {
  const q = encodeURIComponent(`created:>${dateDaysAgo(7, now)}`);
  const data = await fetchJson<{ items: GithubRepo[] }>(
    `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=50`,
    githubHeaders(),
  );
  return data.items.flatMap((r) => {
    const description = realDescription(r);
    if (!description) return [];
    return {
      source: 'github_new_repos',
      title: `${r.full_name} — ${description}`,
      url: r.html_url,
      score: r.stargazers_count,
      scoreLabel: '★',
      // Topics only: the implementation language says little about what a repo is for
      // (every TypeScript repo would otherwise match a "typescript" or "frontend" topic)
      tags: r.topics ?? [],
      publishedAt: r.created_at,
    };
  });
}

/**
 * Topic tags, looked up directly so stories that never reach a front page still turn up.
 * Each returns that platform's recent stories with the tag, minus ones with almost no reactions.
 */
export type TagPlatform = 'zenn' | 'qiita' | 'devto' | 'lobsters';

/**
 * At least one reaction. Stories are ranked by popularity within a topic, so in a busy topic these
 * only end up behind "Show more"; in a quiet one (few posts anywhere) they are what there is to read.
 */
const TAG_MIN_SCORE = 1;
const TAG_DAYS = 4;

/** Zenn, dev.to and Lobsters spell tags in lowercase letters and digits only ("Node.js" → nodejs) */
const tagSlug = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Runs one tag lookup and keeps the stories with enough reactions, marked with the tag they were found under.
 * `spelled` is the tag as the platform writes it; an empty one means the platform can't look it up.
 */
async function lookup(tag: string, spelled: string, request: (spelled: string) => Promise<RawItem[]>) {
  if (!spelled) return [];
  const items = await request(spelled);
  return items.filter((i) => (i.score ?? 0) >= TAG_MIN_SCORE).map((i) => ({ ...i, lookups: [tag] }));
}

/** Lobsters answers an unknown tag with an error page, so only tags it lists are asked for (the list is fetched once) */
let lobstersTags: Promise<Set<string>> | undefined;
function knownLobstersTags(): Promise<Set<string>> {
  lobstersTags ??= fetchJson<{ tag: string }[]>('https://lobste.rs/tags.json').then(
    (tags) => new Set(tags.map((t) => t.tag)),
  );
  return lobstersTags;
}

export const TAG_FETCHERS: Record<TagPlatform, (tag: string, now: Date) => Promise<RawItem[]>> = {
  zenn: (tag) => lookup(tag, tagSlug(tag), (slug) => zennArticles(`topicname=${slug}&order=latest&count=30`)),
  qiita: (tag, now) => lookup(tag, tag, () => searchQiita(`tag:${tag} created:>${dateDaysAgo(TAG_DAYS, now)}`, 30)),
  devto: (tag) =>
    lookup(tag, tagSlug(tag), (slug) =>
      devtoArticles(`https://dev.to/api/articles?tag=${slug}&top=${TAG_DAYS}&per_page=30`),
    ),
  lobsters: (tag) =>
    lookup(tag, tagSlug(tag), async (slug) =>
      (await knownLobstersTags()).has(slug) ? lobstersStories(`https://lobste.rs/t/${slug}.json`) : [],
    ),
};
