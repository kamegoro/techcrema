import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { localizeIndex } from '../src/build.ts';
import { summarize } from '../src/collect.ts';
import { resolveConfig } from '../src/config.ts';
import type { Feed, Story } from '../src/types.ts';

describe('localizeIndex', () => {
  const html = '<html lang="en"><head><title>Tech Catchup</title></head><h1 class="brand-title">Tech Catchup</h1>';

  it('writes the language and title into the page', () => {
    const out = localizeIndex(html, 'ja', 'My <feed>');
    assert.match(out, /<html lang="ja">/);
    assert.match(out, /<title>My &lt;feed&gt;<\/title>/);
    assert.match(out, /<h1 class="brand-title">My &lt;feed&gt;<\/h1>/);
  });
});

describe('summarize', () => {
  const story = (key: string, topics: string[]) => ({ key, topics }) as unknown as Story;
  const feed: Feed = {
    generatedAt: '2026-11-08T00:00:00Z',
    date: '2026-11-08',
    language: 'en',
    title: 'Tech Catchup',
    officialDays: 3,
    sections: [{ id: 'forYou', limit: 1, stories: [story('a', ['rust']), story('b', ['go'])] }],
    errors: [{ source: 'lobsters', message: 'HTTP 503 | down' }],
  };

  it('reports sections, sources, failures and topics without matches', () => {
    const config = resolveConfig({ topics: { rust: ['rust'], go: ['go'] } }, {});
    const md = summarize(config, feed, { hackernews: 30 });
    assert.match(md, /\| forYou \| 1 \| 1 \|/);
    assert.match(md, /\| hackernews \| 30 \|/);
    assert.match(md, /\| ❌ lobsters \| HTTP 503 \\\| down \|/);
    assert.match(md, /\| rust \| 1 \|/);
    // "go" only appears in a spare story, which is not on the page
    assert.match(md, /Topics with no stories today: go\./);
  });

  it('suggests adding topics when there are none', () => {
    assert.match(summarize(resolveConfig({}, {}), feed, {}), /No `topics` configured/);
  });
});
