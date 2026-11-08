export interface RawItem {
  source: SourceId;
  title: string;
  url: string;
  /** The platform's own discussion page (e.g. HN comments), when it differs from the article URL */
  discussionUrl?: string;
  /** Raw popularity value (points, bookmarks, likes...). null for official sources. */
  score: number | null;
  scoreLabel?: string;
  tags: string[];
  publishedAt: string | null;
  publisher?: string;
  releaseKind?: 'major' | 'minor' | 'patch' | 'other';
}

export type SourceId =
  | 'hackernews'
  | 'hatena'
  | 'zenn'
  | 'qiita'
  | 'devto'
  | 'lobsters'
  | 'huggingface'
  | 'github_new_repos'
  | 'official'
  | 'github_release';

export interface Story {
  key: string;
  url: string;
  title: string;
  domain: string;
  lang: 'ja' | 'en' | 'zh';
  tags: string[];
  publishedAt: string | null;
  appearances: Appearance[];
  /** Popularity 0-1 (highest per-platform percentile plus a cross-posting bonus) */
  pop: number;
  /** Interest 0-1 (highest weight among matched topics) */
  interest: number;
  topics: string[];
  /** Matched keywords (offered as mute suggestions) */
  matchedKeywords: string[];
  publisher?: string;
  releaseKind?: RawItem['releaseKind'];
  /** In the official section: how many newer items from the same publisher were folded in ("+N more") */
  groupedCount?: number;
  /** Shown on an earlier day, back because it kept climbing */
  resurfaced?: boolean;
}

export interface Appearance {
  source: SourceId;
  score: number | null;
  scoreLabel?: string;
  discussionUrl?: string;
  percentile: number | null;
}

export type SectionId = 'official' | 'forYou' | 'trending' | 'discover' | 'repos';

export interface Section {
  id: SectionId;
  /**
   * How many stories to show. `stories` may hold more (spares for mutes);
   * the browser drops muted ones and shows the first `limit`.
   */
  limit: number;
  stories: Story[];
}

export interface Feed {
  generatedAt: string;
  date: string;
  language: 'en' | 'ja';
  title: string;
  /** How many days back the official section looks (shown in its description) */
  officialDays: number;
  sections: Section[];
  errors: { source: string; message: string }[];
}

export interface InterestConfig {
  topics: Record<string, { weight: number; keywords: string[] }>;
}

export interface LayoutConfig {
  official_days: number;
  for_you: number;
  /** Minimum number of stories in the page's language in "For you" */
  for_you_min_local: number;
  trending: number;
  discover: number;
  repos: number;
  max_source_ratio: number;
}
