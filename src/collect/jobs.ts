// Everything one run fetches, and running it so one failing source doesn't stop the others.
import type { Log } from '#src/cli.ts';
import type { Config } from '#src/config/config.ts';
import { sanitizeItem } from '#src/ranking/merge.ts';
import { PLATFORMS } from '#src/sources/index.ts';
import { fetchGithubReleases, fetchOfficialFeed } from '#src/sources/official.ts';
import type { Feed, RawItem } from '#src/types.ts';

interface Job {
  label: string;
  run: () => Promise<RawItem[]>;
  /**
   * Whether the scores go into the site's popularity scale. Tag lookups' don't: their small numbers
   * would make every front-page story look more popular than it is.
   */
  calibrates: boolean;
}

/**
 * Stories found under a topic's tag need at least one reaction. In a busy topic the weak ones end up
 * behind "Show more"; in a quiet one they are what there is to read.
 */
const TAG_MIN_SCORE = 1;

async function lookUp(tag: string, find: () => Promise<RawItem[]>): Promise<RawItem[]> {
  const items = await find();
  return items.filter((i) => (i.score ?? 0) >= TAG_MIN_SCORE).map((i) => ({ ...i, lookups: [tag] }));
}

export function fetchJobs(config: Config, now: Date): Job[] {
  const tags = [...new Set(Object.values(config.topics).flatMap((t) => t.tags))];
  const frontPages = config.sources.map((id) => ({
    label: id,
    run: () => PLATFORMS[id].frontPage(now),
    calibrates: true,
  }));
  const tagLookups = config.sources.flatMap((id) => {
    const { byTag } = PLATFORMS[id];
    if (!byTag) return [];
    return tags.map((tag) => ({
      label: `${id} #${tag}`,
      run: () => lookUp(tag, () => byTag(tag, now)),
      calibrates: false,
    }));
  });
  const feeds = config.official.feeds.map((f) => ({
    label: f.name ?? f.url,
    run: () => fetchOfficialFeed(f.name, f.url),
    calibrates: false,
  }));
  const releases = config.official.releases.map((repo) => ({
    label: repo,
    run: () => fetchGithubReleases(repo),
    calibrates: false,
  }));
  return [...frontPages, ...tagLookups, ...feeds, ...releases];
}

export interface Fetched {
  items: RawItem[];
  /** Items whose scores calibrate their site's scale */
  calibrating: RawItem[];
  counts: Record<string, number>;
  errors: Feed['errors'];
}

export async function runJobs(jobs: Job[], log: Log): Promise<Fetched> {
  const fetched: Fetched = { items: [], calibrating: [], counts: {}, errors: [] };
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const items = (await job.run()).flatMap((item) => sanitizeItem(item) ?? []);
        fetched.items.push(...items);
        if (job.calibrates) fetched.calibrating.push(...items);
        fetched.counts[job.label] = items.length;
        log(`  ✓ ${job.label}: ${items.length}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fetched.errors.push({ source: job.label, message });
        log(`  ✗ ${job.label}: ${message}`);
      }
    }),
  );
  return fetched;
}
