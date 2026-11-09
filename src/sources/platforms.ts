/** Sources with a popularity signal. Official APIs, RSS and public JSON only; no HTML scraping. */

import { parseFeed } from '../feed-parser.ts';
import { fetchJson, fetchText, githubHeaders } from '../http.ts';
import type { RawItem } from '../types.ts';

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
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
export function hatenaEntryUrl(link: string): string {
  if (link.startsWith('https://')) return `https://b.hatena.ne.jp/entry/s/${link.slice('https://'.length)}`;
  return `https://b.hatena.ne.jp/entry/${link.replace(/^http:\/\//, '')}`;
}

export async function fetchHatena(): Promise<RawItem[]> {
  const xml = await fetchText('https://b.hatena.ne.jp/hotentry/it.rss');
  return parseFeed(xml).map((e) => ({
    source: 'hatena',
    title: e.title,
    url: e.link,
    discussionUrl: hatenaEntryUrl(e.link),
    score: e.bookmarkCount,
    scoreLabel: 'users',
    tags: e.categories.filter((c) => c !== HATENA_TECH_CATEGORY),
    publishedAt: e.publishedAt,
  }));
}

interface ZennArticle {
  title: string;
  path: string;
  liked_count: number;
  published_at: string;
  article_type: string;
}

function zennItem(a: ZennArticle): RawItem {
  return {
    source: 'zenn',
    title: a.title,
    url: `https://zenn.dev${a.path}`,
    score: a.liked_count,
    scoreLabel: 'likes',
    tags: a.article_type === 'idea' ? ['idea'] : [],
    publishedAt: a.published_at,
  };
}

export async function fetchZenn(): Promise<RawItem[]> {
  const data = await fetchJson<{ articles: ZennArticle[] }>('https://zenn.dev/api/articles?order=daily&count=60');
  return data.articles.map(zennItem);
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
  return searchQiita(`created:>${isoDaysAgo(3, now).slice(0, 10)} stocks:>2`, 100);
}

interface DevtoArticle {
  title: string;
  url: string;
  public_reactions_count: number;
  published_timestamp: string;
  tag_list: string[];
}

async function devtoArticles(url: string): Promise<RawItem[]> {
  const items = await fetchJson<DevtoArticle[]>(url);
  return items.map((a) => ({
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

export async function fetchGithubNewRepos(now: Date): Promise<RawItem[]> {
  const since = isoDaysAgo(7, now).slice(0, 10);
  const q = encodeURIComponent(`created:>${since}`);
  const data = await fetchJson<{ items: GithubRepo[] }>(
    `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=50`,
    githubHeaders(),
  );
  return data.items.map((r) => ({
    source: 'github_new_repos',
    title: r.description ? `${r.full_name} — ${r.description}` : r.full_name,
    url: r.html_url,
    score: r.stargazers_count,
    scoreLabel: '★',
    // Topics only: the implementation language says little about what a repo is for
    // (every TypeScript repo would otherwise match a "typescript" or "frontend" topic)
    tags: r.topics ?? [],
    publishedAt: r.created_at,
  }));
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

const popularEnough = (items: RawItem[], tag: string) =>
  items.filter((i) => Number(i.score) >= TAG_MIN_SCORE).map((i) => ({ ...i, tags: [...i.tags, tag] }));

async function bySlug(tag: string, request: (slug: string) => Promise<RawItem[]>): Promise<RawItem[]> {
  const slug = tagSlug(tag);
  return slug ? popularEnough(await request(slug), tag) : [];
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
  zenn: (tag) =>
    bySlug(tag, async (slug) => {
      const data = await fetchJson<{ articles: ZennArticle[] }>(
        `https://zenn.dev/api/articles?topicname=${slug}&order=latest&count=30`,
      );
      return data.articles.map(zennItem);
    }),
  qiita: async (tag, now) =>
    popularEnough(await searchQiita(`tag:${tag} created:>${isoDaysAgo(TAG_DAYS, now).slice(0, 10)}`, 30), tag),
  devto: (tag) =>
    bySlug(tag, (slug) => devtoArticles(`https://dev.to/api/articles?tag=${slug}&top=${TAG_DAYS}&per_page=30`)),
  lobsters: (tag) =>
    bySlug(tag, async (slug) =>
      (await knownLobstersTags()).has(slug) ? lobstersStories(`https://lobste.rs/t/${slug}.json`) : [],
    ),
};
