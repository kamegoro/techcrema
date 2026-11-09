# Configuration

Everything is optional. With no inputs you get an English page of what's popular across the default sources.

A complete workflow with every common option is in [examples/workflow.yml](../examples/workflow.yml).

| Input | Description | Default |
|---|---|---|
| `language` | `en` or `ja`. Sets the UI language and the default sources | `en` |
| `presets` | Comma-separated ready-made interests (see [Presets](#presets)) | none |
| `topics` | Your own interests, as YAML (see [Topics](#topics)) | none |
| `sources` | Comma-separated ids from [Sources](#sources) | depends on `language` |
| `official` | One per line: an RSS/Atom URL (optionally `Name https://…`), or `owner/repo` for GitHub releases | none |
| `mute-keywords` | Comma-separated keywords to never show | none |
| `mute-domains` | Comma-separated domains to never show (subdomains included) | none |
| `title` | Page title | `TechCrema` |
| `timezone` | IANA time zone that decides when "today" starts | `UTC` (`Asia/Tokyo` for `ja`) |
| `config` | Path to a YAML file with the same settings; inputs override it | `techcrema.yml` if present |
| `deploy` | `false` collects and builds without publishing — handy for trying settings (see the run summary) | `true` |
| `qiita-token` | Optional Qiita token for a higher rate limit | none |
| `cache-key` | Name of the Actions cache that keeps the score history; use a different one per page if one repository builds several | `techcrema-data` |

## Presets

A preset adds a topic with a tested keyword list, plus the official blogs and releases worth following for it.
Combine them freely and add your own `topics` on top; a topic of yours with the same name (e.g. `AI`) replaces the preset's.

```yaml
with:
  presets: frontend, ai
```

| Preset | For | Keywords (some) | Follows |
|---|---|---|---|
| `frontend` | Web front end: frameworks, CSS, browsers | react, vue, svelte, angular, solid.js, css, … | React, web.dev, Chrome for Developers, TypeScript, vitejs/vite releases, vercel/next.js releases |
| `node` | Server-side JavaScript runtimes and tooling | node.js, nodejs, npm, pnpm, yarn, deno, … | Node.js, Deno, Bun, nodejs/node releases |
| `rust` | The Rust language and ecosystem | rust, rustc, cargo, crates.io, tokio, rustacean | Rust Blog, This Week in Rust, rust-lang/rust releases |
| `go` | The Go language | golang, goroutine, goroutines, in go, go modules, go generics | The Go Blog |
| `python` | Python and its tooling | python, cpython, pip, uv, django, fastapi, … | Python Insider, astral-sh/uv releases |
| `ai` | LLMs, agents and machine learning | llm, llms, gpt, chatgpt, claude, gemini, … | OpenAI, Google DeepMind, Hugging Face |
| `devops` | Containers, Kubernetes, CI/CD and operations | kubernetes, k8s, docker, container, containers, terraform, … | Kubernetes, Docker, GitHub Changelog, kubernetes/kubernetes releases |
| `security` | Vulnerabilities, exploits and supply-chain security | security, vulnerability, vulnerabilities, cve, exploit, zero-day, … | Project Zero, GitHub Security Lab |
| `neovim` | Neovim and Vim | neovim, nvim, vim, lua, treesitter, tree-sitter, … | Neovim, neovim/neovim releases |

Missing one? Presets live in [`src/presets.ts`](../src/presets.ts); pull requests are welcome.

## Topics

Each topic gets its own section on the page, in the order you write them, titled with the topic's name.
A story belongs to a topic when its title or tags contain any of the topic's keywords, or it carries one of the topic's tags.

```yaml
topics: |
  Rust: [rust, cargo]                                  # short form, weight 1
  Frontend: react, vue, svelte                         # comma-separated works too
  AI: { weight: 0.8, keywords: [llm, agents, mcp] }    # a story matching AI and Rust goes under Rust
  Node.js: { keywords: [node, npm], tags: [nodejs, node] }
```

- ASCII keywords match whole words: `go` does not match `google`
- Other keywords (Japanese, for example) match anywhere in the text
- Matching ignores case
- A story that matches several topics is listed once, under the one with the highest weight (the first one written, on a tie)

**Tags.** Front pages rarely carry niche topics, so TechCrema also looks each topic up by tag on Zenn, Qiita, dev.to and Lobsters (those in your `sources`), and keeps stories from the last 4 days with at least one reaction. They are ranked with everything else, so in a busy topic the less popular ones end up behind "Show more".
By default the tag is the topic's name (`Node.js` → `nodejs`). Set `tags` to look up others, or `tags: []` to skip the lookup. A name with spaces or non-ASCII characters has no default tag.

## Using a config file

For longer setups, check out your repository and keep the settings in `techcrema.yml` ([example](../techcrema.yml)):

```yaml
steps:
  - uses: actions/checkout@v7
  - id: techcrema
    uses: kamegoro/techcrema@v1 # reads ./techcrema.yml
```

The file also accepts `layout`, which sets how many stories each section shows before "Show more":

```yaml
layout:
  per_topic: 5           # stories per topic
  trending: 5            # "Elsewhere": popular stories outside your topics
  repos: 3
  official_days: 3       # how far back "Official" looks
  max_source_ratio: 0.4  # no platform takes more than 40% of a section, unless nothing else is left
```

`for_you`, `for_you_min_local` and `discover` from v1.0 are still accepted and ignored.

## Sources

| Source | `sources` id | Popularity signal | Default for |
|---|---|---|---|
| [Hacker News](https://news.ycombinator.com) | `hackernews` | points (front page) | `en`, `ja` |
| [Lobsters](https://lobste.rs) | `lobsters` | score | `en`, `ja` |
| [dev.to](https://dev.to) | `devto` | reactions | `en`, `ja` |
| [Hugging Face Papers](https://huggingface.co/papers) | `huggingface` | upvotes | `en`, `ja` |
| [GitHub](https://github.com) (repos created in the last 7 days) | `github` | stars | `en`, `ja` |
| [Hatena Bookmark](https://b.hatena.ne.jp/hotentry/it) | `hatena` | bookmarks | `ja` |
| [Zenn](https://zenn.dev) | `zenn` | likes | `ja` |
| [Qiita](https://qiita.com) | `qiita` | likes | `ja` |
| Any RSS/Atom feed or GitHub releases | via `official` | none (always shown when new) | |

Every source uses an official API, a public JSON endpoint or RSS. Want another one? See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-source).
