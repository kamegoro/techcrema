import { describe, expect, it } from 'vitest';
import { percentile, popularity } from '#src/ranking/popularity.ts';

describe('percentile', () => {
  it('returns the share ranked below (ties count half)', () => {
    expect(percentile(10, [1, 2, 3, 10])).toBe((3 + 0.5) / 4);
    expect(percentile(1, [1, 1])).toBe(0.5);
  });
  it('stays within 0-1 even when the window lacks the score', () => {
    const p = percentile(100, [1, 2, 3]);
    expect(p).toBeGreaterThan(0.8);
    expect(p).toBeLessThan(1);
  });
  it('is 0.5 for an empty window', () => {
    expect(percentile(5, [])).toBe(0.5);
  });
});

describe('popularity', () => {
  it('is the best percentile plus a cross-posting bonus', () => {
    const pop = popularity({
      appearances: [
        { source: 'hackernews', score: 1, percentile: 0.8 },
        { source: 'hatena', score: 1, percentile: 0.6 },
      ],
    });
    expect(Math.round(pop * 100) / 100).toBe(0.85);
  });
  it('never exceeds 1', () => {
    const pop = popularity({
      appearances: [
        { source: 'hackernews', score: 1, percentile: 0.99 },
        { source: 'hatena', score: 1, percentile: 0.99 },
      ],
    });
    expect(pop).toBe(1);
  });
  it('is 0 without any popularity signal', () => {
    expect(popularity({ appearances: [{ source: 'official', score: null, percentile: null }] })).toBe(0);
  });
});
