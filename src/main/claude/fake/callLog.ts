// eslint-disable-next-line no-restricted-imports -- test log only appends lines, it is not a user file
import { appendFileSync } from 'node:fs'

/** Call log (see the header): JSONL file + `globalThis.__walphFakeClaudeCalls`. */
export type FakeCallLog = (entry: Record<string, unknown>) => void

export function createCallLog(path: string | null): FakeCallLog {
  const g = globalThis as unknown as { __walphFakeClaudeCalls?: Record<string, unknown>[] }
  g.__walphFakeClaudeCalls ??= []
  return (entry) => {
    g.__walphFakeClaudeCalls?.push(entry)
    if (!path) return
    try {
      appendFileSync(path, `${JSON.stringify(entry)}\n`)
    } catch {
      // the log is only for the tests
    }
  }
}
