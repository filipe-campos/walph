import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LspServerStatus } from '@shared/types'
import { LspManager } from './manager'
import { makeRealTempDir } from '../testing/testEnv'

// Short idle deadlines with the fake server: shuts down without documents / hidden view and reopens on demand.
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

describe('LspManager: idleness', () => {
  let root: string
  let file: string
  let manager: LspManager
  let status: LspServerStatus[] = []

  beforeAll(() => {
    root = makeRealTempDir('walph-lsp-idle-')
    file = join(root, 'a.ts')
    writeFileSync(file, 'abc\n')
    manager = new LspManager({
      getRoot: () => root,
      getServersSetting: () => ({}),
      emitDiagnostics: () => undefined,
      emitStatus: (s) => (status = s),
      emitLog: () => undefined,
      launchFor: () => ({ command: process.execPath, args: [fake], env: { ...process.env } }),
      initOptionsFor: () => undefined,
      idle: { noDocsMs: 300, inactiveMs: 300 }
    })
  })

  afterAll(async () => {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  })

  it('a server without documents shuts down; opening again starts another', async () => {
    manager.open(file, 'abc\n', 1)
    await waitFor(() => status[0]?.state === 'ready')
    manager.close(file)
    await waitFor(() => status.length === 0)
    manager.open(file, 'abc\n', 1)
    await waitFor(() => status[0]?.state === 'ready')
    expect(status[0]?.state).toBe('ready')
  })

  it('an inactive view hibernates keeping the mirror and reopens when it becomes active again', async () => {
    manager.setActive(false)
    await waitFor(() => status.length === 0)
    // Request with the server sleeping: returns null and wakes the server.
    expect(await manager.hover(file, { line: 0, character: 0 })).toBeNull()
    manager.setActive(true)
    await waitFor(() => status[0]?.state === 'ready')
    // The new server received the document from the mirror (it answers the file requests again).
    expect(manager.triggerCharacters(file)).toBeTruthy()
  })
})
