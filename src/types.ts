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
  releaseKind?: ReleaseKind;
  /** Topic tags this item was found under, when it came from a tag lookup */
  lookups?: string[];
}

export type ReleaseKind = 'major' | 'minor' | 'patch' | 'other';

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
  /** Matched topics, heaviest first; the story is listed under the first one */
  topics: string[];
  /** Matched keywords (offered as mute suggestions) */
  matchedKeywords: string[];
  /** A keyword of its first topic is in the title itself, not only in the tags */
  titleMatch?: boolean;
  /** Topic tags this story was found under by tag lookups */
  lookups?: string[];
  publisher?: string;
  releaseKind?: ReleaseKind;
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

/** One section per topic (`topic-0`, `topic-1`, … in the order they are configured) */
export type SectionId = 'official' | 'trending' | 'repos' | `topic-${number}`;

export interface Section {
  id: SectionId;
  /** Topic sections are titled with the topic's name; the others are translated in the browser */
  title?: string;
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

export interface Topic {
  weight: number;
  keywords: string[];
  /** Tags looked up on Zenn, Qiita, dev.to and Lobsters; a story with one of them belongs to the topic */
  tags: string[];
}

export interface InterestConfig {
  topics: Record<string, Topic>;
}

export interface LayoutConfig {
  official_days: number;
  /** Stories shown per topic before "Show more" */
  per_topic: number;
  trending: number;
  repos: number;
  max_source_ratio: number;
}

/** When a story was first shown on the page, and how popular it was the last time it was */
export interface SeenEntry {
  date: string;
  pop: number;
}

/** Scores by source, e.g. { hackernews: [312, 95, …] } */
export type ScoreSnapshot = Record<string, number[]>;
