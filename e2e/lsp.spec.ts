import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand as sendAppCommand } from './helpers'

const posix = process.platform !== 'win32'

let tmpBase: string
let app: ElectronApplication
let page: Page
let mainPid = 0
/** Every server pid seen during the test (typescript-language-server and its tsserver child). */
const seenServerPids = new Set<number>()

// Native menu shortcuts do not fire from synthetic keys: send the command through main, as the menu does.
const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const lintErrors = (): Locator => page.locator('.cm-editor .cm-lintRange-error')
const problemsButton = (): Locator => page.locator('.status-bar button[title^="Problemas"]')
const serverButton = (): Locator => page.locator('.status-bar button[title^="TypeScript"]')
const problemItems = (): Locator => page.locator('.problems .problem-item')

interface ProcessInfo {
  pid: number
  ppid: number
  command: string
}

function listProcesses(): ProcessInfo[] {
  const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const result: ProcessInfo[] = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (m) result.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] })
  }
  return result
}

/** Language server processes in main's tree (children, grandchildren…), recording the pids seen. */
function serverProcesses(): ProcessInfo[] {
  const all = listProcesses()
  const tree = new Set<number>([mainPid])
  for (let grew = true; grew;) {
    grew = false
    for (const p of all)
      if (!tree.has(p.pid) && tree.has(p.ppid)) {
        tree.add(p.pid)
        grew = true
      }
  }
  const found = all.filter((p) => tree.has(p.pid) && /typescript-language-server|tsserver/.test(p.command))
  for (const p of found) seenServerPids.add(p.pid)
  return found
}

/** The typescript-language-server process (main's direct child), not the tsserver. */
const lspProcess = (): ProcessInfo | undefined =>
  serverProcesses().find((p) => p.ppid === mainPid && /typescript-language-server/.test(p.command))

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function typeAtEnd(text: string): Promise<void> {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText(text)
}

async function replaceAll(text: string): Promise<void> {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(text)
}

const BAD_LINE = "const x: number = 'a'\n"

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  const repoDir = makeRepo(tmpBase, 'projeto-lsp', {
    'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022' } }),
    'index.ts': 'export const a: number = 1\n'
  })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repoDir] }))
  mainPid = await app.evaluate(() => process.pid)
  await expect(treeRow('index.ts')).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test.describe('LSP: diagnostics', () => {
  test('the status bar shows the TypeScript server ready for the active file', async () => {
    // Without an open file there is no server to show.
    await expect(serverButton()).toHaveCount(0)
    await treeRow('index.ts').dblclick()
    await expect(page.locator('.cm-editor')).toBeVisible()
    await expect(serverButton()).toBeVisible()
    await expect(serverButton()).toHaveAttribute('title', /pronto/, { timeout: 30_000 })
    await expect(serverButton().locator('.codicon-check')).toBeVisible()
  })

  test('a typed type error shows underlined, in the Problems panel and in the counter', async () => {
    await expect(problemsButton()).toContainText('0')
    const started = Date.now()
    await typeAtEnd(BAD_LINE)
    await expect(lintErrors().first()).toBeVisible({ timeout: 15_000 })
    const elapsed = Date.now() - started
    console.log(`[lsp] diagnostic appeared in ${elapsed} ms`)
    expect(elapsed).toBeLessThan(5000)

    await expect(problemsButton()).toHaveText(/1\s*0/)
    await sendCommand('view.problems')
    await expect(page.locator('.problems .problem-group')).toHaveCount(1)
    await expect(page.locator('.problems .problem-group')).toContainText('index.ts')
    await expect(problemItems()).toHaveCount(1)
    await expect(problemItems()).toContainText("'string'")
    await expect(problemItems().locator('.problem-position')).toHaveText('[Ln 2, Col 7]')
    await expect(page.locator('.panel-tab', { hasText: 'Problemas' })).toContainText('1')
  })

  test('clicking the problem moves the cursor to the error line', async () => {
    // Moves the cursor to line 1 and confirms it left the error line.
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+Home')
    await expect(page.locator('.status-bar')).toContainText('Ln 1,')
    await problemItems().first().click()
    await expect(page.locator('.status-bar')).toContainText(/Ln 2, Col \d+/)
  })

  test('fixing the error removes the underline, the problem and resets the counter', async () => {
    await replaceAll('export const a: number = 1\nconst x: number = 2\n')
    await expect(lintErrors()).toHaveCount(0, { timeout: 15_000 })
    await expect(problemItems()).toHaveCount(0)
    await expect(page.getByRole('tree', { name: 'Problemas' })).toContainText('Nenhum problema')
    await expect(problemsButton()).toHaveText(/0\s*0/)
  })
})

test.describe('LSP: output and restart', () => {
  test('the Output view lists server log lines', async () => {
    await sendCommand('view.output')
    const lines = page.locator('.output-panel .output-line')
    await expect.poll(() => lines.count(), { timeout: 10_000 }).toBeGreaterThan(0)
    await expect(page.locator('.output-panel .output-server').first()).toHaveText('[typescript]')
  })

  test('lsp.restartServer restarts the server and the diagnostics come back', async () => {
    test.skip(!posix, 'uses ps')
    const before = lspProcess()
    expect(before).toBeTruthy()

    await typeAtEnd(BAD_LINE.replace('x:', 'y:'))
    await expect(lintErrors().first()).toBeVisible({ timeout: 15_000 })

    await sendCommand('lsp.restartServer')
    await expect.poll(() => lspProcess()?.pid, { timeout: 20_000 }).not.toBe(before!.pid)
    await expect(serverButton()).toHaveAttribute('title', /pronto/, { timeout: 30_000 })
    // The old process (and its children) must not remain.
    await expect.poll(() => alive(before!.pid), { timeout: 10_000 }).toBe(false)

    // After the restart the error is still (or again) reported.
    await expect(lintErrors().first()).toBeVisible({ timeout: 20_000 })
    await expect(problemsButton()).toHaveText(/1\s*0/)

    // And a new error is also detected by the new server.
    await replaceAll('export const a: number = 1\n')
    await expect(lintErrors()).toHaveCount(0, { timeout: 15_000 })
    await typeAtEnd(BAD_LINE)
    await expect(lintErrors().first()).toBeVisible({ timeout: 15_000 })
  })

  test('killing the server process: status goes to "iniciando", back to "pronto" and the diagnostic returns', async () => {
    test.skip(!posix, 'uses ps/kill')
    await expect(lintErrors().first()).toBeVisible()
    const victim = lspProcess()
    expect(victim).toBeTruthy()

    // Samples the status icon in the page: the "iniciando" state is short-lived.
    await page.evaluate(() => {
      const g = globalThis as unknown as {
        document: { querySelector(s: string): { querySelector(s: string): unknown } | null }
        setInterval(fn: () => void, ms: number): number
        __estados: string[]
      }
      g.__estados = []
      g.setInterval(() => {
        const btn = g.document.querySelector('.status-bar button[title^="TypeScript"]')
        const state = !btn
          ? 'nenhum'
          : btn.querySelector('.codicon-sync')
            ? 'starting'
            : btn.querySelector('.codicon-check')
              ? 'ready'
              : 'error'
        const list = g.__estados
        if (list[list.length - 1] !== state) list.push(state)
      }, 20)
    })

    process.kill(victim!.pid, 'SIGKILL')

    await expect
      .poll(() => page.evaluate(() => (globalThis as unknown as { __estados: string[] }).__estados.join('>')), {
        timeout: 30_000
      })
      .toMatch(/starting>ready$/)
    await expect(serverButton()).toHaveAttribute('title', /pronto/)
    expect(lspProcess()?.pid).not.toBe(victim!.pid)

    // The document is reopened in the new server: fixing and breaking it again proves the sync is back.
    await expect(lintErrors().first()).toBeVisible({ timeout: 20_000 })
    await replaceAll('export const a: number = 1\n')
    await expect(lintErrors()).toHaveCount(0, { timeout: 15_000 })
    await typeAtEnd(BAD_LINE)
    await expect(lintErrors().first()).toBeVisible({ timeout: 15_000 })
    await expect(problemsButton()).toHaveText(/1\s*0/)
  })
})

test.describe('LSP: shutdown', () => {
  test('closing the app leaves no orphan typescript-language-server or tsserver', async () => {
    test.skip(!posix, 'uses ps')
    expect(serverProcesses().length).toBeGreaterThan(0)
    // A tab with pending changes vetoes closing the window: save before closing.
    await sendCommand('editor.save')
    await expect(page.locator('.tab-bar .tab.dirty')).toHaveCount(0)
    const tracked = [...seenServerPids]

    await app.close()

    await expect
      .poll(() => tracked.filter(alive), { timeout: 10_000, message: 'server processes still alive' })
      .toEqual([])
    // Safety net: nothing with the test folder path nor the app tsserver survives.
    const leftovers = listProcesses().filter(
      (p) =>
        (p.command.includes(tmpBase) || /typescript-language-server\/lib\/cli/.test(p.command)) &&
        tracked.includes(p.pid)
    )
    expect(leftovers).toEqual([])
  })
})
