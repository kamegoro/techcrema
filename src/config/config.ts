/** Settings: language defaults ← optional YAML file ← action inputs (TC_* variables), plus topic presets */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { LayoutConfig, Topic } from '#src/types.ts';
import { PRESET_NAMES, PRESETS_BY_NAME, type PresetName } from './presets.ts';

export const LANGUAGES = ['en', 'ja'] as const;
export type Language = (typeof LANGUAGES)[number];

/** `github` means new repositories gaining stars */
export const PLATFORM_IDS = [
  'hackernews',
  'devto',
  'huggingface',
  'github',
  'hatena',
  'zenn',
  'qiita',
  'slides',
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface Config {
  language: Language;
  presets: PresetName[];
  title: string;
  /** IANA name; decides what "today" is */
  timezone: string;
  sources: PlatformId[];
  topics: Record<string, Topic>;
  mute: { keywords: string[]; domains: string[] };
  official: { feeds: { name?: string; url: string }[]; releases: string[] };
  layout: LayoutConfig;
}

const BASE_LAYOUT: LayoutConfig = {
  official_days: 3,
  per_topic: 5,
  trending: 5,
  repos: 3,
  max_source_ratio: 0.4,
};

/** Layout settings from v1.0 that no longer exist; still accepted so older config files keep working */
const RETIRED_LAYOUT_KEYS = new Set(['for_you', 'for_you_min_local', 'discover']);
/** Sources that were dropped (Lobsters asks bots other than search engines to stay away); still accepted and skipped */
const RETIRED_SOURCES = new Set(['lobsters']);

const LANGUAGE_DEFAULTS: Record<Language, Config> = {
  en: {
    language: 'en',
    presets: [],
    title: 'TechCrema',
    timezone: 'UTC',
    sources: ['hackernews', 'devto', 'huggingface', 'github'],
    topics: {},
    mute: { keywords: [], domains: [] },
    official: { feeds: [], releases: [] },
    layout: BASE_LAYOUT,
  },
  ja: {
    language: 'ja',
    presets: [],
    title: 'TechCrema',
    timezone: 'Asia/Tokyo',
    sources: ['hatena', 'zenn', 'qiita', 'slides', 'hackernews', 'devto', 'huggingface', 'github'],
    topics: {},
    mute: { keywords: [], domains: [] },
    official: { feeds: [], releases: [] },
    layout: BASE_LAYOUT,
  },
};

export class ConfigError extends Error {}

// Settings are written by people, so every value is checked and an error names the setting that is wrong
/** "a, b\nc" or ["a", "b"] → ["a", "b", "c"] */
function list(value: unknown, field: string): string[] {
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

function parseSources(value: unknown): PlatformId[] {
  const ids = list(value, 'sources')
    .map((s) => s.toLowerCase())
    .filter((s) => !RETIRED_SOURCES.has(s));
  for (const id of ids) {
    if (!(PLATFORM_IDS as readonly string[]).includes(id)) {
      throw new ConfigError(`sources: unknown source "${id}" (available: ${PLATFORM_IDS.join(', ')})`);
    }
  }
  return [...new Set(ids)] as PlatformId[];
}

/** A topic is looked up by its own name as a tag ("Node.js" → nodejs), unless the name has spaces or non-ASCII */
function defaultTags(name: string): string[] {
  return /^[\x21-\x7e]+$/.test(name) ? [name.toLowerCase()] : [];
}

/**
 * topics accepts both a short and a full form:
 *   Rust: [rust, cargo]                 # weight 1, tags [rust]
 *   Rust: rust, cargo
 *   Rust: { weight: 0.8, keywords: [rust, cargo], tags: [rust, cargo] }
 */
function parseTopic(name: string, def: unknown, field: string): Topic {
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    return { weight: 1, keywords: list(def, field), tags: defaultTags(name) };
  }
  const d = def as { weight?: unknown; keywords?: unknown; tags?: unknown };
  const weight = d.weight === undefined ? 1 : Number(d.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 1) {
    throw new ConfigError(`${field}.weight: expected a number between 0 and 1`);
  }
  const tags = d.tags === undefined ? defaultTags(name) : list(d.tags, `${field}.tags`).map((t) => t.toLowerCase());
  return { weight, keywords: list(d.keywords, `${field}.keywords`), tags };
}

export function parseTopics(value: unknown): Record<string, Topic> {
  if (value === undefined || value === null || value === '') return {};
  const raw = typeof value === 'string' ? parseYaml(value) : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('topics: expected a mapping like "rust: [rust, cargo]"');
  }
  // fromEntries defines own properties, so a topic named "__proto__" can't change the object's prototype
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([name, def]) => {
      const field = `topics.${name}`;
      const topic = parseTopic(name, def, field);
      if (topic.keywords.length === 0) throw new ConfigError(`${field}: needs at least one keyword`);
      return [name, topic];
    }),
  );
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

function parsePresets(value: unknown): PresetName[] {
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
    if (RETIRED_LAYOUT_KEYS.has(key)) continue;
    if (!Object.hasOwn(base, key))
      throw new ConfigError(`layout.${key}: unknown setting (available: ${Object.keys(base).join(', ')})`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new ConfigError(`layout.${key}: expected a non-negative number`);
    layout[key as keyof LayoutConfig] = n;
  }
  return layout;
}

/** As written in the YAML file or the action inputs; everything is optional */
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
  const rawMute = file.mute ?? {};
  if (typeof rawMute !== 'object' || rawMute === null || Array.isArray(rawMute)) {
    throw new ConfigError('mute: expected { keywords: [...], domains: [...] }');
  }
  const fileMute: { keywords?: unknown; domains?: unknown } = rawMute;

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

/** action.yml passes the inputs as environment variables */
function inputsFromEnv(env: NodeJS.ProcessEnv): ConfigSource {
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

/** The YAML file at TECHCREMA_CONFIG (or ./techcrema.yml when there is one), with the action inputs on top */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Promise<Config> {
  const explicit = env.TECHCREMA_CONFIG?.trim();
  const file = path.resolve(cwd, explicit || 'techcrema.yml');
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
