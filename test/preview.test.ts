import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveRequest, startStaticServer } from '../src/preview.ts';

let root: string;
let server: Server | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tc-preview-'));
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'index.html'), '<h1>home</h1>');
  await writeFile(path.join(root, 'feed.json'), '{}');
});

afterEach(() => {
  server?.close();
  server = undefined;
});

describe('resolveRequest', () => {
  const site = () => ({ root, base: '/techcrema/' });

  it('maps the base path and directories to index.html', () => {
    expect(resolveRequest(site(), '/techcrema/')).toBe(path.join(root, 'index.html'));
    expect(resolveRequest(site(), '/techcrema/sub/')).toBe(path.join(root, 'sub', 'index.html'));
    expect(resolveRequest(site(), '/techcrema/feed.json?x=1')).toBe(path.join(root, 'feed.json'));
  });

  it('refuses paths outside the base or the directory, and unknown file types', () => {
    expect(resolveRequest(site(), '/other/feed.json')).toBeNull();
    expect(resolveRequest(site(), '/techcrema/..%2F..%2Fetc%2Fpasswd.json')).toBeNull();
    expect(resolveRequest(site(), '/techcrema/secret.env')).toBeNull();
    expect(resolveRequest(site(), '/techcrema/%E0%A4%A')).toBeNull();
  });
});

describe('startStaticServer', () => {
  it('serves files with their type, and 404 for everything else', async () => {
    const started = await startStaticServer({ root, base: '/' }, 0);
    server = started.server;
    const home = await fetch(started.url);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await home.text()).toBe('<h1>home</h1>');

    expect((await fetch(`${started.url}missing.json`)).status).toBe(404);
    expect((await fetch(`${started.url}feed.json`, { method: 'POST' })).status).toBe(404);
  });
});
