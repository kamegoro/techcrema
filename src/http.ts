/**
 * 相手サイトに負荷をかけないためのHTTPクライアント。
 * - 同じホストへのリクエストは直列にし、間隔をあける
 * - 独自のUser-Agentを名乗る
 * - タイムアウトを設ける
 */

/** Forkして使う人のリポジトリを名乗れるよう、Actions上では実行中のリポジトリ名を使う */
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY ?? '')
  ? process.env.GITHUB_REPOSITORY
  : 'kamegoro/tech-catchup';
const USER_AGENT = `tech-catchup/0.2 (personal tech reader; github.com/${REPOSITORY})`;
const DEFAULT_INTERVAL_MS = 1500;
/** robots.txt の Crawl-delay などに合わせたホスト別の間隔 */
const HOST_INTERVAL_MS: Record<string, number> = {
  'b.hatena.ne.jp': 5000,
  'qiita.com': 2000,
};
const TIMEOUT_MS = 20_000;
/** 異常に大きいレスポンスでメモリを使い切らないための上限(一番大きいOpenAIのRSSでも1MB弱) */
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

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

/** 本文を上限付きで読む。上限を超えたら途中で打ち切ってエラーにする */
export async function readLimited(res: Response, limit = MAX_RESPONSE_BYTES): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > limit) throw new Error(`レスポンスが大きすぎます (${declared} bytes)`);
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error(`レスポンスが大きすぎます (>${limit} bytes)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await politeFetch(url, { Accept: 'application/json', ...headers });
  return JSON.parse(await readLimited(res)) as T;
}

export async function fetchText(url: string): Promise<string> {
  const res = await politeFetch(url);
  return await readLimited(res);
}

export function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
