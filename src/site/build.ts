// The static site for GitHub Pages: web/ plus today's feed.json
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '#src/lib/paths.ts';
import { feedPath, loadFeed } from '#src/lib/store.ts';

export const distDir = () => path.resolve(process.env.TECHCREMA_OUT_DIR ?? path.join(ROOT, 'dist'));

export async function build(): Promise<void> {
  const feed = await loadFeed();
  if (!feed) throw new Error(`${feedPath()} not found. Run \`npm run collect\` first.`);
  const out = distDir();
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(path.join(ROOT, 'web'), out, { recursive: true });
  // Only today's page is published; the score history and the seen list stay private
  await cp(feedPath(), path.join(out, 'feed.json'));

  // The language and title go into the HTML itself, so the first paint is right before feed.json loads
  const indexFile = path.join(out, 'index.html');
  await writeFile(indexFile, localizeIndex(await readFile(indexFile, 'utf8'), feed.language, feed.title));
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as const;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c as keyof typeof HTML_ESCAPES]);

export function localizeIndex(html: string, language: string, title: string): string {
  return html
    .replace(/<html lang="[^"]*">/, `<html lang="${escapeHtml(language)}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<h1 class="brand-title">)[^<]*(<\/h1>)/, `$1${escapeHtml(title)}$2`);
}
