import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig, parseOfficial, parseTopics, resolveConfig } from '../src/config.ts';
import { PRESET_NAMES } from '../src/presets.ts';

describe('resolveConfig', () => {
  it('defaults to the English preset', () => {
    const c = resolveConfig({}, {});
    assert.equal(c.language, 'en');
    assert.equal(c.timezone, 'UTC');
    assert.deepEqual(c.sources, ['hackernews', 'lobsters', 'devto', 'huggingface', 'github']);
    assert.equal(c.layout.for_you_min_local, 0);
  });

  it('picks Japanese sources, time zone and quota for language: ja', () => {
    const c = resolveConfig({ language: 'ja' }, {});
    assert.ok(c.sources.includes('hatena') && c.sources.includes('zenn'));
    assert.equal(c.timezone, 'Asia/Tokyo');
    assert.equal(c.layout.for_you_min_local, 3);
  });

  it('lets action inputs override the file, and treats empty inputs as unset', () => {
    const c = resolveConfig(
      { language: 'ja', sources: ['zenn'], topics: { rust: ['rust'] } },
      { language: '', sources: 'hackernews, github', title: 'My feed' },
    );
    assert.equal(c.language, 'ja');
    assert.deepEqual(c.sources, ['hackernews', 'github']);
    assert.deepEqual(c.topics, { rust: { weight: 1, keywords: ['rust'] } });
    assert.equal(c.title, 'My feed');
  });

  it('adds mute inputs to the mutes from the file', () => {
    const c = resolveConfig({ mute: { keywords: ['web3'] } }, { mute_keywords: 'nft, crypto', mute_domains: 'example.com' });
    assert.deepEqual(c.mute, { keywords: ['web3', 'nft', 'crypto'], domains: ['example.com'] });
  });

  it('overrides only the layout values that are given', () => {
    const c = resolveConfig({ layout: { for_you: 20 } }, {});
    assert.equal(c.layout.for_you, 20);
    assert.equal(c.layout.trending, 5);
  });

  it('explains what is wrong', () => {
    assert.throws(() => resolveConfig({ language: 'fr' }, {}), /language: "fr" is not supported/);
    assert.throws(() => resolveConfig({}, { sources: 'hn' }), /unknown source "hn"/);
    assert.throws(() => resolveConfig({ timezone: 'Mars/Base' }, {}), /not a valid IANA time zone/);
    assert.throws(() => resolveConfig({ layout: { foo: 1 } }, {}), /layout.foo: unknown setting/);
    assert.throws(() => resolveConfig({}, { sources: 'hn' }), ConfigError);
  });
});

describe('parseTopics', () => {
  it('accepts the short list form, a comma string and the full form', () => {
    assert.deepEqual(parseTopics('rust: [rust, cargo]\nweb: react, vue\ndb:\n  weight: 0.5\n  keywords: [postgres]'), {
      rust: { weight: 1, keywords: ['rust', 'cargo'] },
      web: { weight: 1, keywords: ['react', 'vue'] },
      db: { weight: 0.5, keywords: ['postgres'] },
    });
  });

  it('rejects topics without keywords or with a bad weight', () => {
    assert.throws(() => parseTopics({ rust: [] }), /needs at least one keyword/);
    assert.throws(() => parseTopics({ rust: { weight: 2, keywords: ['rust'] } }), /between 0 and 1/);
    assert.throws(() => parseTopics('- rust'), /expected a mapping/);
  });
});

describe('parseOfficial', () => {
  it('tells feeds, named feeds and GitHub repositories apart', () => {
    assert.deepEqual(parseOfficial('https://blog.rust-lang.org/feed.xml\nNode.js https://nodejs.org/en/feed/blog.xml\nnodejs/node'), {
      feeds: [{ name: undefined, url: 'https://blog.rust-lang.org/feed.xml' }, { name: 'Node.js', url: 'https://nodejs.org/en/feed/blog.xml' }],
      releases: ['nodejs/node'],
    });
    assert.deepEqual(parseOfficial([{ name: 'Deno', url: 'https://deno.com/feed' }]).feeds, [{ name: 'Deno', url: 'https://deno.com/feed' }]);
  });

  it('rejects entries that are neither', () => {
    assert.throws(() => parseOfficial('not a feed'), /neither a feed URL nor an owner\/repo/);
  });
});

describe('loadConfig', () => {
  it('reads tech-catchup.yml when present and works without it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tc-config-'));
    assert.equal((await loadConfig({}, dir)).language, 'en');
    await writeFile(path.join(dir, 'tech-catchup.yml'), 'language: ja\ntopics:\n  neovim: [neovim]\n');
    const c = await loadConfig({ TC_TITLE: 'Hi' }, dir);
    assert.equal(c.language, 'ja');
    assert.equal(c.title, 'Hi');
    assert.deepEqual(Object.keys(c.topics), ['neovim']);
  });

  it('fails when an explicitly named file is missing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tc-config-'));
    await assert.rejects(() => loadConfig({ TECH_CATCHUP_CONFIG: 'nope.yml' }, dir), /ENOENT/);
  });
});

describe('topic presets', () => {
  it('add topics and official feeds, with the user\'s own settings winning', () => {
    const c = resolveConfig(
      { presets: 'rust, ai', topics: { ai: ['claude'] }, official: ['Rust https://blog.rust-lang.org/feed.xml', 'my/repo'] },
      {},
    );
    assert.deepEqual(c.presets, ['rust', 'ai']);
    assert.ok(c.topics.rust!.keywords.includes('cargo'));
    assert.deepEqual(c.topics.ai, { weight: 1, keywords: ['claude'] });
    // The same feed URL from the preset and the user appears once, with the user's name
    assert.deepEqual(c.official.feeds.filter((f) => f.url === 'https://blog.rust-lang.org/feed.xml'), [
      { name: 'Rust', url: 'https://blog.rust-lang.org/feed.xml' },
    ]);
    assert.ok(c.official.releases.includes('rust-lang/rust') && c.official.releases.includes('my/repo'));
  });

  it('rejects unknown presets', () => {
    assert.throws(() => resolveConfig({}, { presets: 'cobol' }), /unknown preset "cobol"/);
  });

  it('every preset is valid', () => {
    for (const name of PRESET_NAMES) {
      const c = resolveConfig({ presets: [name] }, {});
      assert.ok(Object.keys(c.topics).length > 0, name);
      assert.ok(c.official.feeds.length + c.official.releases.length > 0, name);
    }
  });
});

describe('docs', () => {
  it('lists every preset in docs/configuration.md', async () => {
    const { readFile } = await import('node:fs/promises');
    const doc = await readFile(new URL('../docs/configuration.md', import.meta.url), 'utf8');
    for (const name of PRESET_NAMES) assert.match(doc, new RegExp(`\\| \`${name}\` \\|`), name);
  });
});
