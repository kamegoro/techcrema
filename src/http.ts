/** Requests to the same host run one at a time with a pause in between, so no site gets hammered */

/** On Actions, name the repository running the job, so each user's requests identify their own repo */
export function userAgent(env: NodeJS.ProcessEnv = process.env): string {
  const repo = env.GITHUB_REPOSITORY ?? '';
  return `techcrema/0.2 (personal tech reader; github.com/${/^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : 'kamegoro/techcrema'})`;
}
const DEFAULT_INTERVAL_MS = 1500;
/** Per-host pauses, e.g. to honor Crawl-delay in robots.txt */
const HOST_INTERVAL_MS: Record<string, number> = {
  'b.hatena.ne.jp': 5000,
  'qiita.com': 2000,
};
const TIMEOUT_MS = 20_000;
/** Upper bound so a huge response can't exhaust memory (the largest feed we know of is under 1 MB) */
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const hostQueues = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(), ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return res;
}

export function politeFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const host = new URL(url).host;
  const interval = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const current = previous.then(() => rawFetch(url, headers));
  // Whether this request succeeds or fails, the next one starts `interval` ms after it finishes.
  // The queue holds a promise that never rejects, so one failure doesn't break the chain.
  const wait = () => sleep(interval);
  hostQueues.set(host, current.then(wait, wait));
  return current;
}

/** Reads the body up to `limit` bytes and aborts with an error beyond that */
export async function readLimited(res: Response, limit = MAX_RESPONSE_BYTES): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > limit) throw new Error(`Response too large (${declared} bytes)`);
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
      throw new Error(`Response too large (>${limit} bytes)`);
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
