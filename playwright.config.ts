import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a test that only passes on the second try is a bug to fix, not to hide
  retries: 0,
  // The tests mostly wait on the browser, not the CPU, so CI runs two workers per core
  workers: process.env.CI ? '200%' : undefined,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/techcrema/`,
    // Fixed so dates, times and number formats render the same everywhere
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  // Phones first: that's where the page is read
  projects: [
    // WebKit on Linux paints in software; at the iPhone's 3x density that dominated CI time.
    // The tests check roles and text, not pixels, so 1x loses nothing.
    { name: 'iphone', use: { ...devices['iPhone 15'], deviceScaleFactor: 1 } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node src/bin.ts preview --dir web --base /techcrema/ --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/techcrema/`,
    reuseExistingServer: !process.env.CI,
  },
});
