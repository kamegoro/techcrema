/** 公式情報(人気指標なし): 公式ブログのRSS/AtomとGitHubリリース */
import { fetchJson, fetchText, githubHeaders } from '../http.ts';
import { parseFeed } from '../feed-parser.ts';
import type { RawItem } from '../types.ts';

export async function fetchOfficialFeed(name: string, url: string): Promise<RawItem[]> {
  const xml = await fetchText(url);
  return parseFeed(xml).map((e) => ({
    source: 'official',
    title: e.title,
    url: e.link,
    score: null,
    tags: e.categories,
    publishedAt: e.publishedAt,
    publisher: name,
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

/** v1.2.3 / 1.2.3 / nvim-0.11.0 などからリリースの種類を判定する */
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
    // "nightly" や "stable" のような動くタグは、バージョン付きのリリースと重複するので除く
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
