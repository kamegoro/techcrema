/**
 * Assembles the static site: everything in web/ plus data/feed.json.
 * The result needs no server and can go straight to GitHub Pages.
 * Output goes to dist/ (or TECH_CATCHUP_OUT_DIR).
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, loadFeed, ROOT } from './store.ts';

export const DIST_DIR = path.resolve(process.env.TECH_CATCHUP_OUT_DIR ?? path.join(ROOT, 'dist'));

export async function build(): Promise<void> {
  const feed = await loadFeed();
  if (!feed) throw new Error(`${DATA_DIR}/feed.json not found. Run \`npm run collect\` first.`);
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });
  await cp(path.join(ROOT, 'web'), DIST_DIR, { recursive: true });
  // Only today's page is published. Score history and the seen list stay private.
  await cp(path.join(DATA_DIR, 'feed.json'), path.join(DIST_DIR, 'feed.json'));
}

if (import.meta.main) {
  await build();
  console.log(`Wrote ${DIST_DIR} (check it with \`npm run preview\`)`);
}
