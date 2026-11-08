/**
 * ローカル用のサーバー。web/ の静的ファイルと、フィード・操作記録のAPIを返す。
 *   npm start          → このPCだけで見る(127.0.0.1)
 *   npm run start:lan  → 同じWi-Fiのスマホからも見る(0.0.0.0)。初回だけトークン付きURLで開く
 */
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { hostname as osHostname, networkInterfaces } from 'node:os';
import path from 'node:path';
import { isCollecting, runCollect } from './collect.ts';
import { isMuted } from './rank.ts';
import {
  isAllowedHostHeader,
  isLoopbackAddress,
  isLoopbackHost,
  isSameOrigin,
  isValidStoryKey,
  parseCookies,
  sanitizeMuteList,
  SECURITY_HEADERS,
  tokensEqual,
} from './security.ts';
import { loadFeed, loadOrCreateAccessToken, loadState, localDate, ROOT, saveState } from './store.ts';
import type { Feed, Story, UserState } from './types.ts';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);
const WEB_DIR = path.join(ROOT, 'web');
const MAX_BODY_BYTES = 64 * 1024;
/** 相手サイトに負荷をかけないよう、手動更新はこの間隔より短くできない */
const MIN_COLLECT_INTERVAL_MS = 5 * 60 * 1000;
const TOKEN_COOKIE = 'tc_token';

/** LAN公開のときだけトークン認証を必須にする */
const LAN_MODE = !isLoopbackHost(HOST);
const ACCESS_TOKEN = LAN_MODE ? await loadOrCreateAccessToken() : '';

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}

/** Hostヘッダーとして受け付ける名前(DNSリバインディング対策) */
const ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set(
  LAN_MODE ? [...lanAddresses(), `${osHostname().toLowerCase().replace(/\.local$/, '')}.local`] : [],
);

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  readonly status: number;
  readonly headers: Record<string, string>;
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  // application/json 以外は受け付けない。他サイトからのフォーム送信(CSRF)はこの形式で送れない。
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type は application/json にしてください');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'リクエストが大きすぎます');
    chunks.push(chunk as Buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSONを解釈できません');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'JSONオブジェクトを送ってください');
  }
  return parsed as Record<string, unknown>;
}

/** UIでミュートしたものを、再収集を待たずに今のフィードから消す */
function applyMute(feed: Feed, state: UserState): Feed {
  return {
    ...feed,
    sections: feed.sections.map((s) => ({ ...s, stories: s.stories.filter((st) => !isMuted(st, state.mute)) })),
  };
}

function publicState(state: UserState) {
  return {
    liked: Object.keys(state.liked),
    read: Object.keys(state.read),
    later: Object.values(state.later)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map((l) => l.story),
    mute: state.mute,
  };
}

async function feedResponse() {
  const [feed, state] = await Promise.all([loadFeed(), loadState()]);
  return { feed: feed ? applyMute(feed, state) : null, state: publicState(state), collecting: isCollecting() };
}

/** 前回の収集からの経過時間が短すぎれば、あと何秒待つ必要があるかを返す */
function collectCooldownSeconds(feed: Feed | null): number {
  if (!feed) return 0;
  const elapsed = Date.now() - Date.parse(feed.generatedAt);
  return elapsed >= MIN_COLLECT_INTERVAL_MS ? 0 : Math.ceil((MIN_COLLECT_INTERVAL_MS - elapsed) / 1000);
}

/** フィードが無い、または日付が変わっていたら裏で収集を始める */
function refreshIfStale(feed: Feed | null): void {
  if (isCollecting() || collectCooldownSeconds(feed) > 0) return;
  if (!feed || feed.date !== localDate(new Date())) {
    runCollect((m) => console.log(m)).catch((err) => console.error('収集に失敗しました', err));
  }
}

/** 「あとで読む」に保存する記事は、クライアントから受け取らずサーバー側の既知の記事から探す */
async function findKnownStory(key: string, state: UserState): Promise<Story | null> {
  const feed = await loadFeed();
  for (const section of feed?.sections ?? []) {
    const found = section.stories.find((s) => s.key === key);
    if (found) return found;
  }
  return Object.hasOwn(state.later, key) ? state.later[key]!.story : null;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  if (req.method === 'GET' && pathname === '/api/feed') {
    const body = await feedResponse();
    refreshIfStale(await loadFeed());
    sendJson(res, 200, { ...body, collecting: isCollecting() });
    return;
  }

  if (req.method !== 'POST') throw new HttpError(404, 'Not Found');
  const body = await readBody(req);

  if (pathname === '/api/collect') {
    const wait = collectCooldownSeconds(await loadFeed());
    if (wait > 0) {
      throw new HttpError(429, `前回の更新から間もないため、あと${Math.ceil(wait / 60)}分ほど待ってください`, {
        'Retry-After': String(wait),
      });
    }
    await runCollect((m) => console.log(m));
    sendJson(res, 200, await feedResponse());
    return;
  }

  if (pathname === '/api/action') {
    const { action, key } = body;
    if (!isValidStoryKey(key)) throw new HttpError(400, 'key が不正です');
    const state = await loadState();
    const now = new Date().toISOString();
    switch (action) {
      case 'like':
        state.liked[key] = now;
        break;
      case 'unlike':
        delete state.liked[key];
        break;
      case 'read':
        state.read[key] = now;
        break;
      case 'unread':
        delete state.read[key];
        break;
      case 'later': {
        const story = await findKnownStory(key, state);
        if (!story) throw new HttpError(404, 'その記事は見つかりません');
        state.later[key] = { savedAt: now, story };
        break;
      }
      case 'unlater':
        delete state.later[key];
        break;
      default:
        throw new HttpError(400, '未知の action です');
    }
    await saveState(state);
    sendJson(res, 200, { state: publicState(state) });
    return;
  }

  if (pathname === '/api/mute' || pathname === '/api/unmute') {
    const keywords = sanitizeMuteList(body.keywords);
    const domains = sanitizeMuteList(body.domains).map((d) => d.toLowerCase());
    const state = await loadState();
    if (pathname === '/api/mute') {
      state.mute.keywords = [...new Set([...state.mute.keywords, ...keywords])];
      state.mute.domains = [...new Set([...state.mute.domains, ...domains])];
    } else {
      state.mute.keywords = state.mute.keywords.filter((k) => !keywords.includes(k));
      state.mute.domains = state.mute.domains.filter((d) => !domains.includes(d));
    }
    await saveState(state);
    sendJson(res, 200, await feedResponse());
    return;
  }

  throw new HttpError(404, 'Not Found');
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  let rel: string;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    throw new HttpError(400, 'Bad Request');
  }
  const file = path.resolve(WEB_DIR, rel);
  // web/ の外を読ませない
  if (!file.startsWith(WEB_DIR + path.sep)) throw new HttpError(404, 'Not Found');
  const type = CONTENT_TYPES[path.extname(file)];
  if (!type) throw new HttpError(404, 'Not Found');
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    throw new HttpError(404, 'Not Found');
  }
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * LAN公開時の認証。
 * - このPC自身(127.0.0.1)からは不要
 * - それ以外は ?token=... で一度開くと HttpOnly Cookie が入り、以降はCookieで通る
 * 戻り値が true ならリダイレクト済み(処理終了)。
 */
function authenticate(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  if (!LAN_MODE || isLoopbackAddress(req.socket.remoteAddress)) return false;
  const queryToken = url.searchParams.get('token');
  if (queryToken !== null) {
    if (!tokensEqual(queryToken, ACCESS_TOKEN)) throw new HttpError(401, 'トークンが違います');
    url.searchParams.delete('token');
    res.writeHead(303, {
      ...SECURITY_HEADERS,
      Location: `${url.pathname}${url.search}`,
      'Set-Cookie': `${TOKEN_COOKIE}=${ACCESS_TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
      'Cache-Control': 'no-store',
    });
    res.end();
    return true;
  }
  if (!tokensEqual(parseCookies(req.headers.cookie)[TOKEN_COOKIE], ACCESS_TOKEN)) {
    throw new HttpError(401, 'サーバーのターミナルに表示されたURL(token付き)で開いてください');
  }
  return false;
}

const server = createServer(async (req, res) => {
  try {
    if (!isAllowedHostHeader(req.headers.host, PORT, ALLOWED_HOSTNAMES)) {
      throw new HttpError(421, 'Host が許可されていません');
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (authenticate(req, res, url)) return;
    if (req.method === 'POST' && !isSameOrigin(req.headers.origin, req.headers.host)) {
      throw new HttpError(403, '別のサイトからのリクエストは受け付けません');
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, url.pathname);
    } else {
      throw new HttpError(405, 'Method Not Allowed');
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    // 500のときは内部の詳細を返さない
    const message = status === 500 ? 'サーバー内部でエラーが起きました' : (err as Error).message;
    if (!res.headersSent) sendJson(res, status, { error: message }, err instanceof HttpError ? err.headers : {});
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`tech-catchup: http://localhost:${PORT}`);
  if (LAN_MODE) {
    console.log('\nスマホから開くURL(同じWi-Fiで。初回だけこのURLで開けば、以降はtokenなしで開けます):');
    for (const address of lanAddresses()) console.log(`  http://${address}:${PORT}/?token=${ACCESS_TOKEN}`);
    console.log('\n※ このURLを知っている人は同じネットワークから閲覧できます。共有しないでください。');
  }
  loadFeed().then(refreshIfStale, (err) => console.error(err));
});
