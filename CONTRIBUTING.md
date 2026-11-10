# Contributing to TechCrema

Thanks for your interest! Bug reports, new sources, UI translations and docs fixes are all welcome.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or later. TypeScript files run directly, with no build step.
- Optional, only for re-recording the README demo: Google Chrome and [ffmpeg](https://ffmpeg.org/)

```sh
git clone https://github.com/kamegoro/techcrema.git
cd techcrema
npm install
```

### Everyday commands

```sh
npm run check     # Biome lint + type check + unit tests with the 100% coverage gate (the CI "check" job)
npm run format    # apply Biome formatting and safe fixes
npm run e2e       # browser tests (Playwright: iPhone/WebKit, Android/Chromium, desktop)
npm run collect   # fetch real data using ./techcrema.yml
npm run build     # assemble dist/
npm run preview   # serve dist/ at http://localhost:8787
```

Unit tests run on [Vitest](https://vitest.dev/) and must cover every line, branch, function and statement in `src/`. If a branch can't be reached, remove it rather than excluding it.

Try a different configuration without editing `techcrema.yml`, through the same environment variables the action uses:

```sh
TC_LANGUAGE=en TC_PRESETS=rust TECHCREMA_DATA_DIR=/tmp/tc-data npm run collect
TECHCREMA_DATA_DIR=/tmp/tc-data npm run build && npm run preview
```

Please don't run `collect` in a tight loop: every run makes real requests to every source.

### Browser tests

`e2e/` runs the real page in WebKit and Chromium at phone and desktop sizes, without network access: each test serves its own `feed.json`. Install the browsers once with `npx playwright install chromium webkit`.

The suite is layered like a Gauge project:

- `e2e/support/semantic.ts` finds elements only by ARIA role and accessible name, the way a screen reader does
- `e2e/support/reader.ts` is the reader's vocabulary ("mute the site of a story", "Read later holds …"); each method is a step in the report
- specs are split into what a page shows (`display.spec.ts`) and one file per feature

Assert on the accessibility tree (`toMatchAriaSnapshot`, roles and names), never on CSS classes, and use only auto-waiting assertions. Retries are off: a flaky test is a bug.

A weekly [smoke test](.github/workflows/smoke.yml) runs the action itself against the live sources, so a changed API fails loudly.

### Regenerating the demo GIF and screenshots

```sh
npm run demo -- dist docs
```

`scripts/demo.ts` serves the built site, drives Chrome with Playwright and captures 2x frames through the DevTools screencast, then ffmpeg turns them into `docs/demo.gif`. Keep the GIF under ~5 MB.

## Project layout

The collector keeps its calculations apart from everything that touches the outside world. `src/ranking/` is plain functions on data, so most of the logic is tested without mocks; fetching, files and the clock stay in `src/collect/`, `src/sources/` and `src/lib/`. Folders are named after what they do.

```
action.yml          The GitHub Action (composite): install → collect → build → deploy to Pages
src/bin.ts, cli.ts  Command line: collect, build, preview
src/types.ts        Shared types: RawItem, Story, Section, Feed…
src/collect/        One run: fetch jobs → merge → rank → sections → comments → feed.json, and the Actions summary
src/config/         Language defaults, YAML file and action inputs → one validated Config; topic presets
src/sources/        One file per site (front page and tag lookup), official feeds and releases, comments
src/ranking/        Merging the same story across sites, percentiles, topic matching and mutes, sections
src/site/           web/ + feed.json → static site; the static server for previews and tests
src/lib/            Polite HTTP, feed parsing, the data files, dates, text and URLs
web/                The page: plain ES modules, no framework, no build step
  app.js            Holds the feed and the reader's state; turns taps into changes
  story.js          One story: title, translation, comments, sources, buttons; redrawn in place
  pages.js          Header, Today, Read later and Muted
  feed.js, state.js Fetching the feed and what to show; the reader's saved state
test/               Vitest unit tests, mirroring src/
e2e/                Playwright browser tests: specs read as steps from e2e/support/reader.ts
```

## Adding a source

A source must have a **popularity signal** (points, likes, stars…) and an **official API, public JSON endpoint or RSS feed**. We don't scrape HTML, and we don't add sources whose terms forbid automated access.

1. Add `src/sources/<site>.ts` exporting a `Platform`: `frontPage(now)` returns `RawItem[]` (title, url, `score`, a short `scoreLabel` such as `'pt'` or `'likes'`, `publishedAt`, and `discussionUrl` when the site has its own comment page). Add `byTag(tag, now)` if the site can list stories by tag.
2. Add its id to `SourceId` in `src/types.ts`, `PLATFORM_IDS` in `src/config/config.ts`, and `PLATFORMS` in `src/sources/index.ts`.
3. If it should be on by default for a language, add it to that language in `LANGUAGE_DEFAULTS` in `src/config/config.ts`.
4. If the host asks for a crawl delay (check its `robots.txt`), add it to `HOST_INTERVAL_MS` in `src/lib/http.ts`.
5. Add its name in `SITE_NAMES` in `web/story.js` and a color in `web/style.css` (`.source[data-source="…"]`).
6. Add `test/sources/<site>.test.ts` with a small response fixture, and a row to the Sources table in [docs/configuration.md](docs/configuration.md#sources).

## Adding a UI language

1. Copy the `en` block in `web/i18n.js` and translate every key.
2. Add the code to `LANGUAGES` and defaults to `LANGUAGE_DEFAULTS` in `src/config/config.ts`, including the sources that make sense for that audience.
3. Add the language to the `language` row in [docs/configuration.md](docs/configuration.md).

## Dependency updates

Dependabot opens weekly pull requests for npm packages and GitHub Actions (grouped, and only for releases at least three days old), plus security fixes. [A workflow](.github/workflows/dependabot-auto-merge.yml) merges them once every CI job has passed on the exact commit, so the test suite is what guards these updates.

## Pull requests

- Open an issue first for anything bigger than a small fix, so we can agree on the approach.
- Add or update tests with your change; `npm run check` and `npm run e2e` must pass.
- Write commit messages, code comments and docs in English.
- Keep runtime dependencies to a minimum; the project currently has two.
- If you change what the page looks like, include a screenshot in the PR (phone width and dark mode, please).

## Code style

- TypeScript with only erasable syntax (no `enum`, no `namespace`, no parameter properties), so Node.js can run it directly.
- In `web/`, put outside text into the DOM with `textContent` only. Never use `innerHTML` for data from feeds.
- Treat every value from a source as untrusted: check types, keep only http(s) URLs, and cap sizes.
