/**
 * Sources with a popularity signal. Official APIs, RSS and public JSON only.
 * Each fetcher may fail on its own; the others carry on.
 */
import { fetchJson, fetchText, githubHeaders } from '../http.ts';
import { parseFeed } from '../feed-parser.ts';
import type { RawItem } from '../types.ts';

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

// --- Hacker News (Algolia API: front page) ---
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

// --- Hatena Bookmark: popular entries in Technology (RSS) ---
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

// --- Zenn (public JSON: daily trend) ---
interface ZennArticle {
  title: string;
  path: string;
  liked_count: number;
  published_at: string;
  article_type: string;
}

export async function fetchZenn(): Promise<RawItem[]> {
  const data = await fetchJson<{ articles: ZennArticle[] }>(
    'https://zenn.dev/api/articles?order=daily&count=60',
  );
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

// --- Qiita (API v2: articles from the last 3 days that people saved) ---
interface QiitaItem {
  title: string;
  url: string;
  likes_count: number;
  created_at: string;
  tags: { name: string }[];
}

export async function fetchQiita(now: Date): Promise<RawItem[]> {
  const since = isoDaysAgo(3, now).slice(0, 10);
  const query = encodeURIComponent(`created:>${since} stocks:>2`);
  const token = process.env.QIITA_TOKEN;
  const items = await fetchJson<QiitaItem[]>(
    `https://qiita.com/api/v2/items?per_page=100&query=${query}`,
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

// --- dev.to (Forem API: top of the last day) ---
interface DevtoArticle {
  title: string;
  url: string;
  public_reactions_count: number;
  published_timestamp: string;
  tag_list: string[];
}

export async function fetchDevto(): Promise<RawItem[]> {
  const items = await fetchJson<DevtoArticle[]>('https://dev.to/api/articles?top=1&per_page=60');
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

// --- Lobsters (hottest.json) ---
interface LobstersStory {
  title: string;
  url: string;
  score: number;
  created_at: string;
  tags: string[];
  comments_url: string;
}

export async function fetchLobsters(): Promise<RawItem[]> {
  const items = await fetchJson<LobstersStory[]>('https://lobste.rs/hottest.json');
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

// --- Hugging Face Daily Papers ---
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

// --- GitHub: most-starred repositories created in the last 7 days (Search API) ---
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
