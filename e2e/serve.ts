/**
 * Serves web/ under /tech-catchup/, the same path layout as a GitHub Pages project site.
 * Tests replace feed.json per test with page.route(), so no collected data is needed.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'web');
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE = '/tech-catchup/';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (!pathname.startsWith(BASE)) return void res.writeHead(404).end();
  const rel = pathname.slice(BASE.length) || 'index.html';
  const file = path.join(ROOT, rel);
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(ROOT + path.sep) || !type) return void res.writeHead(404).end();
  try {
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1', () => console.log(`e2e server on http://127.0.0.1:${PORT}${BASE}`));
