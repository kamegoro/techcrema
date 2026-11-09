import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '#src/http.ts';
import {
  fetchDevto,
  fetchGithubNewRepos,
  fetchHackerNews,
  fetchHatena,
  fetchHuggingFace,
  fetchLobsters,
  fetchQiita,
  fetchZenn,
  TAG_FETCHERS,
} from '#src/sources/platforms.ts';

vi.mock('#src/http.ts', () => ({
  fetchJson: vi.fn(),
  fetchText: vi.fn(),
  githubHeaders: () => ({ Accept: 'application/vnd.github+json' }),
}));

const json = vi.mocked(fetchJson);
const now = new Date('2026-11-08T09:00:00Z');

beforeEach(() => {
  json.mockReset();
  vi.mocked(fetchText).mockReset();
});

describe('fetchHackerNews', () => {
  it('links to the article, and to the discussion when the post has no link', async () => {
    json.mockResolvedValue({
      hits: [
        { objectID: '1', title: 'Link post', url: 'https://a.dev/x', points: 300, created_at: '2026-11-08T00:00:00Z' },
        { objectID: '2', title: 'Ask HN: y', url: null, points: 50, created_at: '2026-11-08T01:00:00Z' },
      ],
    });
    const [link, ask] = await fetchHackerNews();
    expect(link).toMatchObject({
      url: 'https://a.dev/x',
      discussionUrl: 'https://news.ycombinator.com/item?id=1',
      score: 300,
    });
    expect(ask).toMatchObject({ url: 'https://news.ycombinator.com/item?id=2', discussionUrl: undefined });
  });
});

describe('fetchHatena', () => {
  it('reads bookmark counts and drops the "Technology" category every entry has', async () => {
    vi.mocked(fetchText).mockResolvedValue(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
        <item><title>A</title><link>https://a.dev/x</link><dc:subject>&#x30C6;&#x30AF;&#x30CE;&#x30ED;&#x30B8;&#x30FC;</dc:subject>
          <dc:subject>neovim</dc:subject><hatena:bookmarkcount>185</hatena:bookmarkcount></item>
      </rdf:RDF>`);
    expect(await fetchHatena()).toEqual([
      expect.objectContaining({
        score: 185,
        tags: ['neovim'],
        discussionUrl: 'https://b.hatena.ne.jp/entry/s/a.dev/x',
      }),
    ]);
  });

  it('links http articles to the comment page without the /s/ prefix', async () => {
    vi.mocked(fetchText).mockResolvedValue(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
        <item><title>B</title><link>http://b.dev/y</link></item>
      </rdf:RDF>`);
    expect((await fetchHatena())[0]?.discussionUrl).toBe('https://b.hatena.ne.jp/entry/b.dev/y');
  });
});

describe('fetchZenn', () => {
  it('tags idea posts', async () => {
    json.mockResolvedValue({
      articles: [
        { title: 'Tech', path: '/u/articles/a', liked_count: 10, published_at: 'p', article_type: 'tech' },
        { title: 'Idea', path: '/u/articles/b', liked_count: 5, published_at: 'p', article_type: 'idea' },
      ],
    });
    const [tech, idea] = await fetchZenn();
    expect(tech).toMatchObject({ url: 'https://zenn.dev/u/articles/a', tags: [] });
    expect(idea?.tags).toEqual(['idea']);
  });
});

describe('fetchQiita', () => {
  const item = { title: 'Q', url: 'https://qiita.com/q', likes_count: 3, created_at: 'c', tags: [{ name: 'Rust' }] };

  it('asks for recent, saved articles and keeps their tags', async () => {
    json.mockResolvedValue([item]);
    expect(await fetchQiita(now)).toEqual([expect.objectContaining({ score: 3, tags: ['Rust'] })]);
    expect(json).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('created:>2026-11-05 stocks:>2')), {});
  });

  it('sends the token when one is set', async () => {
    vi.stubEnv('QIITA_TOKEN', 'secret');
    json.mockResolvedValue([]);
    await fetchQiita(now);
    expect(json).toHaveBeenCalledWith(expect.any(String), { Authorization: 'Bearer secret' });
  });
});

describe('fetchDevto', () => {
  it('treats a missing tag list as no tags', async () => {
    json.mockResolvedValue([
      { title: 'D', url: 'https://dev.to/d', public_reactions_count: 9, published_timestamp: 'p', tag_list: ['ai'] },
      { title: 'E', url: 'https://dev.to/e', public_reactions_count: 1, published_timestamp: 'p', tag_list: null },
    ]);
    const [withTags, without] = await fetchDevto();
    expect(withTags?.tags).toEqual(['ai']);
    expect(without?.tags).toEqual([]);
  });

  it("leaves out dev.to's own challenges, chat threads and site news", async () => {
    const post = (title: string, tags: string[]) => ({
      title,
      url: `https://dev.to/${title}`,
      public_reactions_count: 50,
      published_timestamp: 'p',
      tag_list: tags,
    });
    json.mockResolvedValue([post('pets', ['watercooler']), post('news', ['meta']), post('rust', ['rust'])]);
    expect((await fetchDevto()).map((a) => a.title)).toEqual(['rust']);
  });
});

describe('fetchLobsters', () => {
  it('uses the comments page for text posts', async () => {
    const base = { score: 20, created_at: 'c', tags: ['rust'], comments_url: 'https://lobste.rs/s/x' };
    json.mockResolvedValue([
      { ...base, title: 'Link', url: 'https://a.dev/x' },
      { ...base, title: 'Text', url: '' },
    ]);
    const [link, text] = await fetchLobsters();
    expect(link).toMatchObject({ url: 'https://a.dev/x', discussionUrl: 'https://lobste.rs/s/x' });
    expect(text).toMatchObject({ url: 'https://lobste.rs/s/x', discussionUrl: undefined });
  });
});

describe('fetchHuggingFace', () => {
  it('links to the paper page', async () => {
    json.mockResolvedValue([{ title: 'P', publishedAt: 'p', paper: { id: '2611.0001', upvotes: 42 } }]);
    expect(await fetchHuggingFace()).toEqual([
      expect.objectContaining({ url: 'https://huggingface.co/papers/2611.0001', score: 42 }),
    ]);
  });
});

describe('fetchGithubNewRepos', () => {
  it('titles repos with their description and tags them with their topics only', async () => {
    const base = { html_url: 'https://github.com/a/b', stargazers_count: 100, created_at: 'c' };
    json.mockResolvedValue({
      items: [
        { ...base, full_name: 'a/b', description: 'A tool', topics: ['cli'] },
        { ...base, full_name: 'a/c', description: 'Another tool' },
      ],
    });
    const [described, untagged] = await fetchGithubNewRepos(now);
    expect(described).toMatchObject({ title: 'a/b — A tool', tags: ['cli'] });
    expect(untagged).toMatchObject({ title: 'a/c — Another tool', tags: [] });
    expect(json).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('created:>2026-11-01')), {
      Accept: 'application/vnd.github+json',
    });
  });

  it('drops repos with no description, a description that repeats the name, or a known lure', async () => {
    const base = { html_url: 'https://github.com/x/y', stargazers_count: 400, created_at: 'c' };
    json.mockResolvedValue({
      items: [
        { ...base, full_name: 'x/none', description: null },
        { ...base, full_name: 'x/blank', description: '  ' },
        { ...base, full_name: 'x/Free_Pro_Auto', description: 'Free_Pro_Auto' },
        { ...base, full_name: 'x/capcut', description: 'Capcut 2026 pre-configured environment for video editing' },
        { ...base, full_name: 'x/opt', description: 'Optimizer automated deployment pipeline for desktops' },
        { ...base, full_name: 'x/real', description: 'A real project' },
      ],
    });
    expect((await fetchGithubNewRepos(now)).map((r) => r.title)).toEqual(['x/real — A real project']);
  });
});

describe('TAG_FETCHERS', () => {
  const zenn = (liked: number) => ({
    title: `Z${liked}`,
    path: `/u/articles/${liked}`,
    liked_count: liked,
    published_at: 'p',
    article_type: 'tech',
  });

  it('Zenn: asks for the topic by its slug, drops posts nobody liked and adds the tag', async () => {
    json.mockResolvedValue({ articles: [zenn(12), zenn(0)] });
    expect(await TAG_FETCHERS.zenn('Node.js', now)).toEqual([
      expect.objectContaining({ score: 12, tags: [], lookups: ['Node.js'] }),
    ]);
    expect(json).toHaveBeenCalledWith('https://zenn.dev/api/articles?topicname=nodejs&order=latest&count=30');
  });

  it('skips tags that have no letters or digits to look up', async () => {
    expect(await TAG_FETCHERS.zenn('テスト', now)).toEqual([]);
    expect(json).not.toHaveBeenCalled();
  });

  it('Qiita: searches the tag as written, within the last few days', async () => {
    json.mockResolvedValue([
      { title: 'Q', url: 'https://qiita.com/q', likes_count: 5, created_at: 'c', tags: [{ name: 'Node.js' }] },
      { title: 'R', url: 'https://qiita.com/r', likes_count: 0, created_at: 'c', tags: [] },
    ]);
    expect(await TAG_FETCHERS.qiita('Node.js', now)).toEqual([
      expect.objectContaining({ title: 'Q', tags: ['Node.js'], lookups: ['Node.js'] }),
    ]);
    expect(json).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('tag:Node.js created:>2026-11-04')),
      {},
    );
  });

  it('drops looked-up stories without a reaction count', async () => {
    json.mockResolvedValue([{ title: 'D', url: 'https://dev.to/d', published_timestamp: 'p', tag_list: ['node'] }]);
    expect(await TAG_FETCHERS.devto('node', now)).toEqual([]);
  });

  it("dev.to: asks for the tag's top posts of the last few days", async () => {
    json.mockResolvedValue([
      { title: 'D', url: 'https://dev.to/d', public_reactions_count: 9, published_timestamp: 'p', tag_list: ['node'] },
    ]);
    expect(await TAG_FETCHERS.devto('node', now)).toEqual([expect.objectContaining({ score: 9 })]);
    expect(json).toHaveBeenCalledWith('https://dev.to/api/articles?tag=node&top=4&per_page=30');
  });

  it('Lobsters: only asks for tags it has, fetching its tag list once', async () => {
    const story = {
      title: 'L',
      url: 'https://a.dev/l',
      score: 7,
      created_at: 'c',
      tags: ['java'],
      comments_url: 'https://lobste.rs/s/l',
    };
    json.mockImplementation(async (url: string) => (url.endsWith('tags.json') ? [{ tag: 'java' }] : [story]));
    expect(await TAG_FETCHERS.lobsters('Java', now)).toEqual([expect.objectContaining({ title: 'L' })]);
    expect(await TAG_FETCHERS.lobsters('e2e', now)).toEqual([]);
    expect(json.mock.calls.map(([url]) => url)).toEqual([
      'https://lobste.rs/tags.json',
      'https://lobste.rs/t/java.json',
    ]);
  });
});
