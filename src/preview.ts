/** Static file server on 127.0.0.1 for previews, the E2E tests and the demo recorder */
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

export interface StaticSite {
  root: string;
  /** URL path the site lives under, e.g. "/" or "/tech-catchup/" */
  base: string;
}

/** Path on disk for a request, or null when it is outside the site or not a file type we serve */
export function resolveRequest(site: StaticSite, url: string): string | null {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (!pathname.startsWith(site.base)) return null;
  const relative = pathname.slice(site.base.length);
  const file = path.join(site.root, relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative);
  const inside = file.startsWith(path.resolve(site.root) + path.sep);
  return inside && CONTENT_TYPES[path.extname(file)] ? file : null;
}

export function createStaticServer(site: StaticSite): Server {
  return createServer(async (req, res) => {
    const file = req.method === 'GET' ? resolveRequest(site, String(req.url)) : null;
    try {
      if (!file) throw new Error('not served');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)], 'Cache-Control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
}

/** Starts the server; port 0 picks a free port */
export async function startStaticServer(site: StaticSite, port: number): Promise<{ server: Server; url: string }> {
  const server = createStaticServer(site);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${actual}${site.base}` };
}
