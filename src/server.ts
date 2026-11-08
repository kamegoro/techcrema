/**
 * ローカル用のサーバー。web/ の静的ファイルと、フィード・操作記録のAPIを返す。
 *   npm start      → このPCだけで見る(127.0.0.1)
 *   npm run start:lan → 同じWi-Fiのスマホからも見る(0.0.0.0)
 */
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { isCollecting, runCollect } from './collect.ts';
import { isMuted } from './rank.ts';
import { loadFeed, loadState, localDate, ROOT, saveState } from './store.ts';
import type { Feed, Story, UserState } from './types.ts';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);
const WEB_DIR = path.join(ROOT, 'web');
const MAX_BODY_BYTES = 1_000_000;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  // application/json 以外は受け付けない。他のサイトからのフォーム送信(CSRF)を防ぐため。
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSONを解釈できません');
  }
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

/** フィードが無い、または日付が変わっていたら裏で収集を始める */
function refreshIfStale(feed: Feed | null): void {
  if (isCollecting()) return;
  if (!feed || feed.date !== localDate(new Date())) {
    runCollect((m) => console.log(m)).catch((err) => console.error('収集に失敗しました', err));
  }
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  if (req.method === 'GET' && pathname === '/api/feed') {
    const [feed, state] = await Promise.all([loadFeed(), loadState()]);
    refreshIfStale(feed);
    sendJson(res, 200, {
      feed: feed ? applyMute(feed, state) : null,
      state: publicState(state),
      collecting: isCollecting(),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/collect') {
    await readBody(req);
    await runCollect((m) => console.log(m));
    const [feed, state] = await Promise.all([loadFeed(), loadState()]);
    sendJson(res, 200, { feed: feed ? applyMute(feed, state) : null, state: publicState(state), collecting: false });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/action') {
    const body = (await readBody(req)) as { action?: string; key?: string; story?: Story };
    const { action, key } = body;
    if (typeof key !== 'string' || !key) throw new HttpError(400, 'key がありません');
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
      case 'later':
        if (!body.story || body.story.key !== key) throw new HttpError(400, 'story がありません');
        state.later[key] = { savedAt: now, story: body.story };
        break;
      case 'unlater':
        delete state.later[key];
        break;
      default:
        throw new HttpError(400, `未知の action: ${String(action)}`);
    }
    await saveState(state);
    sendJson(res, 200, { state: publicState(state) });
    return;
  }

  if (req.method === 'POST' && (pathname === '/api/mute' || pathname === '/api/unmute')) {
    const body = (await readBody(req)) as { keywords?: unknown; domains?: unknown };
    const strings = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
    const state = await loadState();
    const keywords = strings(body.keywords);
    const domains = strings(body.domains);
    if (pathname === '/api/mute') {
      state.mute.keywords = [...new Set([...state.mute.keywords, ...keywords])];
      state.mute.domains = [...new Set([...state.mute.domains, ...domains])];
    } else {
      state.mute.keywords = state.mute.keywords.filter((k) => !keywords.includes(k));
      state.mute.domains = state.mute.domains.filter((d) => !domains.includes(d));
    }
    await saveState(state);
    const feed = await loadFeed();
    sendJson(res, 200, { feed: feed ? applyMute(feed, state) : null, state: publicState(state), collecting: isCollecting() });
    return;
  }

  throw new HttpError(404, 'Not Found');
}

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(WEB_DIR, rel);
  // web/ の外を読ませない
  if (!file.startsWith(WEB_DIR + path.sep)) throw new HttpError(404, 'Not Found');
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    throw new HttpError(404, 'Not Found');
  }
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(res, pathname);
    } else {
      throw new HttpError(405, 'Method Not Allowed');
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: err instanceof Error ? err.message : String(err) });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`tech-catchup: http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const addrs of Object.values(networkInterfaces())) {
      for (const a of addrs ?? []) {
        if (a.family === 'IPv4' && !a.internal) console.log(`  スマホから: http://${a.address}:${PORT}`);
      }
    }
  }
  loadFeed().then(refreshIfStale, (err) => console.error(err));
});
