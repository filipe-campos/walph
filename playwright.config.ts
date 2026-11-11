import { defineConfig } from '@playwright/test'

// Hidden windows: the tests run in the background. `WALPH_HIDDEN_WINDOWS=0 pnpm test:e2e` shows the windows.
process.env.WALPH_HIDDEN_WINDOWS ??= '1'

// Git identity for the commits the app makes in the tests: the CI runner has no `user.name`/`user.email` and the
// commit would fail ("Please tell me who you are"). The app and the specs inherit the environment.
process.env.GIT_AUTHOR_NAME ??= 'Walph Test'
process.env.GIT_AUTHOR_EMAIL ??= 'test@walph.local'
process.env.GIT_COMMITTER_NAME ??= 'Walph Test'
process.env.GIT_COMMITTER_EMAIL ??= 'test@walph.local'

// The E2E tests open the Electron app already built in out/ (the test:e2e script runs the build first).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One Electron window at a time: avoids contention for focus and native resources (pty, watchers).
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry (two on CI, which is slower) absorbs a timing hiccup without hiding anything: `flakyReporter` lists at
  // the end every test that only passed on a retry and the JSON keeps the history of the attempts.
  retries: process.env.CI ? 2 : 1,
  fullyParallel: false,
  reporter: [
    [process.env.CI ? 'github' : 'list'],
    ['json', { outputFile: 'test-results/report.json' }],
    ['./e2e/flakyReporter.ts']
  ],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
})
