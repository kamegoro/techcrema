import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
