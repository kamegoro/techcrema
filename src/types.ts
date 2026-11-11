import type { Lang } from './lib/text.ts';

/** A site with a popularity signal: its front page, and optionally its stories under a tag */
export interface Platform {
  frontPage(now: Date): Promise<RawItem[]>;
  byTag?(tag: string, now: Date): Promise<RawItem[]>;
}

export interface RawItem {
  source: SourceId;
  title: string;
  url: string;
  /** The site's own comment page, when it isn't the article itself */
  discussionUrl?: string;
  /** Points, bookmarks, likes…; null for official sources */
  score: number | null;
  scoreLabel?: string;
  tags: string[];
  publishedAt: string | null;
  publisher?: string;
  releaseKind?: ReleaseKind;
  /** The topic tags it was found under */
  lookups?: string[];
}

export type ReleaseKind = 'major' | 'minor' | 'patch' | 'other';

export type SourceId =
  | 'hackernews'
  | 'hatena'
  | 'slides'
  | 'zenn'
  | 'qiita'
  | 'devto'
  | 'huggingface'
  | 'github_new_repos'
  | 'official'
  | 'github_release';

export interface Story {
  key: string;
  url: string;
  title: string;
  domain: string;
  lang: Lang;
  tags: string[];
  publishedAt: string | null;
  appearances: Appearance[];
  /** Popularity 0-1 (highest per-platform percentile plus a cross-posting bonus) */
  pop: number;
  /** Interest 0-1 (highest weight among matched topics) */
  interest: number;
  /** Matched topics, heaviest first; the story is listed under the first one */
  topics: string[];
  /** Offered as mute suggestions */
  matchedKeywords: string[];
  /** A keyword of its first topic is in the title itself, not only in the tags */
  titleMatch?: boolean;
  lookups?: string[];
  publisher?: string;
  releaseKind?: ReleaseKind;
  /** In the official section: how many newer items from the same publisher were folded in ("+N more") */
  groupedCount?: number;
  /** Shown on an earlier day, back because it kept climbing */
  resurfaced?: boolean;
  voices?: Voices;
}

/** A couple of comments from a story's discussion, so the page shows what people make of it */
export interface Voices {
  source: 'hackernews' | 'hatena';
  /** How many comments or bookmarks the discussion has in all */
  count: number;
  url: string;
  comments: Comment[];
}

/** Only a part of the comment, credited to its author and linking to the whole of it */
export interface Comment {
  text: string;
  lang: Story['lang'];
  author: string;
  url: string;
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
  /** The repository publishing the page ("owner/name"): whom to ask about what it shows */
  repository?: string;
  sections: Section[];
  errors: { source: string; message: string }[];
}

export interface Topic {
  weight: number;
  keywords: string[];
  /** Looked up on the sites that can search by tag; a story found under one belongs to the topic */
  tags: string[];
}

export interface InterestConfig {
  topics: Record<string, Topic>;
}

export interface LayoutConfig {
  official_days: number;
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
