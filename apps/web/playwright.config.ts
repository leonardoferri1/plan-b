import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

/**
 * The E2E suite runs against a production build served by `vite preview`, not the dev server:
 * it exercises the same bundle a visitor would get, and it will not pass because of a stale
 * HMR module. The API is deliberately not started — the editor must be fully usable with the
 * backend absent, which is exactly the portfolio demo's default state.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // Video needs the bundled ffmpeg, which is only worth installing where the recording
    // is actually read back: CI.
    video: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The full Chromium build rather than the headless shell: the editor renders a real
        // WebGL scene, and the complete browser is what reliably gives SwiftShader a context.
        // Override with PLAYWRIGHT_CHANNEL=chrome to reuse a locally installed browser.
        channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
      },
    },
  ],

  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
