<div align="center">

# ☕ TechCrema

**Your daily tech front page, built by a GitHub Action.**

What's popular on Hacker News, Lobsters, dev.to and more, filtered to what you care about.<br>
One page a day, made for your phone. No server, no database, no AI.

**[Live demo](https://kamegoro.github.io/techcrema/)**

<a href="https://github.com/kamegoro/techcrema/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/kamegoro/techcrema/ci.yml?branch=main&label=CI&logo=github&style=flat"></a>
<a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat"></a>

<img src="docs/demo.gif" alt="Jumping to a topic, showing more of it, muting a site, saving a story for later and switching to dark mode" width="300" />

</div>

## Why

RSS readers show you everything. Aggregators show you what's popular for everyone.
TechCrema shows the overlap: **popular right now _and_ about your topics**, one section per topic, plus a few hits from outside your bubble.

- ⚖️ **Fair across sites**: 300 HN points and 300 Hatena bookmarks don't mean the same thing, so every score becomes a percentile within its own site ([how it works](docs/how-it-works.md))
- 🧭 **A section per topic**: your topics are the table of contents, each with its best stories and a "Show more"
- 🔎 **Goes looking for your topics**: besides the front pages, it checks each topic's tag on Zenn, Qiita, dev.to and Lobsters, so niche topics still turn up
- 🔁 **No repeats, no gaps**: a story stays for two days, so a day you skip loses nothing, and what you already read moves aside
- 💬 **What people said**: under a story, a couple of comments from its discussion (the top ones on Hacker News or Lobsters; on Japanese pages, Hatena Bookmark comments first), so you know what's in it before you open it
- 🌐 **Titles in your language**: in desktop Chrome and Edge, a title in another language gets a translated line under it, and comments are translated too, done by the browser on your device. Elsewhere, the browser's own "Translate" works on them
- 📱 **Phone first**: dark mode, add to home screen, one small JSON file
- 🔇 **Mute and save** right from the page; everything stays in your browser

## Quick start

1. Create a public repository and add `.github/workflows/techcrema.yml`:

   ```yaml
   name: TechCrema
   on:
     schedule: [{ cron: '0 6 * * *' }]   # daily, 06:00 UTC
     workflow_dispatch:
   permissions: { contents: read, pages: write, id-token: write }
   jobs:
     publish:
       runs-on: ubuntu-latest
       environment: { name: github-pages, url: '${{ steps.techcrema.outputs.page_url }}' }
       steps:
         - id: techcrema
           uses: kamegoro/techcrema@v1
           with:
             presets: frontend, ai   # or write your own topics, see below
   ```

2. **Settings → Pages → Source: GitHub Actions**
3. **Actions → TechCrema → Run workflow**, and open `https://<you>.github.io/<repo>/`

## Examples

Everything goes under `with:` in the workflow above.

**Your own topics** — each one gets a section; a story whose title or tags contain a keyword lands in it:

```yaml
topics: |
  Rust: [rust, cargo]
  Databases: [postgres, sqlite, duckdb]
```

**Follow releases and blogs, hide what you don't want:**

```yaml
presets: devops
official: |
  https://blog.rust-lang.org/feed.xml
  astral-sh/uv
mute-keywords: crypto, nft
```

**A Japanese page** — Hatena Bookmark, Zenn, Qiita and slides from Speaker Deck and Docswell join the sources:

```yaml
language: ja
presets: ai, frontend
timezone: Asia/Tokyo
```

**Keep settings in a file** — add `- uses: actions/checkout@v7` before the step, and put the same keys in [`techcrema.yml`](techcrema.yml).

All options: **[docs/configuration.md](docs/configuration.md)** · How ranking works: **[docs/how-it-works.md](docs/how-it-works.md)**

## Contributing

New sources and UI translations are especially welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
