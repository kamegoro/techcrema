import path from 'node:path';
import { parseArgs } from 'node:util';
import { build, distDir } from './build.ts';
import { runCollect } from './collect.ts';
import { startStaticServer } from './preview.ts';

export type Log = (message: string) => void;

const USAGE = `Usage:
  tech-catchup collect                                   fetch and rank; writes feed.json
  tech-catchup build                                     assemble the static site
  tech-catchup preview [--dir DIR] [--base PATH] [--port N]  serve a built site locally`;

/** Runs one command and returns the exit code */
export async function run(
  args: string[],
  log: Log = console.log,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const [command, ...rest] = args;
  switch (command) {
    case 'collect':
      return runCollect(env, log);
    case 'build':
      await build();
      log(`Wrote the site to ${distDir()}`);
      return 0;
    case 'preview': {
      const { values } = parseArgs({
        args: rest,
        options: { dir: { type: 'string' }, base: { type: 'string' }, port: { type: 'string' } },
      });
      const site = { root: path.resolve(values.dir ?? distDir()), base: values.base ?? '/' };
      const { url } = await startStaticServer(site, Number(values.port ?? env.PORT ?? 8787));
      log(`Preview: ${url}`);
      return 0;
    }
    default:
      log(USAGE);
      return 1;
  }
}
