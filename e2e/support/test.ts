/**
 * The `test` every spec imports. Before each test (like Gauge's @BeforeScenario):
 * - a fresh browser context, so nothing is left in localStorage
 * - no request leaves the machine: anything not served by the local test server is aborted
 * - a `reader` with the page's vocabulary
 * Locale, time zone and the clock are fixed in playwright.config.ts and Reader.open().
 */
import { test as base } from '@playwright/test';
import { Reader } from './reader.ts';

export const test = base.extend<{ reader: Reader }>({
  context: async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
    const origin = new URL(baseURL).origin;
    await context.route(
      (url) => url.origin !== origin,
      (route) => route.abort('blockedbyclient'),
    );
    await use(context);
  },
  reader: async ({ page }, use) => {
    await use(new Reader(page));
  },
});

export { expect } from '@playwright/test';
