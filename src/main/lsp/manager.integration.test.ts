import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FileDiagnostics, LspServerStatus } from '@shared/types'
import { LspManager } from './manager'
import { makeRealTempDir } from '../testing/testEnv'

// Real server (typescript-language-server + bundled tsserver) in a temporary project. POSIX only: uses `ps`.
const posix = process.platform !== 'win32'

function lspProcesses(): Map<number, string> {
  const out = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  const found = new Map<number, string>()
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (m && /typescript-language-server|tsserver-bundled/.test(m[2])) {
      found.set(Number(m[1]), m[2])
    }
  }
  return found
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitFor<T>(read: () => T | undefined | false, ms = 30_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const value = read()
    if (value) return value
    if (Date.now() > end) throw new Error('timeout waiting for the condition')
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe.skipIf(!posix)('LspManager with a real typescript-language-server', () => {
  let root: string
  let file: string
  const diagnostics: FileDiagnostics[] = []
  const statuses: LspServerStatus[][] = []
  let manager: LspManager
  let setting: Record<string, { enabled?: boolean }> = {}
  let before: Set<number>

  beforeAll(() => {
    root = makeRealTempDir('walph-lsp-')
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }))
    file = join(root, 'src', 'a.ts')
    writeFileSync(file, 'export const a: number = 1\n')
    before = new Set(lspProcesses().keys())
    manager = new LspManager({
      getRoot: () => root,
      getServersSetting: () => setting,
      emitDiagnostics: (d) => diagnostics.push(d),
      emitStatus: (s) => statuses.push(s),
      emitLog: () => undefined,
      serverOptions: { restartDelay: () => 100 }
    })
  })

  afterAll(async () => {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  })

  const latest = (): FileDiagnostics | undefined => diagnostics.findLast((d) => d.path === file)
  const state = (): string | undefined => statuses.at(-1)?.[0]?.state
  const mine = (): number[] => [...lspProcesses().keys()].filter((pid) => !before.has(pid))

  it('publishes the type error right after an edit', { timeout: 60_000 }, async () => {
    manager.open(file, 'export const a: number = 1\n', 1)
    await waitFor(() => state() === 'ready')
    const start = Date.now()
    manager.change(file, 2, [
      { range: { start: { line: 0, character: 25 }, end: { line: 0, character: 26 } }, text: '"x"' }
    ])
    const d = await waitFor(() => latest()?.diagnostics.some((x) => x.severity === 'error') && latest())
    expect(d.diagnostics[0]).toMatchObject({ severity: 'error', source: 'typescript' })
    expect(d.diagnostics[0].message).toContain('string')
    // The 2 s limit holds on the development machine; the shared CI runner is much slower.
    expect(Date.now() - start).toBeLessThan(process.env.CI ? 6000 : 2000)
  })

  it('restarts after the process is killed and the diagnostics come back', { timeout: 60_000 }, async () => {
    const lsPid = mine().find((pid) => /typescript-language-server/.test(lspProcesses().get(pid) ?? ''))
    expect(lsPid).toBeDefined()
    const count = diagnostics.length
    process.kill(lsPid!, 'SIGKILL')
    await waitFor(() => state() === 'starting')
    await waitFor(() => state() === 'ready')
    await waitFor(() => diagnostics.length > count && latest()?.diagnostics.some((x) => x.severity === 'error'))
    // The old server does not leave tsserver orphaned
    expect(alive(lsPid!)).toBe(false)
  })

  it('didClose clears the file diagnostics', async () => {
    manager.close(file)
    expect(latest()?.diagnostics).toEqual([])
  })

  it('turning the server off and on again reaches the already open file', { timeout: 60_000 }, async () => {
    manager.open(file, 'export const a: number = "x"\n', 1)
    await waitFor(() => state() === 'ready' && latest()?.diagnostics.some((x) => x.severity === 'error'))
    setting = { typescript: { enabled: false } }
    manager.applySettings()
    expect(manager.status()).toEqual([])
    expect(latest()?.diagnostics).toEqual([])
    setting = {}
    manager.applySettings()
    await waitFor(() => state() === 'ready' && latest()?.diagnostics.some((x) => x.severity === 'error'))
  })

  it(
    'hover, definition, symbols, formatting, rename and completion work on the real server',
    { timeout: 60_000 },
    async () => {
      const lib = join(root, 'src', 'lib.ts')
      const use = join(root, 'src', 'use.ts')
      const libText = 'export function greet(name: string): string {\n  return name\n}\n'
      const useText = "import { greet } from './lib'\ngreet('x')\nconst o = { alpha: 1 }\no.\n"
      writeFileSync(lib, libText)
      writeFileSync(use, useText)
      manager.open(lib, libText, 1)
      manager.open(use, useText, 1)
      await waitFor(() => state() === 'ready')
      const pos = (line: number, character: number) => ({ line, character })

      let h = await manager.hover(use, pos(1, 2))
      for (let i = 0; i < 100 && !h; i++) {
        await new Promise((r) => setTimeout(r, 200))
        h = await manager.hover(use, pos(1, 2))
      }
      expect(h?.contents.value).toContain('greet')

      const def = await manager.definition(use, pos(1, 2))
      expect(def[0].path).toBe(lib)
      expect(def[0].range.start.line).toBe(0)

      const refs = await manager.references(lib, pos(0, 18))
      expect(refs.map((r) => r.path)).toContain(use)

      const symbols = await manager.documentSymbols(lib)
      expect(symbols.map((x) => x.name)).toContain('greet')
      const ws = await manager.workspaceSymbols('greet')
      expect(ws.some((x) => x.name === 'greet' && x.location.path === lib)).toBe(true)

      const items = await manager.completion(use, pos(3, 2), '.')
      expect(items?.items.some((i) => i.label === 'alpha')).toBe(true)

      const sig = await manager.signatureHelp(use, pos(1, 6), '(')
      expect(sig?.signatures[0].label).toContain('greet')

      const edit = await manager.rename(lib, pos(0, 18), 'hello')
      expect(edit?.files.map((f) => f.path).sort()).toEqual([lib, use].sort())

      const badlyFormatted = 'export const z   =   1;;\n'
      manager.open(lib, badlyFormatted, 2)
      const edits = await manager.format(lib, { tabSize: 2, insertSpaces: true })
      expect(edits.length).toBeGreaterThan(0)

      const actions = await manager.codeActions(use, { start: pos(0, 0), end: pos(0, 1) })
      expect(Array.isArray(actions)).toBe(true)
    }
  )

  it('shutting down leaves no process behind (not even tsserver)', { timeout: 60_000 }, async () => {
    manager.open(file, 'export const a: number = "x"\n', 1)
    await waitFor(() => state() === 'ready')
    const pids = mine()
    expect(pids.length).toBeGreaterThanOrEqual(2)
    await manager.shutdown()
    await waitFor(() => pids.every((pid) => !alive(pid)), 5000)
  })
})
