import { utcDateDaysAgo } from '#src/lib/dates.ts';
import { fetchJson, githubHeaders } from '#src/lib/http.ts';
import type { Platform, RawItem } from '#src/types.ts';

interface GithubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  topics?: string[];
  created_at: string;
}

/** "owner/name" → "name" */
export const repoName = (fullName: string) => fullName.slice(fullName.indexOf('/') + 1);

/**
 * New-repo rankings are full of bought stars: repos promising a "pre-configured environment" for some
 * paid app (malware lures), and repos whose description is missing or only repeats the name.
 */
const LURE_DESCRIPTION = /pre-?configured (environment|production build)|automated deployment pipeline/i;

function realDescription(repo: GithubRepo): string | null {
  const description = repo.description?.trim();
  if (!description || description === repoName(repo.full_name) || LURE_DESCRIPTION.test(description)) return null;
  return description;
}

async function newRepos(now: Date): Promise<RawItem[]> {
  const query = encodeURIComponent(`created:>${utcDateDaysAgo(7, now)}`);
  const data = await fetchJson<{ items: GithubRepo[] }>(
    `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=50`,
    githubHeaders(),
  );
  return data.items.flatMap((repo) => {
    const description = realDescription(repo);
    if (!description) return [];
    return {
      source: 'github_new_repos',
      title: `${repo.full_name} — ${description}`,
      url: repo.html_url,
      score: repo.stargazers_count,
      scoreLabel: '★',
      // Topics, not the language: every TypeScript repo would otherwise match a "typescript" topic
      tags: repo.topics ?? [],
      publishedAt: repo.created_at,
    };
  });
}

export const github: Platform = { frontPage: newRepos };
