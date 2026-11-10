// Popularity is a percentile within each site, so 300 HN points and 300 Hatena bookmarks land on one scale.
import type { Story } from '#src/types.ts';

const MULTI_SITE_BONUS = 0.05;

/**
 * Where `score` sits within `window`, from 0 to 1, ties counting half.
 * e.g. the top story out of 60 → (59 + 0.5) / 60 ≈ 0.99
 */
export function percentile(score: number, window: readonly number[] = []): number {
  if (window.length === 0) return 0.5;
  let less = 0;
  let equal = 0;
  for (const v of window) {
    if (v < score) less++;
    else if (v === score) equal++;
  }
  // A score missing from the window counts itself in, so the top score still stays below 1
  if (equal === 0) return (less + 0.5) / (window.length + 1);
  return (less + equal / 2) / window.length;
}

/** The best percentile among the sites listing the story, plus a little for each extra site */
export function popularity(story: Pick<Story, 'appearances'>): number {
  const percentiles = story.appearances.flatMap((a) => a.percentile ?? []);
  if (percentiles.length === 0) return 0;
  return Math.min(1, Math.max(...percentiles) + MULTI_SITE_BONUS * (percentiles.length - 1));
}
