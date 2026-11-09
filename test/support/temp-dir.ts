import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished } from 'vitest';

/** A fresh empty directory that is deleted when the current test finishes (call it in a test or beforeEach) */
export async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `tc-${prefix}-`));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
