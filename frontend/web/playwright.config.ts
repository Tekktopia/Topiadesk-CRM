import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke suite for the golden path, run against the real Docker Compose
 * stack (Traefik + Keycloak + api + web + Postgres — not a dev server, not
 * mocked auth). CI brings the stack up itself before invoking this (see
 * .github/workflows/ci.yml's playwright-smoke job); for local runs, `docker
 * compose up -d` first. No `webServer` entry here on purpose — this targets
 * a multi-container stack, not something Playwright itself should spin up.
 *
 * Traefik terminates TLS on *.topiadesk.localhost with a self-signed dev
 * cert (see infra/traefik/), hence ignoreHTTPSErrors below.
 */
const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? 'https://app.topiadesk.localhost';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared seed data (accounts/leads/policies) — avoid cross-test races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP_URL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Playwright's own bundled Chromium build doesn't support every host OS
    // version (e.g. macOS 13) — the system-installed Chrome via `channel`
    // sidesteps that without changing anything about what's being tested.
    // CI runners aren't affected by this gate, but setting it unconditionally
    // keeps local and CI runs on the same actual browser engine.
    channel: 'chrome',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/u,
    },
    {
      name: 'broker',
      testMatch: /golden-path\.spec\.ts/u,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/broker.json' },
    },
    {
      name: 'admin-mfa',
      testMatch: /admin-mfa\.spec\.ts/u,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' },
    },
  ],
});
