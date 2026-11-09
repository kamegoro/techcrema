import { afterEach, expect, it, vi } from 'vitest';
import { run } from '#src/cli.ts';

vi.mock('#src/cli.ts', () => ({ run: vi.fn(async () => 3) }));

afterEach(() => {
  process.exitCode = undefined;
});

it('runs the command from the arguments and exits with its code', async () => {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'bin.ts', 'build', '--x']);
  await import('#src/bin.ts');
  expect(run).toHaveBeenCalledWith(['build', '--x']);
  expect(process.exitCode).toBe(3);
});
