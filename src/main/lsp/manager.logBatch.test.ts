import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LspLogEntry, LspServerStatus } from '@shared/types'
import { LspManager } from './manager'
import { makeRealTempDir } from '../testing/testEnv'

const fake = join(import.meta.dirname, 'fixtures', 'fakeServer.cjs')

async function waitFor<T>(read: () => T | undefined | false, ms = 10_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const value = read()
    if (value) return value
    if (Date.now() > end) throw new Error('timeout waiting for the condition')
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('LspManager: log batches', () => {
  let root: string
  let manager: LspManager
  let status: LspServerStatus[] = []
  const batches: LspLogEntry[][] = []

  beforeAll(() => {
    root = makeRealTempDir('walph-lsp-logbatch-')
    writeFileSync(join(root, 'a.ts'), 'abc\n')
    manager = new LspManager({
      getRoot: () => root,
      getServersSetting: () => ({}),
      emitDiagnostics: () => undefined,
      emitStatus: (s) => (status = s),
      emitLog: (entries) => batches.push(entries),
      launchFor: () => ({ command: process.execPath, args: [fake], env: { ...process.env } }),
      initOptionsFor: () => undefined
    })
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('delivers the lines in batches (arrays) and the shutdown flushes what is left', async () => {
    manager.open(join(root, 'a.ts'), 'abc\n', 1)
    await waitFor(() => status[0]?.state === 'ready')
    await manager.shutdown()
    expect(batches.length).toBeGreaterThan(0)
    expect(batches.every((b) => Array.isArray(b) && b.length > 0)).toBe(true)
    expect(batches.flat()).toEqual(manager.log())
  })

  it('log() delivers the pending batch before returning the history', async () => {
    manager.open(join(root, 'a.ts'), 'abc\n', 2)
    await waitFor(() => status[0]?.state === 'ready')
    const history = manager.log()
    expect(batches.flat()).toEqual(history)
  })

  it('after dispose it emits nothing else', async () => {
    const before = batches.length
    manager.log()
    await manager.dispose()
    await new Promise((r) => setTimeout(r, 250))
    expect(batches.length).toBe(before)
  })
})
