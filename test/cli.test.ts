import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { build, distDir } from '#src/build.ts';
import { run } from '#src/cli.ts';
import { runCollect } from '#src/collect.ts';
import { startStaticServer } from '#src/preview.ts';

vi.mock('#src/build.ts', () => ({ build: vi.fn(), distDir: vi.fn(() => '/out/dist') }));
vi.mock('#src/collect.ts', () => ({ runCollect: vi.fn(async () => 7) }));
vi.mock('#src/preview.ts', () => ({
  startStaticServer: vi.fn(async (site: { base: string }, port: number) => ({
    url: `http://127.0.0.1:${port}${site.base}`,
  })),
}));

describe('run', () => {
  it('collect returns the exit code of the collection', async () => {
    const env = { TC_LANGUAGE: 'en' };
    const log = vi.fn();
    expect(await run(['collect'], log, env)).toBe(7);
    expect(runCollect).toHaveBeenCalledWith(env, log);
  });

  it('build assembles the site and says where', async () => {
    const log = vi.fn();
    expect(await run(['build'], log)).toBe(0);
    expect(build).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Wrote the site to /out/dist');
  });

  it('preview serves dist/ on port 8787 by default', async () => {
    const log = vi.fn();
    expect(await run(['preview'], log, {})).toBe(0);
    expect(startStaticServer).toHaveBeenCalledWith({ root: path.resolve(distDir()), base: '/' }, 8787);
    expect(log).toHaveBeenCalledWith('Preview: http://127.0.0.1:8787/');
  });

  it('preview takes a directory, base path and port from flags or PORT', async () => {
    await run(['preview', '--dir', 'web', '--base', '/techcrema/', '--port', '4173'], vi.fn(), {});
    expect(startStaticServer).toHaveBeenLastCalledWith({ root: path.resolve('web'), base: '/techcrema/' }, 4173);
    await run(['preview'], vi.fn(), { PORT: '9000' });
    expect(startStaticServer).toHaveBeenLastCalledWith(expect.anything(), 9000);
  });

  it('prints usage and fails for an unknown or missing command', async () => {
    const log = vi.fn();
    expect(await run(['deploy'], log)).toBe(1);
    expect(await run([], log)).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Usage:/));
  });

  it('logs to the console by default', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await run(['build']);
    expect(consoleLog).toHaveBeenCalledWith('Wrote the site to /out/dist');
  });
});
