const DEFAULT_INTERVAL_MS = 1500;
/** Per-host pauses, e.g. to honor Crawl-delay in robots.txt */
const HOST_INTERVAL_MS: Record<string, number> = {
  'b.hatena.ne.jp': 5000,
  'qiita.com': 2000,
};
const TIMEOUT_MS = 20_000;
/** Upper bound so a huge response can't exhaust memory (the largest feed we know of is under 1 MB) */
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/** On Actions, the repository running the job ("owner/name"), which is who runs the page */
export function ownRepository(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const repo = env.GITHUB_REPOSITORY ?? '';
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : undefined;
}

/** Each user's requests name their own repository, so a site knows whom to contact */
export function userAgent(env: NodeJS.ProcessEnv = process.env): string {
  return `techcrema/1 (personal tech reader; github.com/${ownRepository(env) ?? 'kamegoro/techcrema'})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The charset a response declares, in its Content-Type or, for XML, its declaration
 * (some Japanese blogs still serve Shift_JIS or EUC-JP)
 */
function charsetOf(res: Response, head: Uint8Array): string {
  const declared =
    res.headers.get('content-type')?.match(/charset=["']?([\w-]+)/i)?.[1] ??
    new TextDecoder('latin1').decode(head.subarray(0, 200)).match(/^<\?xml[^>]*encoding=["']([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(declared ?? 'utf-8').encoding;
  } catch {
    return 'utf-8';
  }
}

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
  const body = Buffer.concat(chunks);
  return new TextDecoder(charsetOf(res, body)).decode(body);
}

async function get(url: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(), ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // A redirect to another host isn't paused for that host; the sources we know of don't redirect across hosts
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return readLimited(res);
}

const hostQueues = new Map<string, Promise<unknown>>();

/** Requests to one host run one at a time, body included, each followed by the host's pause */
export function politeGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  const host = new URL(url).host;
  const interval = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const current = previous.then(() => get(url, headers));
  // The queue holds a promise that never rejects, so one failure doesn't break the chain
  const wait = () => sleep(interval);
  hostQueues.set(host, current.then(wait, wait));
  return current;
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return JSON.parse(await politeGet(url, { Accept: 'application/json', ...headers })) as T;
}

export function fetchText(url: string): Promise<string> {
  return politeGet(url);
}

export function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
