<div align="center">

# ☕ Tech Catchup

**Your daily tech front page, built by a GitHub Action.**

What's popular on Hacker News, Lobsters, dev.to and more, filtered to what you care about.<br>
One page a day, made for your phone. No server, no database, no AI.

<a href="https://github.com/kamegoro/tech-catchup/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/kamegoro/tech-catchup/ci.yml?branch=main&label=CI&logo=github&style=flat"></a>
<a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat"></a>

<img src="docs/demo.gif" alt="Skimming the day's sections, muting a site, saving a story for later and switching to dark mode" width="300" />

</div>

## Why

RSS readers show you everything. Aggregators show you what's popular for everyone.
Tech Catchup shows the overlap: **popular right now _and_ about your topics**, plus a few hits from outside your bubble.

- ⚖️ **Fair across sites**: 300 HN points and 300 Hatena bookmarks don't mean the same thing, so every score becomes a percentile within its own site ([how it works](docs/how-it-works.md))
- 🧭 **Five short sections**: Official releases, For you, Trending, Discover and New repos
- 🔁 **No repeats**: what you saw yesterday stays gone
- 📱 **Phone first**: dark mode, add to home screen, one small JSON file
- 🔇 **Mute and save** right from the page; everything stays in your browser

## Quick start

1. Create a public repository and add `.github/workflows/tech-catchup.yml`:

   ```yaml
   name: Tech Catchup
   on:
     schedule: [{ cron: '0 6 * * *' }]   # daily, 06:00 UTC
     workflow_dispatch:
   permissions: { contents: read, pages: write, id-token: write }
   jobs:
     publish:
       runs-on: ubuntu-latest
       environment: { name: github-pages, url: '${{ steps.catchup.outputs.page_url }}' }
       steps:
         - id: catchup
           uses: kamegoro/tech-catchup@v1
           with:
             topics: |
               rust: [rust, cargo]
               ai: [llm, agents, mcp]
   ```

2. **Settings → Pages → Source: GitHub Actions**
3. **Actions → Tech Catchup → Run workflow**, and open `https://<you>.github.io/<repo>/`

Languages (`en`, `ja`), sources, official blogs, mutes and more: **[configuration](docs/configuration.md)**.

## Contributing

New sources and UI translations are especially welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
