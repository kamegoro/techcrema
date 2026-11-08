import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText, githubHeaders, politeFetch, readLimited, userAgent } from '../src/http.ts';

const ok = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

/** Each test uses its own host, because the per-host queue lives for the whole module */
let hostCount = 0;
const nextHost = () => `https://host${++hostCount}.example`;

afterEach(() => {
  vi.useRealTimers();
});

describe('userAgent', () => {
  it('names the repository running the job, and falls back to this project', () => {
    expect(userAgent({ GITHUB_REPOSITORY: 'alice/my-feed' })).toContain('github.com/alice/my-feed');
    expect(userAgent({})).toContain('github.com/kamegoro/tech-catchup');
    expect(userAgent({ GITHUB_REPOSITORY: 'not a repo' })).toContain('github.com/kamegoro/tech-catchup');
  });
});

describe('politeFetch', () => {
  it('identifies itself and passes extra headers', async () => {
    const fetch = vi.fn(async () => ok('x'));
    vi.stubGlobal('fetch', fetch);
    await politeFetch(`${nextHost()}/a`, { Accept: 'text/plain' });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'User-Agent': expect.stringContaining('tech-catchup'), Accept: 'text/plain' },
      }),
    );
  });

  it('fails on an error status', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 503, statusText: 'Unavailable' }));
    await expect(politeFetch(`${nextHost()}/a`)).rejects.toThrow(/HTTP 503 Unavailable/);
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

    const first = politeFetch(`${host}/fail`).catch(() => 'failed');
    const second = politeFetch(`${host}/b`);
    const elsewhere = politeFetch(`${other}/c`);
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
    await politeFetch('https://b.hatena.ne.jp/one');
    const next = politeFetch('https://b.hatena.ne.jp/two');
    await vi.advanceTimersByTimeAsync(4999);
    expect(started).toEqual(['https://b.hatena.ne.jp/one']);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(started).toHaveLength(2);
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
