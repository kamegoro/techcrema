/**
 * Ready-made interests: `presets: frontend, ai` adds a topic with sensible keywords
 * plus the official blogs and GitHub releases worth following for it.
 * Every feed here is checked weekly by the smoke test (examples/smoke.yml uses all presets).
 */
import type { Topic } from './config.ts';

export interface Preset {
  description: string;
  topics: Record<string, Topic>;
  /** Same format as the `official` option: "Name https://feed" or "owner/repo" */
  official: string[];
}

const topic = (keywords: string[], weight = 1): Topic => ({ weight, keywords });

export const PRESETS_BY_NAME = {
  frontend: {
    description: 'Web front end: frameworks, CSS, browsers',
    topics: {
      frontend: topic(['react', 'vue', 'svelte', 'angular', 'solid.js', 'css', 'html', 'javascript', 'typescript', 'vite', 'next.js', 'nextjs', 'tailwind', 'web components', 'webassembly', 'web platform']),
    },
    official: [
      'React https://react.dev/rss.xml',
      'web.dev https://web.dev/feed.xml',
      'Chrome for Developers https://developer.chrome.com/static/blog/feed.xml',
      'TypeScript https://devblogs.microsoft.com/typescript/feed/',
      'vitejs/vite',
      'vercel/next.js',
    ],
  },
  node: {
    description: 'Server-side JavaScript runtimes and tooling',
    topics: {
      node: topic(['node.js', 'nodejs', 'npm', 'pnpm', 'yarn', 'deno', 'bun', 'v8', 'javascript runtime']),
    },
    official: ['Node.js https://nodejs.org/en/feed/blog.xml', 'Deno https://deno.com/feed', 'Bun https://bun.sh/rss.xml', 'nodejs/node'],
  },
  rust: {
    description: 'The Rust language and ecosystem',
    topics: { rust: topic(['rust', 'rustc', 'cargo', 'crates.io', 'tokio', 'rustacean']) },
    official: ['Rust Blog https://blog.rust-lang.org/feed.xml', 'This Week in Rust https://this-week-in-rust.org/rss.xml', 'rust-lang/rust'],
  },
  go: {
    description: 'The Go language',
    // "go" alone matches far too many English titles, so match phrases instead
    topics: { go: topic(['golang', 'goroutine', 'goroutines', 'in go', 'go modules', 'go generics']) },
    official: ['The Go Blog https://go.dev/blog/feed.atom'],
  },
  python: {
    description: 'Python and its tooling',
    topics: { python: topic(['python', 'cpython', 'pip', 'uv', 'django', 'fastapi', 'flask', 'pandas', 'numpy', 'pydantic']) },
    official: ['Python Insider https://blog.python.org/feeds/posts/default', 'astral-sh/uv'],
  },
  ai: {
    description: 'LLMs, agents and machine learning',
    topics: {
      // Not plain "ai": dev.to tags nearly every post with it, which would flood "For you"
      ai: topic(['llm', 'llms', 'gpt', 'chatgpt', 'claude', 'gemini', 'openai', 'anthropic', 'ai agent', 'ai agents', 'agentic', 'mcp', 'rag', 'genai', 'generative ai', 'ai model', 'ai models', 'ai coding', 'machine learning', 'deep learning', 'fine-tuning']),
    },
    official: [
      'OpenAI https://openai.com/news/rss.xml',
      'Google DeepMind https://deepmind.google/blog/rss.xml',
      'Hugging Face https://huggingface.co/blog/feed.xml',
    ],
  },
  devops: {
    description: 'Containers, Kubernetes, CI/CD and operations',
    topics: {
      devops: topic(['kubernetes', 'k8s', 'docker', 'container', 'containers', 'terraform', 'opentofu', 'github actions', 'ci/cd', 'observability', 'opentelemetry', 'sre', 'incident', 'postmortem']),
    },
    official: [
      'Kubernetes https://kubernetes.io/feed.xml',
      'Docker https://www.docker.com/blog/feed/',
      'GitHub Changelog https://github.blog/changelog/feed/',
      'kubernetes/kubernetes',
    ],
  },
  security: {
    description: 'Vulnerabilities, exploits and supply-chain security',
    topics: {
      security: topic(['security', 'vulnerability', 'vulnerabilities', 'cve', 'exploit', 'zero-day', '0day', 'malware', 'ransomware', 'supply chain', 'supply-chain', 'backdoor', 'xss', 'rce']),
    },
    official: [
      'Project Zero https://googleprojectzero.blogspot.com/feeds/posts/default',
      'GitHub Security Lab https://github.blog/tag/github-security-lab/feed/',
    ],
  },
  neovim: {
    description: 'Neovim and Vim',
    topics: { neovim: topic(['neovim', 'nvim', 'vim', 'lua', 'treesitter', 'tree-sitter', 'lsp']) },
    official: ['Neovim https://neovim.io/news.xml', 'neovim/neovim'],
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof PRESETS_BY_NAME;
export const PRESET_NAMES = Object.keys(PRESETS_BY_NAME) as PresetName[];
