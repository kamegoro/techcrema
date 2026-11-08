# Contributing to Tech Catchup

Thanks for your interest! Bug reports, new sources, UI translations and docs fixes are all welcome.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or later. TypeScript files run directly, with no build step.
- Optional, only for re-recording the README demo: Google Chrome and [ffmpeg](https://ffmpeg.org/)

```sh
git clone https://github.com/kamegoro/tech-catchup.git
cd tech-catchup
npm install
```

### Everyday commands

```sh
npm run check     # type check (tsc) + tests (node --test) — what CI runs
npm run collect   # fetch real data using ./tech-catchup.yml
npm run build     # assemble dist/
npm run preview   # serve dist/ at http://localhost:8787
```

Try a different configuration without editing `tech-catchup.yml`, through the same environment variables the action uses:

```sh
TC_LANGUAGE=en TC_TOPICS='rust: [rust, cargo]' TECH_CATCHUP_DATA_DIR=/tmp/tc-data npm run collect
TECH_CATCHUP_DATA_DIR=/tmp/tc-data npm run build && npm run preview
```

Please don't run `collect` in a tight loop: every run makes real requests to every source.

### Regenerating the demo GIF and screenshots

```sh
npm run demo -- dist docs
```

`scripts/demo.mjs` serves the built site, drives Chrome with Playwright and captures 2x frames through the DevTools screencast, then ffmpeg turns them into `docs/demo.gif`. Keep the GIF under ~5 MB.

## Project layout

```
action.yml            The GitHub Action (composite): install → collect → build → deploy to Pages
src/config.ts         Presets, YAML file and action inputs → one validated Config
src/collect.ts        The pipeline: fetch → merge → score → sections → feed.json
src/sources/          One fetcher per source (platforms.ts) plus RSS feeds and GitHub releases (official.ts)
src/normalize.ts      URL normalization, merging the same story across platforms, language detection
src/rank.ts           Percentiles, interest matching, mutes, section building
src/http.ts           Polite fetch: per-host queue, delays, timeouts, size limits
src/build.ts          web/ + feed.json → static site
web/                  The page: vanilla JS, no framework, no build
web/i18n.js           UI strings for every language
test/                 node:test unit tests
```

## Adding a source

A source must have a **popularity signal** (points, likes, stars…) and an **official API, public JSON endpoint or RSS feed**. We don't scrape HTML, and we don't add sources whose terms forbid automated access.

1. Write a fetcher in `src/sources/platforms.ts` that returns `RawItem[]`: title, url, `score`, a short `scoreLabel` (`'pt'`, `'likes'`…) and `publishedAt`. Set `discussionUrl` when the platform has its own comment page.
2. Add its id to `SourceId` in `src/types.ts`, `PLATFORMS` in `src/config.ts`, and `PLATFORM_FETCHERS` in `src/collect.ts`.
3. If it should be on by default for a language, add it to that preset in `PRESETS`.
4. If the host asks for a crawl delay (check its `robots.txt`), add it to `HOST_INTERVAL_MS` in `src/http.ts`.
5. Add a badge label in `SOURCE_LABELS` in `web/app.js` and a color in `web/style.css` (`.badge[data-source='…']`).
6. Add a parsing test with a small fixture in `test/sources.test.ts`, and a row to the Sources table in the README.

## Adding a UI language

1. Copy the `en` block in `web/i18n.js` and translate every key.
2. Add the code to `LANGUAGES` and a preset to `PRESETS` in `src/config.ts`, including the sources that make sense for that audience.
3. Add the language to the README's `language` input.

## Pull requests

- Open an issue first for anything bigger than a small fix, so we can agree on the approach.
- Add or update tests with your change. Run `npm run check` before pushing.
- Write commit messages, code comments and docs in English.
- Keep runtime dependencies to a minimum; the project currently has two.
- If you change what the page looks like, include a screenshot in the PR (phone width and dark mode, please).

## Code style

- TypeScript with only erasable syntax (no `enum`, no `namespace`, no parameter properties), so Node.js can run it directly.
- In `web/`, put outside text into the DOM with `textContent` only. Never use `innerHTML` for data from feeds.
- Treat every value from a source as untrusted: check types, keep only http(s) URLs, and cap sizes.
