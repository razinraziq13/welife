import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const isCI = Boolean(process.env.CI);
/**
 * Firefox runs in CI. Locally it is opt-in (WELIFE_E2E_FIREFOX=1) because some Windows
 * security policies block Playwright's unsigned Firefox build from launching.
 */

export default defineConfig({
  testDir: 'tests/e2e',
  // Path aliases (@engine, @persistence...) so tests can build fixtures with the real engine.
  tsconfig: './tsconfig.node.json',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    // Tests always run against the production build (service worker included).
    command: 'npm run build && npm run preview',
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !isCI,
    timeout: 240_000,
  },
});
