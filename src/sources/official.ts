// Sources with no popularity signal, shown whenever they have something new: blog feeds and GitHub releases.
import { discoverFeed, isHtmlPage, parseFeed, parseFeedTitle } from '#src/lib/feed-parser.ts';
import { fetchJson, fetchText, githubHeaders } from '#src/lib/http.ts';
import { truncate } from '#src/lib/text.ts';
import { domainOf } from '#src/lib/url.ts';
import type { RawItem, ReleaseKind } from '#src/types.ts';
import { repoName } from './github.ts';

/** A blog's own address works too: its page names its feed */
async function fetchFeedBody(url: string): Promise<{ body: string; feedUrl: string }> {
  const body = await fetchText(url);
  if (!isHtmlPage(body)) return { body, feedUrl: url };
  const feedUrl = discoverFeed(body, url);
  if (!feedUrl)
    throw new Error(`${url} is a web page with no feed link in it; use the address of its RSS or Atom feed`);
  return { body: await fetchText(feedUrl), feedUrl };
}

/** Without a `name`, the feed's own title (or its host) names the publisher */
export async function fetchOfficialFeed(name: string | undefined, url: string): Promise<RawItem[]> {
  const { body, feedUrl } = await fetchFeedBody(url);
  const publisher = name || truncate(parseFeedTitle(body), 40) || domainOf(url);
  return parseFeed(body, feedUrl).map((e) => ({
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
