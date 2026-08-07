import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI uploads app/playwright-report/ on failure, which only the html reporter produces
  reporter: process.env.CI ? [['list'] as const, ['html', { open: 'never' }] as const] : 'list',
  // Mock latency is 300ms per call and list pages fan out per-VM tag queries,
  // so the default 5s expect window is a little tight on cold loads.
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Dedicated port: `npm run dev` against a real engine typically holds 5173,
  // and reuseExistingServer would silently point the suite at it — logins with
  // the mock password then fail. 5199 keeps e2e on its own mock server no
  // matter what dev servers are running; strictPort makes a collision loud
  // instead of Vite auto-incrementing to a port Playwright isn't watching.
  webServer: {
    command: 'npm run dev:mock -- --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: !process.env.CI,
  },
})
