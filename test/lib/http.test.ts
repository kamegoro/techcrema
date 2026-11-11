import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJson,
  fetchText,
  githubHeaders,
  ownRepository,
  politeGet,
  readLimited,
  userAgent,
} from '#src/lib/http.ts';

const ok = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

/** Each test uses its own host, because the per-host queue lives for the whole module */
let hostCount = 0;
const nextHost = () => `https://host${++hostCount}.example`;

afterEach(() => {
  vi.useRealTimers();
});

describe('ownRepository', () => {
  it('is the repository running the job, when it looks like one', () => {
    expect(ownRepository({ GITHUB_REPOSITORY: 'alice/my-feed' })).toBe('alice/my-feed');
    expect(ownRepository({ GITHUB_REPOSITORY: 'not a repo' })).toBeUndefined();
    expect(ownRepository({})).toBeUndefined();
  });
});

describe('userAgent', () => {
  it('names the repository running the job, and falls back to this project', () => {
    expect(userAgent({ GITHUB_REPOSITORY: 'alice/my-feed' })).toContain('github.com/alice/my-feed');
    expect(userAgent({})).toContain('github.com/kamegoro/techcrema');
    expect(userAgent({ GITHUB_REPOSITORY: 'not a repo' })).toContain('github.com/kamegoro/techcrema');
  });
});

describe('politeGet', () => {
  it('identifies itself and passes extra headers', async () => {
    const fetch = vi.fn(async () => ok('x'));
    vi.stubGlobal('fetch', fetch);
    await politeGet(`${nextHost()}/a`, { Accept: 'text/plain' });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'User-Agent': expect.stringContaining('techcrema'), Accept: 'text/plain' },
      }),
    );
  });

  it('fails on an error status', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 503, statusText: 'Unavailable' }));
    await expect(politeGet(`${nextHost()}/a`)).rejects.toThrow(/HTTP 503 Unavailable/);
  });

  it('waits between requests to the same host, even after a failure, but not across hosts', async () => {
    vi.useFakeTimers();
    const started: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      started.push(url);
      return url.endsWith('/fail') ? new Response('', { status: 500 }) : ok('x');
    });
    const host = nextHost();
    const other = nextHost();

    const first = politeGet(`${host}/fail`).catch(() => 'failed');
    const second = politeGet(`${host}/b`);
    const elsewhere = politeGet(`${other}/c`);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([`${host}/fail`, `${other}/c`]);
    expect(await first).toBe('failed');
    await elsewhere;

    await vi.advanceTimersByTimeAsync(1499);
    expect(started).not.toContain(`${host}/b`);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(started).toContain(`${host}/b`);
  });

  it('waits longer for hosts that ask for it', async () => {
    vi.useFakeTimers();
    const started: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      started.push(url);
      return ok('x');
    });
    await politeGet('https://b.hatena.ne.jp/one');
    const next = politeGet('https://b.hatena.ne.jp/two');
    await vi.advanceTimersByTimeAsync(4999);
    expect(started).toEqual(['https://b.hatena.ne.jp/one']);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(started).toHaveLength(2);
  });
});

describe('the per-host queue', () => {
  it('waits for the whole body before the next request to the host starts', async () => {
    vi.useFakeTimers();
    const host = nextHost();
    const started: string[] = [];
    let finishBody: () => void = () => undefined;
    vi.stubGlobal('fetch', async (url: string) => {
      started.push(url);
      if (!url.endsWith('/slow')) return ok('x');
      const body = new ReadableStream({
        start: (c) => {
          finishBody = () => {
            c.enqueue(new TextEncoder().encode('done'));
            c.close();
          };
        },
      });
      return new Response(body);
    });
    const slow = politeGet(`${host}/slow`);
    const next = politeGet(`${host}/next`);
    await vi.advanceTimersByTimeAsync(5000);
    expect(started).toEqual([`${host}/slow`]);
    finishBody();
    expect(await slow).toBe('done');
    await vi.advanceTimersByTimeAsync(1500);
    await next;
    expect(started).toEqual([`${host}/slow`, `${host}/next`]);
  });
});

describe('readLimited', () => {
  it('reads a body within the limit', async () => {
    expect(await readLimited(ok('hello'), 10)).toBe('hello');
  });

  it('refuses a body that announces itself as too large', async () => {
    await expect(readLimited(ok('x', { headers: { 'content-length': '11' } }), 10)).rejects.toThrow(
      /too large \(11 bytes\)/,
    );
  });

  it('stops reading a body that turns out too large', async () => {
    await expect(readLimited(ok('x'.repeat(100)), 10)).rejects.toThrow(/too large \(>10 bytes\)/);
  });

  it('decodes the charset the response declares, in its header or its XML declaration', async () => {
    const sjis = Uint8Array.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]);
    const header = new Response(sjis, { headers: { 'content-type': 'application/rss+xml; charset=Shift_JIS' } });
    expect(await readLimited(header)).toBe('\u30c6\u30b9\u30c8');
    const xml = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="Shift_JIS"?>'), sjis]);
    expect(await readLimited(new Response(xml))).toContain('\u30c6\u30b9\u30c8');
    expect(await readLimited(ok('plain', { headers: { 'content-type': 'text/plain; charset=bogus' } }))).toBe('plain');
  });

  it('treats a response without a body as empty', async () => {
    expect(await readLimited(new Response(null, { status: 204 }))).toBe('');
  });
});

describe('fetchJson and fetchText', () => {
  it('parse JSON and return text', async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => ok(url.endsWith('.json') ? '{"a":1}' : 'plain'));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchJson(`${nextHost()}/x.json`, { Authorization: 'Bearer t' })).toEqual({ a: 1 });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { Accept: 'application/json', Authorization: 'Bearer t' },
    });
    expect(await fetchText(`${nextHost()}/x.txt`)).toBe('plain');
  });
});

describe('githubHeaders', () => {
  it('adds the token only when one is set', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    expect(githubHeaders()).not.toHaveProperty('Authorization');
    vi.stubEnv('GITHUB_TOKEN', 'abc');
    expect(githubHeaders()).toMatchObject({ Authorization: 'Bearer abc' });
  });
});
