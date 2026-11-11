import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { ElectronApplication, Page } from '@playwright/test'
import { expect, test as base } from './fixtures'
import { appRoot, cleanEnv, makeRepo, type WalphGlobals } from './helpers'

// Mechanism behind `walph .`: the second instance (same userData) forwards argv to the first one and exits.

const electronBin = createRequire(__filename)('electron') as unknown as string

let tmpBase: string
let userDataDir: string
let app: ElectronApplication
let launchFirst: (folders: string[]) => Promise<Page>

const test = base.extend<{ single: void }>({
  single: [
    async ({ launch, tmp, userDataDir: ud }, use) => {
      tmpBase = tmp
      userDataDir = ud
      launchFirst = async (folders) => {
        const launched = await launch({ folders, env: { WALPH_HIDDEN_WINDOWS: '1' } })
        app = launched.app
        const { page } = launched
        await expect(page.locator('.workspace-bar')).toBeVisible()
        // The native dialog is modal and would block main (and the second instance); record the calls instead.
        await app.evaluate(({ dialog }) => {
          const g = globalThis as unknown as { __errorBoxes: string[][] }
          g.__errorBoxes = []
          dialog.showErrorBox = (title: string, content: string) => {
            g.__errorBoxes.push([title, content])
          }
        })
        return page
      }
      await use()
    },
    { auto: true }
  ]
})

/** Runs a second app instance; resolves with the exit code (kills it after 15 s). */
function runSecond(args: string[], cwd: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(electronBin, [join(appRoot, 'out/main/index.js'), `--user-data-dir=${userDataDir}`, ...args], {
      cwd,
      env: cleanEnv({ WALPH_HIDDEN_WINDOWS: '1' }),
      stdio: 'ignore'
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('The second instance did not exit within 15 s.'))
    }, 15_000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    child.on('error', reject)
  })
}

const roots = (page: Page): Promise<(string | null)[]> =>
  page
    .evaluate(() => (globalThis as unknown as WalphGlobals).api.workspaces.list())
    .then((s) => s.workspaces.map((w) => w.root))

const errorBoxes = (): Promise<string[][]> =>
  app.evaluate(() => (globalThis as unknown as { __errorBoxes: string[][] }).__errorBoxes)

test('forwards the absolute folder path to the first instance, which opens it; the second exits with 0', async () => {
  const a = makeRepo(tmpBase, 'proj-a', { 'a.txt': 'a' })
  const b = makeRepo(tmpBase, 'proj-b', { 'b.txt': 'b' })
  const page = await launchFirst([a])
  expect(await roots(page)).toEqual([a])

  expect(await runSecond([b], tmpBase)).toBe(0)
  await expect.poll(() => roots(page)).toEqual([a, b])
  expect(await errorBoxes()).toEqual([])
})

test('resolves a relative path against the cwd of the second instance', async () => {
  const a = makeRepo(tmpBase, 'proj-a', { 'a.txt': 'a' })
  const rel = makeRepo(tmpBase, 'rel-proj', { 'r.txt': 'r' })
  const page = await launchFirst([a])

  expect(await runSecond(['rel-proj'], tmpBase)).toBe(0)
  await expect.poll(() => roots(page)).toEqual([a, rel])
  expect(await errorBoxes()).toEqual([])
})

test('forwarding an already open folder focuses the window and does not duplicate the workspace', async () => {
  const a = makeRepo(tmpBase, 'proj-a', { 'a.txt': 'a' })
  const b = makeRepo(tmpBase, 'proj-b', { 'b.txt': 'b' })
  const page = await launchFirst([a])
  expect(await runSecond([b], tmpBase)).toBe(0)
  await expect.poll(() => roots(page)).toEqual([a, b])

  expect(await runSecond([a], tmpBase)).toBe(0)
  expect(await runSecond([a], tmpBase)).toBe(0)
  // Forwards are processed in order: when the new folder shows up, the repeated ones were already handled.
  const c = makeRepo(tmpBase, 'proj-c', { 'c.txt': 'c' })
  expect(await runSecond([c], tmpBase)).toBe(0)
  await expect.poll(() => roots(page)).toEqual([a, b, c])
})

test('a forwarded path that is not a folder shows a native pt-BR error and creates no workspace', async () => {
  const a = makeRepo(tmpBase, 'proj-a', { 'a.txt': 'a' })
  const file = join(tmpBase, 'file.txt')
  writeFileSync(file, 'x')
  const page = await launchFirst([a])
  expect(await runSecond([file], tmpBase)).toBe(0)
  await expect.poll(errorBoxes).toEqual([['Walph', `"${file}" não é uma pasta.`]])
  expect(await roots(page)).toEqual([a])
})
