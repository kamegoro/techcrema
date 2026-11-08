/** 各情報源から取ってきた1件。正規化前の生データに近い形。 */
export interface RawItem {
  source: SourceId;
  title: string;
  url: string;
  /** プラットフォーム上の議論ページ(HNのコメント欄など)。リンク先と別の場合のみ。 */
  discussionUrl?: string;
  /** 人気指標の生の値(points, ブクマ数, いいね数など)。公式情報はnull。 */
  score: number | null;
  /** 人気指標の単位(表示用) */
  scoreLabel?: string;
  tags: string[];
  publishedAt: string | null;
  /** 公式枠のときの発信元名(Node.js, microsoft/playwright など) */
  publisher?: string;
  /** GitHubリリースのとき、パッチリリースかどうか */
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

export const SOURCE_LABELS: Record<SourceId, string> = {
  hackernews: 'HN',
  hatena: 'はてブ',
  zenn: 'Zenn',
  qiita: 'Qiita',
  devto: 'dev.to',
  lobsters: 'Lobsters',
  huggingface: 'HF Papers',
  github_new_repos: 'GitHub',
  official: '公式',
  github_release: 'Release',
};

/** 同じURLの記事を1枚にまとめたもの */
export interface Story {
  key: string;
  url: string;
  title: string;
  domain: string;
  lang: 'ja' | 'en' | 'zh';
  tags: string[];
  publishedAt: string | null;
  /** プラットフォームごとの出現(バッジ表示用) */
  appearances: Appearance[];
  /** 人気度 0〜1(各プラットフォーム内パーセンタイルの最大 + 複数出現ボーナス) */
  pop: number;
  /** 関心度 0〜1(当たったトピックの重みの最大) */
  interest: number;
  /** 当たったトピック名 */
  topics: string[];
  /** 当たったキーワード(ミュート候補の提示用) */
  matchedKeywords: string[];
  publisher?: string;
  releaseKind?: RawItem['releaseKind'];
  /** 公式枠で同じ発信元の他の新着をまとめたときの件数(「ほかN件」) */
  groupedCount?: number;
  /** 前日以前に表示済みだが、さらに伸びたので再表示している */
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
  title: string;
  description: string;
  /**
   * 表示する件数。stories はミュート用の予備を含めてこれより多いことがあり、
   * ブラウザがミュートを除いたうえで先頭から limit 件を表示する。
   */
  limit: number;
  stories: Story[];
}

export interface Feed {
  generatedAt: string;
  date: string;
  sections: Section[];
  errors: { source: string; message: string }[];
}

export interface InterestConfig {
  topics: Record<string, { weight: number; keywords: string[] }>;
  mute: { keywords: string[]; domains: string[] };
}

export interface LayoutConfig {
  official_days: number;
  for_you: number;
  for_you_min_japanese: number;
  trending: number;
  discover: number;
  repos: number;
  max_source_ratio: number;
}

export interface SourcesConfig {
  platforms: Record<string, { enabled: boolean }>;
  official_feeds: { name: string; url: string }[];
  github_releases: string[];
  layout: LayoutConfig;
}
