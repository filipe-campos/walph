import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { closeApp, expect, makeTmpDir, removeDir, test } from './fixtures'
import {
  closeHostWindow,
  hostWindowId,
  launchApp,
  makeRepo as makeRepoIn,
  requestOpen as requestOpenIn,
  sendCommand,
  spyWindowFocus
} from './helpers'

let tmpBase: string
let userDataDir: string
let app: ElectronApplication | null = null

const makeRepo = (name: string, files: Record<string, string>): string => makeRepoIn(tmpBase, name, files)

async function launch(...folders: string[]): Promise<ElectronApplication> {
  app = await launchApp({ userDataDir, folders })
  return app
}

const treeRow = (page: Page, name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const tabs = (page: Page): Locator => page.locator('.tab-bar .tab')
const tabLabels = (page: Page): Promise<string[]> => tabs(page).locator('.tab-label').allTextContents()
const cursorLabel = (page: Page): Locator => page.locator('.status-bar .status-item', { hasText: /^Ln \d+, Col \d+$/ })

async function openPinned(page: Page, name: string): Promise<void> {
  await treeRow(page, name).dblclick()
  await expect(
    tabs(page).filter({ has: page.locator('.tab-label', { hasText: new RegExp(`^${name}$`) }) })
  ).toBeVisible()
}

async function goTo(page: Page, line: number, column: number): Promise<void> {
  // The file already loaded (the editor takes focus when shown) and the overlay field focused: otherwise the editor,
  // when it finishes loading, steals focus and the first characters land in the document.
  await expect(page.locator('.code-editor .cm-editor.cm-focused')).toBeVisible()
  await sendCommand(app!, page, 'editor.goToLine')
  await expect(page.getByRole('combobox')).toBeFocused()
  await page.keyboard.type(`${line}:${column}`)
  await page.keyboard.press('Enter')
}

async function waitWindows(count: number): Promise<Page[]> {
  await expect.poll(() => app!.windows().length).toBe(count)
  return app!.windows()
}

/** Finds, among the windows, the one showing the folder `name` in the explorer. */
async function windowWithTree(name: string, marker: string): Promise<Page> {
  let found: Page | null = null
  await expect
    .poll(
      async () => {
        for (const p of app!.windows()) {
          if (
            (await treeRow(p, marker)
              .count()
              .catch(() => 0)) > 0
          ) {
            found = p
            return true
          }
        }
        return false
      },
      { message: `window of ${name}` }
    )
    .toBe(true)
  return found!
}

test.beforeAll(() => {
  tmpBase = makeTmpDir()
})

test.afterAll(() => {
  removeDir(tmpBase)
})

test.afterEach(async () => {
  await closeApp(app)
  app = null
})

test.describe('session restore', () => {
  test.describe.configure({ mode: 'serial' })
  let repo: string
  const lines = (n: string): string =>
    Array.from({ length: 10 }, (_, i) => `${n} linha numero ${i + 1}`).join('\n') + '\n'

  test.beforeAll(() => {
    userDataDir = join(tmpBase, 'ud-sessao')
    repo = makeRepo('projeto-sessao', {
      'a.txt': lines('a'),
      'b.txt': lines('b'),
      'c.txt': lines('c'),
      'sub/dentro.txt': 'x\n'
    })
  })

  test('stores tabs, active tab and cursor and restores them on reopen with the same user-data-dir', async () => {
    await launch(repo)
    let page = await app!.firstWindow()
    await expect(treeRow(page, 'a.txt')).toBeVisible()

    await treeRow(page, 'sub').click() // expands the folder
    await expect(treeRow(page, 'dentro.txt')).toBeVisible()

    await openPinned(page, 'a.txt')
    await goTo(page, 4, 6)
    await expect(cursorLabel(page)).toHaveText('Ln 4, Col 6')
    await openPinned(page, 'b.txt')
    await goTo(page, 7, 3)
    await expect(cursorLabel(page)).toHaveText('Ln 7, Col 3')
    await openPinned(page, 'c.txt')
    await goTo(page, 2, 2)
    await expect(cursorLabel(page)).toHaveText('Ln 2, Col 2')
    // The second tab becomes active.
    await tabs(page)
      .filter({ has: page.locator('.tab-label', { hasText: /^b\.txt$/ }) })
      .click()
    await expect(cursorLabel(page)).toHaveText('Ln 7, Col 3')
    await sendCommand(app!, page, 'view.git')
    await expect(page.locator('.sidebar-slot:not([hidden])')).toBeVisible()
    // Gives the debounced save and the close time to write the session.
    await app!.close()
    app = null

    await launch() // no argv: main restores the window from windows.json
    page = await app!.firstWindow()
    await expect(page.locator('.tab-bar .tab')).toHaveCount(3)
    expect(await tabLabels(page)).toEqual(['a.txt', 'b.txt', 'c.txt'])
    await expect(page.locator('.tab-bar .tab.active')).toContainText('b.txt')
    await expect(cursorLabel(page)).toHaveText('Ln 7, Col 3')
    await expect(page.locator('.cm-content')).toContainText('b linha numero 7')

    // Tabs load on demand: the cursor of the tab only activated now also comes back.
    await page.locator('.tab-bar .tab', { hasText: 'a.txt' }).click()
    await expect(cursorLabel(page)).toHaveText('Ln 4, Col 6')
    await page.locator('.tab-bar .tab', { hasText: 'c.txt' }).click()
    await expect(cursorLabel(page)).toHaveText('Ln 2, Col 2')

    // The sidebar view (Git) was restored.
    await expect(page.locator('.sidebar-slot:not([hidden]) .commit-box')).toBeVisible()
    await sendCommand(app!, page, 'view.explorer')
    await expect(treeRow(page, 'dentro.txt')).toBeVisible()
  })

  test('reopening through argv with the same folder also restores the session', async () => {
    await launch(repo)
    const page = await app!.firstWindow()
    await expect(page.locator('.tab-bar .tab')).toHaveCount(3)
    await expect(page.locator('.tab-bar .tab.active')).toContainText('c.txt')
    await expect(cursorLabel(page)).toHaveText('Ln 2, Col 2')
    expect(app!.windows().length).toBe(1)
  })

  test('a file deleted between runs is dropped from the session', async () => {
    await launch(repo)
    const page = await app!.firstWindow()
    await expect(page.locator('.tab-bar .tab')).toHaveCount(3)
    await app!.close()
    app = null
    rmSync(join(repo, 'a.txt'))
    await launch()
    const again = await app!.firstWindow()
    await expect(again.locator('.tab-bar .tab')).toHaveCount(2)
    expect(await tabLabels(again)).toEqual(['b.txt', 'c.txt'])
  })
})

test.describe('multiple windows', () => {
  test.describe.configure({ mode: 'serial' })
  let repoA: string
  let repoB: string

  test.beforeAll(() => {
    userDataDir = join(tmpBase, 'ud-janelas')
    repoA = makeRepo('projeto-a', { 'alfa.txt': 'alfa\n', 'so-a.txt': 'so a\n' })
    repoB = makeRepo('projeto-b', { 'beta.txt': 'beta\n', 'so-b.txt': 'so b\n' })
  })

  test('a new window opens empty, opens another folder and the windows are independent', async () => {
    await launch(repoA)
    const pageA = await app!.firstWindow()
    await expect(treeRow(pageA, 'alfa.txt')).toBeVisible()

    await sendCommand(app!, pageA, 'workbench.newWindow')
    const [, pageB] = await waitWindows(2).then((w) => [w[0], w.find((p) => p !== pageA)!])
    await expect(pageB.locator('.welcome')).toBeVisible()
    await expect(pageB.locator('.tree')).toHaveCount(0)

    await requestOpenIn(app!, pageB, repoB)
    await expect(treeRow(pageB, 'beta.txt')).toBeVisible()
    await expect(pageB.locator('.welcome-recent')).toHaveCount(0)
    await expect(treeRow(pageA, 'alfa.txt')).toBeVisible()
    await expect(treeRow(pageA, 'beta.txt')).toHaveCount(0)

    // Edits and saves a file in window A: only A reacts.
    await treeRow(pageA, 'alfa.txt').dblclick()
    await pageA.locator('.cm-content').click()
    await pageA.keyboard.type('EDITADO')
    await sendCommand(app!, pageA, 'editor.save')
    await expect.poll(() => readFileSync(join(repoA, 'alfa.txt'), 'utf8')).toContain('EDITADO')
    await sendCommand(app!, pageA, 'view.git')
    await expect(pageA.locator('.sidebar-slot:not([hidden])')).toContainText('alfa.txt')
    await sendCommand(app!, pageB, 'view.git')
    await expect(pageB.locator('.sidebar-slot:not([hidden])')).not.toContainText('alfa.txt')
    await expect(pageB.locator('.tab-bar .tab')).toHaveCount(0)

    // Opening A's folder in B focuses A and B stays on repoB.
    // Hidden windows (WALPH_HIDDEN_WINDOWS) never get OS focus: records whom main asks to focus.
    const focused = await spyWindowFocus(app!)
    await requestOpenIn(app!, pageB, repoA)
    const idA = await hostWindowId(app!, pageA)
    await expect.poll(focused).toEqual([idA])
    expect(app!.windows().length).toBe(2)
    await sendCommand(app!, pageB, 'view.explorer')
    await expect(treeRow(pageB, 'beta.txt')).toBeVisible()
    await expect(treeRow(pageB, 'alfa.txt')).toHaveCount(0)

    await treeRow(pageB, 'so-b.txt').dblclick()
    await expect(pageB.locator('.tab-bar .tab')).toHaveCount(1)
    await expect(pageA.locator('.tab-bar .tab')).toHaveCount(1)
  })

  test('restarting restores both windows, each with its folder and tabs', async () => {
    await launch(repoA)
    const pages = await waitWindows(2)
    expect(pages.length).toBe(2)
    const pageA = await windowWithTree('A', 'alfa.txt')
    const pageB = await windowWithTree('B', 'beta.txt')
    expect(pageA).not.toBe(pageB)
    await expect(pageA.locator('.tab-bar .tab .tab-label')).toHaveText(['alfa.txt'])
    await expect(pageB.locator('.tab-bar .tab .tab-label')).toHaveText(['so-b.txt'])
  })

  test('a new window shows the already recent folder in the welcome screen list', async () => {
    await launch(repoA)
    const pages = await waitWindows(2)
    const pageB = await windowWithTree('B', 'beta.txt')
    // Closes B (the restored window) and opens an empty one: repoB is in the recent list.
    await closeHostWindow(app!, pageB)
    await expect.poll(() => app!.windows().length).toBe(pages.length - 1)
    const pageA = app!.windows()[0]
    await sendCommand(app!, pageA, 'workbench.newWindow')
    await waitWindows(2)
    const empty = app!.windows().find((p) => p !== pageA)!
    await expect(empty.locator('.welcome')).toBeVisible()
    await empty.locator('li.recent-item button.recent-open[title$="projeto-b"]').click()
    await expect(treeRow(empty, 'beta.txt')).toBeVisible()
  })
})

test.describe('terminals per window', () => {
  test('closing a window kills only its terminals', async () => {
    userDataDir = join(tmpBase, 'ud-term')
    // DOM renderer: with WebGL the terminal text is not in `.xterm-rows`.
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ 'terminal.gpuAcceleration': 'off' }))
    const repoA = makeRepo('term-a', { 'a.txt': 'a\n' })
    const repoB = makeRepo('term-b', { 'b.txt': 'b\n' })
    await launch(repoA)
    const pageA = await app!.firstWindow()
    await expect(treeRow(pageA, 'a.txt')).toBeVisible()
    await sendCommand(app!, pageA, 'workbench.newWindow')
    await waitWindows(2)
    const pageB = app!.windows().find((p) => p !== pageA)!
    await expect(pageB.locator('.welcome')).toBeVisible()
    await requestOpenIn(app!, pageB, repoB)
    await expect(treeRow(pageB, 'b.txt')).toBeVisible()

    for (const p of [pageA, pageB]) {
      await sendCommand(app!, p, 'terminal.toggle')
      await expect(p.locator('.xterm')).toBeVisible()
    }
    // Waits for each shell prompt before typing (text before it shows up duplicated).
    for (const p of [pageA, pageB]) {
      await expect.poll(async () => (await p.locator('.xterm-rows').innerText()).trim().length).toBeGreaterThan(0)
    }

    await closeHostWindow(app!, pageB)
    await expect.poll(() => app!.windows().length).toBe(1)

    await pageA.locator('.xterm').click()
    await pageA.keyboard.type('echo walph-$((40+2))')
    await pageA.keyboard.press('Enter')
    await expect(pageA.locator('.xterm-rows')).toContainText('walph-42')
  })
})
