/**
 * 相手サイトに負荷をかけないためのHTTPクライアント。
 * - 同じホストへのリクエストは直列にし、間隔をあける
 * - 独自のUser-Agentを名乗る
 * - タイムアウトを設ける
 */

const USER_AGENT = 'tech-catchup/0.1 (personal tech reader; github.com/kamegoro/tech-catchup)';
const DEFAULT_INTERVAL_MS = 1500;
/** robots.txt の Crawl-delay などに合わせたホスト別の間隔 */
const HOST_INTERVAL_MS: Record<string, number> = {
  'b.hatena.ne.jp': 5000,
  'qiita.com': 2000,
};
const TIMEOUT_MS = 20_000;

const hostQueues = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return res;
}

/** ホストごとに直列化して取得する */
export function politeFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const host = new URL(url).host;
  const interval = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const current = previous.then(() => rawFetch(url, headers));
  // 成功・失敗にかかわらず、次のリクエストはこの完了から interval 後に始める。
  // キューには失敗を伝播させないPromiseを置く。
  const wait = () => sleep(interval);
  hostQueues.set(host, current.then(wait, wait));
  return current;
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await politeFetch(url, { Accept: 'application/json', ...headers });
  return (await res.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  const res = await politeFetch(url);
  return await res.text();
}

export function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
