import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseOfficial, parseTopics, resolveConfig } from '../src/config.ts';
import { PRESET_NAMES } from '../src/presets.ts';

describe('resolveConfig', () => {
  it('defaults to the English preset', () => {
    const c = resolveConfig({}, {});
    expect(c.language).toBe('en');
    expect(c.timezone).toBe('UTC');
    expect(c.sources).toEqual(['hackernews', 'lobsters', 'devto', 'huggingface', 'github']);
    expect(c.layout.for_you_min_local).toBe(0);
  });

  it('picks Japanese sources, time zone and quota for language: ja', () => {
    const c = resolveConfig({ language: 'ja' }, {});
    expect(c.sources.includes('hatena') && c.sources.includes('zenn')).toBeTruthy();
    expect(c.timezone).toBe('Asia/Tokyo');
    expect(c.layout.for_you_min_local).toBe(3);
  });

  it('lets action inputs override the file, and treats empty inputs as unset', () => {
    const c = resolveConfig(
      { language: 'ja', sources: ['zenn'], topics: { rust: ['rust'] } },
      { language: '', sources: 'hackernews, github', title: 'My feed' },
    );
    expect(c.language).toBe('ja');
    expect(c.sources).toEqual(['hackernews', 'github']);
    expect(c.topics).toEqual({ rust: { weight: 1, keywords: ['rust'] } });
    expect(c.title).toBe('My feed');
  });

  it('adds mute inputs to the mutes from the file', () => {
    const c = resolveConfig(
      { mute: { keywords: ['web3'] } },
      { mute_keywords: 'nft, crypto', mute_domains: 'example.com' },
    );
    expect(c.mute).toEqual({ keywords: ['web3', 'nft', 'crypto'], domains: ['example.com'] });
  });

  it('overrides only the layout values that are given', () => {
    const c = resolveConfig({ layout: { for_you: 20 } }, {});
    expect(c.layout.for_you).toBe(20);
    expect(c.layout.trending).toBe(5);
  });

  it('explains what is wrong', () => {
    expect(() => resolveConfig({ language: 'fr' }, {})).toThrow(/language: "fr" is not supported/);
    expect(() => resolveConfig({}, { sources: 'hn' })).toThrow(/unknown source "hn"/);
    expect(() => resolveConfig({ timezone: 'Mars/Base' }, {})).toThrow(/not a valid IANA time zone/);
    expect(() => resolveConfig({ layout: { foo: 1 } }, {})).toThrow(/layout.foo: unknown setting/);
    expect(() => resolveConfig({}, { sources: 'hn' })).toThrow(ConfigError);
  });
});

describe('parseTopics', () => {
  it('accepts the short list form, a comma string and the full form', () => {
    expect(parseTopics('rust: [rust, cargo]\nweb: react, vue\ndb:\n  weight: 0.5\n  keywords: [postgres]')).toEqual({
      rust: { weight: 1, keywords: ['rust', 'cargo'] },
      web: { weight: 1, keywords: ['react', 'vue'] },
      db: { weight: 0.5, keywords: ['postgres'] },
    });
  });

  it('rejects topics without keywords or with a bad weight', () => {
    expect(() => parseTopics({ rust: [] })).toThrow(/needs at least one keyword/);
    expect(() => parseTopics({ rust: { weight: 2, keywords: ['rust'] } })).toThrow(/between 0 and 1/);
    expect(() => parseTopics('- rust')).toThrow(/expected a mapping/);
  });
});

describe('parseOfficial', () => {
  it('tells feeds, named feeds and GitHub repositories apart', () => {
    expect(
      parseOfficial('https://blog.rust-lang.org/feed.xml\nNode.js https://nodejs.org/en/feed/blog.xml\nnodejs/node'),
    ).toEqual({
      feeds: [
        { name: undefined, url: 'https://blog.rust-lang.org/feed.xml' },
        { name: 'Node.js', url: 'https://nodejs.org/en/feed/blog.xml' },
      ],
      releases: ['nodejs/node'],
    });
    expect(parseOfficial([{ name: 'Deno', url: 'https://deno.com/feed' }]).feeds).toEqual([
      { name: 'Deno', url: 'https://deno.com/feed' },
    ]);
  });

  it('rejects entries that are neither', () => {
    expect(() => parseOfficial('not a feed')).toThrow(/neither a feed URL nor an owner\/repo/);
  });
});

describe('loadConfig', () => {
  it('reads tech-catchup.yml when present and works without it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tc-config-'));
    expect((await loadConfig({}, dir)).language).toBe('en');
    await writeFile(path.join(dir, 'tech-catchup.yml'), 'language: ja\ntopics:\n  neovim: [neovim]\n');
    const c = await loadConfig({ TC_TITLE: 'Hi' }, dir);
    expect(c.language).toBe('ja');
    expect(c.title).toBe('Hi');
    expect(Object.keys(c.topics)).toEqual(['neovim']);
  });

  it('fails when an explicitly named file is missing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tc-config-'));
    await expect(loadConfig({ TECH_CATCHUP_CONFIG: 'nope.yml' }, dir)).rejects.toThrow(/ENOENT/);
  });
});

describe('topic presets', () => {
  it("add topics and official feeds, with the user's own settings winning", () => {
    const c = resolveConfig(
      {
        presets: 'rust, ai',
        topics: { ai: ['claude'] },
        official: ['Rust https://blog.rust-lang.org/feed.xml', 'my/repo'],
      },
      {},
    );
    expect(c.presets).toEqual(['rust', 'ai']);
    expect(c.topics.rust?.keywords.includes('cargo')).toBeTruthy();
    expect(c.topics.ai).toEqual({ weight: 1, keywords: ['claude'] });
    // The same feed URL from the preset and the user appears once, with the user's name
    expect(c.official.feeds.filter((f) => f.url === 'https://blog.rust-lang.org/feed.xml')).toEqual([
      { name: 'Rust', url: 'https://blog.rust-lang.org/feed.xml' },
    ]);
    expect(c.official.releases.includes('rust-lang/rust') && c.official.releases.includes('my/repo')).toBeTruthy();
  });

  it('rejects unknown presets', () => {
    expect(() => resolveConfig({}, { presets: 'cobol' })).toThrow(/unknown preset "cobol"/);
  });

  it('every preset is valid', () => {
    for (const name of PRESET_NAMES) {
      const c = resolveConfig({ presets: [name] }, {});
      expect(Object.keys(c.topics).length > 0, name).toBeTruthy();
      expect(c.official.feeds.length + c.official.releases.length > 0, name).toBeTruthy();
    }
  });
});

describe('docs', () => {
  it('lists every preset in docs/configuration.md', async () => {
    const { readFile } = await import('node:fs/promises');
    const doc = await readFile(new URL('../docs/configuration.md', import.meta.url), 'utf8');
    for (const name of PRESET_NAMES) expect(doc, name).toMatch(new RegExp(`\\| \`${name}\` \\|`));
  });
});

describe('validation of hand-written settings', () => {
  it('lists accept arrays, comma strings and numbers, and nothing else', () => {
    expect(resolveConfig({}, { mute_keywords: 'a, b' }).mute.keywords).toEqual(['a', 'b']);
    expect(resolveConfig({ mute: { keywords: ['a', 42] } }, {}).mute.keywords).toEqual(['a', '42']);
    expect(() => resolveConfig({ mute: { keywords: { a: 1 } } }, {})).toThrow(/mute.keywords: expected a list/);
    expect(() => resolveConfig({ mute: { keywords: [true] } }, {})).toThrow(/every item must be a string/);
    expect(() => resolveConfig({ mute: 'web3' }, {})).toThrow(/mute: expected/);
  });

  it('topics in the full form default to weight 1, and an empty value means none', () => {
    expect(parseTopics({ db: { keywords: ['sql'] } })).toEqual({ db: { weight: 1, keywords: ['sql'] } });
    expect(parseTopics('')).toEqual({});
  });

  it('official feeds written as objects need a URL and may omit the name', () => {
    expect(parseOfficial([{ url: 'https://a.dev/feed' }]).feeds).toEqual([
      { name: undefined, url: 'https://a.dev/feed' },
    ]);
    expect(() => parseOfficial([{ name: 'X', url: 'ftp://a.dev' }])).toThrow(/needs an http\(s\) url/);
  });

  it('layout must be a mapping of non-negative numbers', () => {
    expect(() => resolveConfig({ layout: 5 }, {})).toThrow(/layout: expected a mapping/);
    expect(() => resolveConfig({ layout: [1] }, {})).toThrow(/layout: expected a mapping/);
    expect(() => resolveConfig({ layout: { trending: -1 } }, {})).toThrow(/expected a non-negative number/);
  });

  it('an empty config file is fine, but its top level must be a mapping', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tc-config-'));
    await writeFile(path.join(dir, 'tech-catchup.yml'), '# nothing yet\n');
    expect((await loadConfig({}, dir)).language).toBe('en');
    await writeFile(path.join(dir, 'tech-catchup.yml'), '- language: ja\n');
    await expect(loadConfig({}, dir)).rejects.toThrow(/expected a mapping at the top level/);
  });
});
