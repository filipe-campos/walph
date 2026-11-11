import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** Lists at the end the tests that only passed on a retry: `retries` must not hide flakiness. */
export default class FlakyReporter implements Reporter {
  private readonly flaky = new Map<string, number>()

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed' && result.retry > 0)
      this.flaky.set(test.titlePath().slice(1).join(' › '), result.retry)
  }

  onEnd(): void {
    if (this.flaky.size === 0) return
    console.log(`\nFLAKY (passed only on a retry): ${this.flaky.size}`)
    for (const [title, retry] of this.flaky) console.log(`  - ${title} (attempt ${retry + 1})`)
  }

  printsToStdio(): boolean {
    return false
  }
}
