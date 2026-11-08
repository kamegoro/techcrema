import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { build, distDir, localizeIndex } from '../src/build.ts';
import { ROOT, saveFeed } from '../src/store.ts';
import type { Feed } from '../src/types.ts';

let out: string;

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'tc-build-'));
  out = path.join(tmp, 'site');
  vi.stubEnv('TECH_CATCHUP_DATA_DIR', path.join(tmp, 'data'));
  vi.stubEnv('TECH_CATCHUP_OUT_DIR', out);
});

describe('build', () => {
  it('needs a collected feed', async () => {
    await expect(build()).rejects.toThrow(/feed\.json not found/);
  });

  it('publishes the page and feed.json, with the language and title baked in', async () => {
    await saveFeed({ language: 'ja', title: 'Morning <Reads>', sections: [] } as unknown as Feed);
    await build();
    expect((await readdir(out)).sort()).toEqual((await readdir(path.join(ROOT, 'web'))).concat('feed.json').sort());
    const html = await readFile(path.join(out, 'index.html'), 'utf8');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<title>Morning &lt;Reads&gt;</title>');
  });

  it('replaces whatever an earlier build left behind', async () => {
    await saveFeed({ language: 'en', title: 'T', sections: [] } as unknown as Feed);
    await build();
    await build();
    expect(await readdir(out)).toContain('feed.json');
  });
});

describe('distDir', () => {
  it('defaults to dist/ in the project', () => {
    vi.stubEnv('TECH_CATCHUP_OUT_DIR', undefined);
    expect(distDir()).toBe(path.join(ROOT, 'dist'));
  });
});

describe('localizeIndex', () => {
  it('escapes every HTML special character', () => {
    const html = '<html lang="en"><title>x</title><h1 class="brand-title">x</h1>';
    expect(localizeIndex(html, 'en', `&<>"'`)).toContain('<h1 class="brand-title">&amp;&lt;&gt;&quot;&#39;</h1>');
  });
});
