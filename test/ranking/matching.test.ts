import { describe, expect, it } from 'vitest';
import { interestScorer, keywordMatcher, muteFilter } from '#src/ranking/matching.ts';
import type { InterestConfig } from '#src/types.ts';

describe('keywordMatcher', () => {
  it('matches ASCII keywords as whole words', () => {
    expect(keywordMatcher('go')('Go 1.30 released')).toBe(true);
    expect(keywordMatcher('go')('Google announces')).toBe(false);
    expect(keywordMatcher('node.js')('Node.js 27')).toBe(true);
    expect(keywordMatcher('claude code')('Using Claude Code daily')).toBe(true);
  });
  it('matches Japanese keywords as substrings', () => {
    expect(keywordMatcher('テスト')('E2Eテストの書き方')).toBe(true);
  });
  it('never matches an empty keyword', () => {
    expect(keywordMatcher('  ')('anything')).toBe(false);
  });
});

describe('interestScorer', () => {
  const config: InterestConfig = {
    topics: {
      em: { weight: 0.7, keywords: ['1on1'], tags: [] },
      neovim: { weight: 1, keywords: ['neovim', 'lua'], tags: [] },
      node: { weight: 1, keywords: ['npm'], tags: ['node.js'] },
    },
  };
  it('returns the highest weight, listing the heaviest topic first', () => {
    const r = interestScorer(config)({ title: 'Neovim で 1on1 メモ', tags: [] });
    expect(r.interest).toBe(1);
    expect(r.topics).toEqual(['neovim', 'em']);
    expect(r.matchedKeywords).toEqual(['1on1', 'neovim']);
  });
  it('keeps the configured order between topics of the same weight', () => {
    expect(interestScorer(config)({ title: 'Neovim and npm', tags: [] }).topics).toEqual(['neovim', 'node']);
  });
  it('also looks at tags', () => {
    expect(interestScorer(config)({ title: 'Plugin tips', tags: ['Lua'] }).interest).toBe(1);
  });
  it('counts a story a tag lookup found under the topic, however the tag is spelled', () => {
    const r = interestScorer(config)({ title: 'Release notes', tags: [], lookups: ['NodeJS'] });
    expect(r.topics).toEqual(['node']);
    expect(r.matchedKeywords).toEqual([]);
    expect(r.titleMatch).toBe(false);
  });
  it("ignores a front-page story's own tags unless a keyword matches them", () => {
    expect(interestScorer(config)({ title: 'Release notes', tags: ['NodeJS'] }).topics).toEqual([]);
  });
  it('says whether a keyword of the first topic is in the title', () => {
    expect(interestScorer(config)({ title: 'Neovim tips', tags: [] }).titleMatch).toBe(true);
    expect(interestScorer(config)({ title: 'Plugin tips', tags: ['lua'] }).titleMatch).toBe(false);
  });
  it('is 0 when nothing matches', () => {
    expect(interestScorer(config)({ title: 'Rust news', tags: [] }).interest).toBe(0);
  });
});

describe('muteFilter', () => {
  const isMuted = muteFilter({ keywords: ['crypto'], domains: ['example.org'] });
  it('mutes by keyword', () => {
    expect(isMuted({ title: 'Crypto winter', tags: [], domain: 'a.com' })).toBe(true);
  });
  it('mutes a domain and its subdomains', () => {
    expect(isMuted({ title: 'x', tags: [], domain: 'blog.example.org' })).toBe(true);
    expect(isMuted({ title: 'x', tags: [], domain: 'notexample.org' })).toBe(false);
  });
});
