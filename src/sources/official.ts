/** Official sources (no popularity signal): blog RSS/Atom feeds and GitHub releases */
import { fetchJson, fetchText, githubHeaders } from '../http.ts';
import { parseFeed, parseFeedTitle } from '../feed-parser.ts';
import { domainOf } from '../normalize.ts';
import type { RawItem } from '../types.ts';

/** name is optional; without it the feed's own title (or the host name) is used */
export async function fetchOfficialFeed(name: string | undefined, url: string): Promise<RawItem[]> {
  const xml = await fetchText(url);
  const publisher = name || parseFeedTitle(xml).slice(0, 40) || domainOf(url);
  return parseFeed(xml).map((e) => ({
    source: 'official',
    title: e.title,
    url: e.link,
    score: null,
    tags: e.categories,
    publishedAt: e.publishedAt,
    publisher,
  }));
}

interface GithubRelease {
  name: string | null;
  tag_name: string;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
}

/** Classifies a release from tags like v1.2.3, 1.2.3 or nvim-0.11.0 */
export function classifyRelease(tag: string): RawItem['releaseKind'] {
  const m = tag.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return 'other';
  const minor = Number(m[2]);
  const patch = m[3] === undefined ? 0 : Number(m[3]);
  if (patch > 0) return 'patch';
  if (minor > 0) return 'minor';
  return 'major';
}

export async function fetchGithubReleases(repo: string): Promise<RawItem[]> {
  const releases = await fetchJson<GithubRelease[]>(
    `https://api.github.com/repos/${repo}/releases?per_page=10`,
    githubHeaders(),
  );
  return releases
    // Skip moving tags such as "nightly" or "stable"; they duplicate the versioned releases
    .filter((r) => !r.draft && !r.prerelease && /\d/.test(r.tag_name))
    .map((r) => ({
      source: 'github_release',
      title: `${repo.split('/')[1]} ${r.name?.trim() || r.tag_name}`,
      url: r.html_url,
      score: null,
      tags: [],
      publishedAt: r.published_at,
      publisher: repo,
      releaseKind: classifyRelease(r.tag_name),
    }));
}
