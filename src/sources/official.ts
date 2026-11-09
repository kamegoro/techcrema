/** Official sources (no popularity signal): blog RSS/Atom feeds and GitHub releases */

import { parseFeed, parseFeedTitle } from '#src/feed-parser.ts';
import { fetchJson, fetchText, githubHeaders } from '#src/http.ts';
import { domainOf } from '#src/normalize.ts';
import type { RawItem, ReleaseKind } from '#src/types.ts';
import { repoName } from './platforms.ts';

/** Cuts text to `max` characters (not UTF-16 units, so an emoji is never split), ending with "…" when cut */
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : text;
}

/** name is optional; without it the feed's own title (or the host name) is used */
export async function fetchOfficialFeed(name: string | undefined, url: string): Promise<RawItem[]> {
  const xml = await fetchText(url);
  const publisher = name || truncate(parseFeedTitle(xml), 40) || domainOf(url);
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
  body?: string | null;
}

/** Headings that only say "here are the changes" */
const GENERIC_HEADING =
  /^(what'?s (changed|new)|changes|changelog|notable changes|highlights|release notes|features|bug fixes|summary)$/i;
const SUMMARY_LENGTH = 90;

/**
 * The first thing a release says, as plain text: its first specific heading or first list item.
 * e.g. "## 🥟 Run tests with Bun" → "🥟 Run tests with Bun"; "- Added `/foo` to …" → "Added /foo to …"
 */
export function releaseSummary(body: string | null | undefined): string | undefined {
  for (const raw of (body ?? '').split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1];
    const item = line.match(/^[-*]\s+(.+)$/)?.[1];
    const text = (heading ?? item)
      ?.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_]/g, '')
      .trim();
    if (!text || (heading && GENERIC_HEADING.test(text))) continue;
    return truncate(text, SUMMARY_LENGTH);
  }
  return undefined;
}

/** Classifies a release from tags like v1.2.3, 1.2.3 or nvim-0.11.0 */
export function classifyRelease(tag: string): ReleaseKind {
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
  return (
    releases
      // Skip moving tags such as "nightly" or "stable"; they duplicate the versioned releases
      .filter((r) => !r.draft && !r.prerelease && /\d/.test(r.tag_name))
      .map((r) => {
        const summary = releaseSummary(r.body);
        const name = `${repoName(repo)} ${r.name?.trim() || r.tag_name}`;
        return {
          source: 'github_release',
          // A version number alone says nothing about the release, so the title carries its first point
          title: summary ? `${name}: ${summary}` : name,
          url: r.html_url,
          score: null,
          tags: [],
          publishedAt: r.published_at,
          publisher: repo,
          releaseKind: classifyRelease(r.tag_name),
        };
      })
  );
}
