/**
 * dist/ を手元で確認するための静的サーバー。このPCからだけ開ける(127.0.0.1)。
 * 本番は GitHub Pages が配信するので、このファイルは確認用。
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { DIST_DIR } from './build.ts';

const PORT = Number(process.env.PORT ?? 8787);

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = path.join(DIST_DIR, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
  const type = CONTENT_TYPES[path.extname(file)];
  // dist/ の外や、想定外の種類のファイルは返さない
  if (!file.startsWith(DIST_DIR + path.sep) || !type || req.method !== 'GET') {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://localhost:${PORT}/ で確認できます`);
});
