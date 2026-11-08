/** Settings: language defaults ← optional YAML file ← action inputs (TC_* variables), plus topic presets */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PRESET_NAMES, PRESETS_BY_NAME, type PresetName } from './presets.ts';
import type { LayoutConfig } from './types.ts';

export const LANGUAGES = ['en', 'ja'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Sources with a popularity signal. `github` = new repositories gaining stars. */
export const PLATFORMS = [
  'hackernews',
  'lobsters',
  'devto',
  'huggingface',
  'github',
  'hatena',
  'zenn',
  'qiita',
] as const;
export type PlatformId = (typeof PLATFORMS)[number];

export interface Topic {
  weight: number;
  keywords: string[];
}

export interface Config {
  language: Language;
  presets: PresetName[];
  title: string;
  /** IANA time zone used to decide what "today" is */
  timezone: string;
  sources: PlatformId[];
  topics: Record<string, Topic>;
  mute: { keywords: string[]; domains: string[] };
  /** Official blogs (RSS/Atom) and GitHub releases, shown regardless of popularity */
  official: { feeds: { name?: string; url: string }[]; releases: string[] };
  layout: LayoutConfig;
}

const BASE_LAYOUT: LayoutConfig = {
  official_days: 3,
  for_you: 10,
  for_you_min_local: 0,
  trending: 5,
  discover: 3,
  repos: 3,
  max_source_ratio: 0.4,
};

export const LANGUAGE_DEFAULTS: Record<Language, Config> = {
  en: {
    language: 'en',
    presets: [],
    title: 'Tech Catchup',
    timezone: 'UTC',
    sources: ['hackernews', 'lobsters', 'devto', 'huggingface', 'github'],
    topics: {},
    mute: { keywords: [], domains: [] },
    official: { feeds: [], releases: [] },
    layout: BASE_LAYOUT,
  },
  ja: {
    language: 'ja',
    presets: [],
    title: 'Tech Catchup',
    timezone: 'Asia/Tokyo',
    sources: ['hatena', 'zenn', 'qiita', 'hackernews', 'lobsters', 'devto', 'huggingface', 'github'],
    topics: {},
    mute: { keywords: [], domains: [] },
    official: { feeds: [], releases: [] },
    // Keep at least 3 Japanese articles in "For you" even when HN dominates
    layout: { ...BASE_LAYOUT, for_you_min_local: 3 },
  },
};

export class ConfigError extends Error {}

// Parsing helpers. Inputs come from people's YAML and workflow files, so every
// value is checked and errors say exactly which setting is wrong.
/** "a, b\nc" or ["a", "b"] → ["a", "b", "c"] */
export function list(value: unknown, field: string): string[] {
  if (value === undefined || value === null || value === '') return [];
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : null;
  if (!items) throw new ConfigError(`${field}: expected a list or a comma-separated string`);
  return items
    .map((v) => {
      if (typeof v !== 'string' && typeof v !== 'number')
        throw new ConfigError(`${field}: every item must be a string`);
      return String(v).trim();
    })
    .filter(Boolean);
}

function parseLanguage(value: unknown): Language {
  const v = String(value).trim().toLowerCase();
  if (!(LANGUAGES as readonly string[]).includes(v)) {
    throw new ConfigError(`language: "${value}" is not supported (use one of: ${LANGUAGES.join(', ')})`);
  }
  return v as Language;
}

export function parseSources(value: unknown): PlatformId[] {
  const ids = list(value, 'sources').map((s) => s.toLowerCase());
  for (const id of ids) {
    if (!(PLATFORMS as readonly string[]).includes(id)) {
      throw new ConfigError(`sources: unknown source "${id}" (available: ${PLATFORMS.join(', ')})`);
    }
  }
  return [...new Set(ids)] as PlatformId[];
}

/**
 * topics accepts both a short and a full form:
 *   rust: [rust, cargo]                 # weight 1
 *   rust: rust, cargo
 *   rust: { weight: 0.8, keywords: [rust, cargo] }
 */
function parseTopic(def: unknown, field: string): Topic {
  if (!def || typeof def !== 'object' || Array.isArray(def)) return { weight: 1, keywords: list(def, field) };
  const d = def as { weight?: unknown; keywords?: unknown };
  const weight = d.weight === undefined ? 1 : Number(d.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 1) {
    throw new ConfigError(`${field}.weight: expected a number between 0 and 1`);
  }
  return { weight, keywords: list(d.keywords, `${field}.keywords`) };
}

export function parseTopics(value: unknown): Record<string, Topic> {
  if (value === undefined || value === null || value === '') return {};
  const raw = typeof value === 'string' ? parseYaml(value) : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('topics: expected a mapping like "rust: [rust, cargo]"');
  }
  const topics: Record<string, Topic> = {};
  for (const [name, def] of Object.entries(raw as Record<string, unknown>)) {
    const field = `topics.${name}`;
    const topic = parseTopic(def, field);
    if (topic.keywords.length === 0) throw new ConfigError(`${field}: needs at least one keyword`);
    topics[name] = topic;
  }
  return topics;
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * official accepts a list of:
 *   https://example.com/feed.xml          # RSS/Atom; name taken from the feed
 *   Node.js https://nodejs.org/feed.xml   # with a display name
 *   { name: Node.js, url: https://... }
 *   nodejs/node                           # GitHub releases
 */
export function parseOfficial(value: unknown): Config['official'] {
  const result: Config['official'] = { feeds: [], releases: [] };
  const entries = Array.isArray(value) ? value : list(value, 'official');
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      const e = entry as { name?: unknown; url?: unknown };
      if (typeof e.url !== 'string' || !/^https?:\/\//.test(e.url)) {
        throw new ConfigError(`official: "${JSON.stringify(entry)}" needs an http(s) url`);
      }
      result.feeds.push({ name: typeof e.name === 'string' ? e.name : undefined, url: e.url });
      continue;
    }
    const text = String(entry).trim();
    const url = text.match(/https?:\/\/\S+$/)?.[0];
    if (url) {
      const name = text.slice(0, -url.length).trim();
      result.feeds.push({ name: name || undefined, url });
    } else if (REPO_PATTERN.test(text)) {
      result.releases.push(text);
    } else {
      throw new ConfigError(`official: "${text}" is neither a feed URL nor an owner/repo`);
    }
  }
  return result;
}

export function parsePresets(value: unknown): PresetName[] {
  const names = list(value, 'presets').map((s) => s.toLowerCase());
  for (const name of names) {
    if (!(PRESET_NAMES as string[]).includes(name)) {
      throw new ConfigError(`presets: unknown preset "${name}" (available: ${PRESET_NAMES.join(', ')})`);
    }
  }
  return [...new Set(names)] as PresetName[];
}

function parseTimezone(value: unknown): string {
  const tz = String(value).trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw new ConfigError(`timezone: "${tz}" is not a valid IANA time zone (e.g. America/New_York)`);
  }
  return tz;
}

function parseLayout(value: unknown, base: LayoutConfig): LayoutConfig {
  if (value === undefined || value === null) return base;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ConfigError('layout: expected a mapping');
  const layout = { ...base };
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!(key in base))
      throw new ConfigError(`layout.${key}: unknown setting (available: ${Object.keys(base).join(', ')})`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new ConfigError(`layout.${key}: expected a non-negative number`);
    layout[key as keyof LayoutConfig] = n;
  }
  return layout;
}

/** Settings as written by a person (YAML file or action inputs). Everything is optional. */
export type ConfigSource = Partial<
  Record<'language' | 'presets' | 'title' | 'timezone' | 'sources' | 'topics' | 'official' | 'layout', unknown>
> & {
  mute?: unknown;
  mute_keywords?: unknown;
  mute_domains?: unknown;
};

const isSet = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/** preset(language) ← file ← inputs. Later layers win field by field. */
export function resolveConfig(file: ConfigSource, inputs: ConfigSource): Config {
  const pick = (key: keyof ConfigSource) =>
    isSet(inputs[key]) ? inputs[key] : isSet(file[key]) ? file[key] : undefined;

  const language = parseLanguage(pick('language') ?? 'en');
  const defaults = LANGUAGE_DEFAULTS[language];
  const fileMute = (file.mute ?? {}) as { keywords?: unknown; domains?: unknown };
  if (typeof fileMute !== 'object') throw new ConfigError('mute: expected { keywords: [...], domains: [...] }');

  const presets = parsePresets(pick('presets'));
  const title = pick('title');
  const timezone = pick('timezone');
  const sources = pick('sources');
  const topics = pick('topics');
  const official = pick('official');
  // Presets go first, so the user's own topics (same name) and feeds win
  const presetTopics = Object.assign({}, ...presets.map((p) => PRESETS_BY_NAME[p].topics)) as Record<string, Topic>;
  const presetOfficial = parseOfficial(presets.flatMap((p) => PRESETS_BY_NAME[p].official));
  const ownOfficial = official === undefined ? defaults.official : parseOfficial(official);
  const feedsByUrl = new Map([...presetOfficial.feeds, ...ownOfficial.feeds].map((f) => [f.url, f]));

  return {
    language,
    presets,
    title: title === undefined ? defaults.title : String(title).trim().slice(0, 80),
    timezone: timezone === undefined ? defaults.timezone : parseTimezone(timezone),
    sources: sources === undefined ? defaults.sources : parseSources(sources),
    topics: { ...presetTopics, ...(topics === undefined ? defaults.topics : parseTopics(topics)) },
    mute: {
      keywords: [...list(fileMute.keywords, 'mute.keywords'), ...list(inputs.mute_keywords, 'mute-keywords')],
      domains: [...list(fileMute.domains, 'mute.domains'), ...list(inputs.mute_domains, 'mute-domains')],
    },
    official: {
      feeds: [...feedsByUrl.values()],
      releases: [...new Set([...presetOfficial.releases, ...ownOfficial.releases])],
    },
    layout: parseLayout(file.layout, defaults.layout),
  };
}

/** Action inputs arrive as environment variables set in action.yml. */
export function inputsFromEnv(env: NodeJS.ProcessEnv): ConfigSource {
  return {
    language: env.TC_LANGUAGE,
    presets: env.TC_PRESETS,
    title: env.TC_TITLE,
    timezone: env.TC_TIMEZONE,
    sources: env.TC_SOURCES,
    topics: env.TC_TOPICS,
    official: env.TC_OFFICIAL,
    mute_keywords: env.TC_MUTE_KEYWORDS,
    mute_domains: env.TC_MUTE_DOMAINS,
  };
}

/**
 * Reads the YAML file at TECH_CATCHUP_CONFIG (or ./tech-catchup.yml if present)
 * and applies action inputs on top.
 */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Promise<Config> {
  const explicit = env.TECH_CATCHUP_CONFIG?.trim();
  const file = path.resolve(cwd, explicit || 'tech-catchup.yml');
  let parsed: ConfigSource = {};
  try {
    const raw = parseYaml(await readFile(file, 'utf8')) as unknown;
    if (raw !== null && raw !== undefined) {
      if (typeof raw !== 'object' || Array.isArray(raw))
        throw new ConfigError(`${file}: expected a mapping at the top level`);
      parsed = raw as ConfigSource;
    }
  } catch (err) {
    // The file is optional unless it was named explicitly
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || explicit) throw err;
  }
  return resolveConfig(parsed, inputsFromEnv(env));
}
