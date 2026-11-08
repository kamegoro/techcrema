/**
 * Assembles the static site: everything in web/ plus data/feed.json.
 * The result needs no server and can go straight to GitHub Pages.
 * Output goes to dist/ (or TECH_CATCHUP_OUT_DIR).
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

  // Bake the language and title into the HTML so the first paint is right before feed.json loads
  const indexFile = path.join(DIST_DIR, 'index.html');
  await writeFile(indexFile, localizeIndex(await readFile(indexFile, 'utf8'), feed.language, feed.title));
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function localizeIndex(html: string, language: string, title: string): string {
  return html
    .replace(/<html lang="[^"]*">/, `<html lang="${escapeHtml(language)}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<h1 class="brand-title">)[^<]*(<\/h1>)/, `$1${escapeHtml(title)}$2`);
}

if (import.meta.main) {
  await build();
  console.log(`Wrote the site to ${DIST_DIR}`);
}
