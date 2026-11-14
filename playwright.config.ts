import { defineConfig, devices } from '@playwright/test';

// Browser tests run against a deployed test copy (see .github/workflows/e2e.yml).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 1,
  use: { baseURL: process.env.E2E_BASE_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
