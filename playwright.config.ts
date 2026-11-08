import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a test that only passes on the second try is a bug to fix, not to hide
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/tech-catchup/`,
    // Fixed so dates, times and number formats render the same everywhere
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  // Phones first: that's where the page is read
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node src/bin.ts preview --dir web --base /tech-catchup/ --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/tech-catchup/`,
    reuseExistingServer: !process.env.CI,
  },
});
