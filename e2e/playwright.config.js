import { defineConfig, devices } from '@playwright/test'

// E2E config for exercising the auth flow against a locally running
// frontend (Vite dev server) + backend. Override the targets with
// E2E_BASE_URL / E2E_API_URL if your ports differ.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    // The dev backend issues Secure cookies over http://localhost; allow them.
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
