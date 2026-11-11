import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, test as base } from './fixtures'
import { activePage, sendCommand, waitActivePage, waitPageOfRoot, type WalphGlobals } from './helpers'
// Several workspaces in one window: each folder is a WebContentsView with the whole renderer; the WorkspaceBar
// (rendered by each view) shows one tab per workspace. Native accelerators do not fire from synthetic keys:
// `app:command` goes through main to the active view, as the menu does. The Claude SDK is the fake one
// (`WALPH_FAKE_CLAUDE`).

type Step = Record<string, unknown>

let tmpBase: string
let repoA: string
let repoB: string
let repoC: string
let app: ElectronApplication

/** `window.api.workspaces.add(root)` in the page; returns `false` if the folder was already open. */
const addWorkspace = (page: Page, root: string): Promise<boolean> =>
  page.evaluate((r) => (globalThis as unknown as WalphGlobals).api.workspaces.add(r), root)

const workspaceTabs = (page: Page): Locator => page.locator('.workspace-bar .workspace-tab')
const tabNamed = (page: Page, name: string): Locator =>
  workspaceTabs(page).filter({ has: page.locator('.workspace-tab-name', { hasText: new RegExp(`^${name}$`) }) })
const tabNames = (page: Page): Promise<string[]> => workspaceTabs(page).locator('.workspace-tab-name').allTextContents()
const treeRow = (page: Page, name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const editorTabs = (page: Page): Locator => page.locator('.tab-bar .tab .tab-label')

/** ⌘N: sends `workspace.selectN` to the active view and waits for tab N to become active. */
async function select(n: number): Promise<Page> {
  const current = await waitActivePage(app)
  await sendCommand(app, current, `workspace.select${n}`)
  await expect.poll(async () => (await activePage(app)) !== current).toBe(true)
  return waitActivePage(app)
}

/** Records the `Notification.show` calls in main (without actually showing anything). */
async function spyNotifications(): Promise<void> {
  await app.evaluate(({ Notification }) => {
    const g = globalThis as unknown as { __shown: { title: string }[] }
    g.__shown = []
    Notification.prototype.show = function (this: { title: string }) {
      g.__shown.push({ title: this.title })
    }
  })
}

/** Playwright emulates page focus: blurs as the OS would (the open and seen session would be marked as read). */
const blurWindow = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { hasFocus(): boolean }
      dispatchEvent(event: unknown): boolean
      Event: new (type: string) => unknown
    }
    g.document.hasFocus = () => false
    g.dispatchEvent(new g.Event('blur'))
  })

async function sendClaude(page: Page, text: string): Promise<void> {
  const input = page.locator('.claude-input:visible')
  await input.fill(text)
  await input.press('Enter')
}

const claudeTab = (page: Page, title: string): Locator =>
  page.locator('.claude-tab[role=tab]').filter({ hasText: title })

/** Pid of the shell of a terminal opened in the view (the shell writes `$$` to a file in the workspace folder). */
async function shellPid(page: Page, root: string): Promise<number> {
  const file = join(root, 'shell.pid')
  await page.evaluate(async (cwd) => {
    const { api } = globalThis as unknown as WalphGlobals
    const { id } = await api.terminal.create({ cwd })
    // The shell reads the line when it is ready, even if the prompt has not appeared yet.
    api.terminal.write(id, 'echo $$ > shell.pid\r')
  }, root)
  await expect
    .poll(() => existsSync(file) && readFileSync(file, 'utf8').trim().length > 0, { timeout: 20_000 })
    .toBe(true)
  return Number(readFileSync(file, 'utf8').trim())
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const test = base.extend<{
  launchWorkspaces: (options?: { folders?: string[]; turns?: Step[][] }) => Promise<Page>
}>({
  launchWorkspaces: async ({ launch, tmp, makeRepo }, use) => {
    tmpBase = tmp
    repoA = makeRepo({ 'alfa.txt': 'alfa\n', 'extra-a.txt': 'x\n' }, 'proj-a')
    repoB = makeRepo({ 'beta.txt': 'beta\n' }, 'proj-b')
    repoC = makeRepo({ 'gama.txt': 'gama\n' }, 'proj-c')
    await use(async (options = {}) => {
      const launched = await launch({
        folders: options.folders ?? [],
        // DOM renderer: with WebGL the terminal text is not in `.xterm-rows`.
        settings: { 'terminal.gpuAcceleration': 'off' },
        claudeScript: options.turns && { turns: options.turns }
      })
      app = launched.app
      await expect(launched.page.locator('.workspace-bar')).toBeVisible()
      return launched.page
    })
  }
})

test.describe('workspace tabs', () => {
  test('opening two folders in the same window creates two tabs, each with its own explorer', async ({
    launchWorkspaces
  }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await expect(treeRow(pageA, 'alfa.txt')).toBeVisible()
    await expect(workspaceTabs(pageA)).toHaveCount(1)

    expect(await addWorkspace(pageA, repoB)).toBe(true)
    const pageB = await waitPageOfRoot(app, repoB)
    expect(pageB).not.toBe(pageA)
    await expect(treeRow(pageB, 'beta.txt')).toBeVisible()
    await expect(treeRow(pageB, 'alfa.txt')).toHaveCount(0)
    await expect(treeRow(pageA, 'beta.txt')).toHaveCount(0)

    // Both views show the same bar: two tabs, the new one active.
    for (const page of [pageA, pageB]) {
      await expect.poll(() => tabNames(page)).toEqual(['proj-a', 'proj-b'])
    }
    await expect(tabNamed(pageB, 'proj-b')).toHaveClass(/\bactive\b/)
    await expect(tabNamed(pageB, 'proj-a')).not.toHaveClass(/\bactive\b/)
    expect(await activePage(app)).toBe(pageB)
    // A single window: no extra BaseWindow.
    expect(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)).toBe(1)
  })

  test('activating by tab and by ⌘1/⌘2 switches workspace without losing the editor tabs', async ({
    launchWorkspaces
  }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await treeRow(pageA, 'alfa.txt').dblclick()
    await expect(editorTabs(pageA)).toHaveText(['alfa.txt'])

    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    await treeRow(pageB, 'beta.txt').dblclick()
    await expect(editorTabs(pageB)).toHaveText(['beta.txt'])

    // ⌘1 goes back to A: the editor tab is still there, and B's too when going back.
    expect(await select(1)).toBe(pageA)
    await expect(tabNamed(pageA, 'proj-a')).toHaveClass(/\bactive\b/)
    await expect(editorTabs(pageA)).toHaveText(['alfa.txt'])
    await expect(pageA.locator('.cm-content')).toContainText('alfa')
    expect(await select(2)).toBe(pageB)
    await expect(editorTabs(pageB)).toHaveText(['beta.txt'])

    // Clicking the bar tab also activates.
    await tabNamed(pageB, 'proj-a').click()
    await expect.poll(async () => activePage(app)).toBe(pageA)

    // Next/previous wrap around the list.
    await sendCommand(app, pageA, 'workspace.next')
    await expect.poll(async () => activePage(app)).toBe(pageB)
    await sendCommand(app, pageB, 'workspace.next')
    await expect.poll(async () => activePage(app)).toBe(pageA)
    await sendCommand(app, pageA, 'workspace.previous')
    await expect.poll(async () => activePage(app)).toBe(pageB)
  })

  test('a workspace terminal survives the switch and keeps responding', async ({ launchWorkspaces }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)

    expect(await select(1)).toBe(pageA)
    await sendCommand(app, pageA, 'terminal.toggle')
    await expect(pageA.locator('.xterm')).toBeVisible()
    // Text typed before the prompt shows twice: waits for the shell.
    await expect.poll(async () => (await pageA.locator('.xterm-rows').innerText()).trim().length).toBeGreaterThan(0)
    await pageA.locator('.xterm').click()
    await pageA.keyboard.type('echo walph-$((40+2))')
    await pageA.keyboard.press('Enter')
    await expect(pageA.locator('.xterm-rows')).toContainText('walph-42')

    expect(await select(2)).toBe(pageB)
    await expect(pageB.locator('.xterm')).toHaveCount(0)
    expect(await select(1)).toBe(pageA)
    await expect(pageA.locator('.xterm-rows')).toContainText('walph-42')
    await pageA.locator('.xterm').click()
    await pageA.keyboard.type('echo back-$((6*7))')
    await pageA.keyboard.press('Enter')
    await expect(pageA.locator('.xterm-rows')).toContainText('back-42')
  })

  test('adding an already open folder activates its tab instead of duplicating', async ({ launchWorkspaces }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    await expect.poll(() => tabNames(pageB)).toEqual(['proj-a', 'proj-b'])
    expect(await activePage(app)).toBe(pageB)

    // B (active) asks for A again: activates A, with no new tab or view.
    expect(await addWorkspace(pageB, repoA)).toBe(false)
    await expect.poll(async () => activePage(app)).toBe(pageA)
    await expect(workspaceTabs(pageA)).toHaveCount(2)
    expect(app.windows().length).toBe(2)

    // Also when the request comes from A and the folder is the active workspace's own.
    expect(await addWorkspace(pageA, repoA)).toBe(false)
    await expect(workspaceTabs(pageA)).toHaveCount(2)
    expect(await activePage(app)).toBe(pageA)
  })

  test('a relative path and a missing folder are rejected with a pt-BR message', async ({ launchWorkspaces }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    const relative = pageA.evaluate(() => (globalThis as unknown as WalphGlobals).api.workspaces.add('relative/dir'))
    await expect(relative).rejects.toThrow(/caminho absoluto/)
    const missing = addWorkspace(pageA, join(tmpBase, 'missing'))
    await expect(missing).rejects.toThrow(/não existe mais/)
    await expect(workspaceTabs(pageA)).toHaveCount(1)
  })

  test('dragging the order (move) reorders the tabs in both views', async ({ launchWorkspaces }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    await addWorkspace(pageB, repoC)
    const pageC = await waitPageOfRoot(app, repoC)
    await expect.poll(() => tabNames(pageC)).toEqual(['proj-a', 'proj-b', 'proj-c'])

    const idOfC = await pageC.evaluate(async () => {
      const state = await (globalThis as unknown as WalphGlobals).api.workspaces.list()
      return state.selfId
    })
    await pageC.evaluate((id) => (globalThis as unknown as WalphGlobals).api.workspaces.move(id, 0), idOfC)
    for (const page of [pageA, pageB, pageC]) {
      await expect.poll(() => tabNames(page)).toEqual(['proj-c', 'proj-a', 'proj-b'])
    }
    // The shortcut follows the position: ⌘1 is now C.
    await expect(tabNamed(pageC, 'proj-c')).toHaveClass(/\bactive\b/)
    expect(await select(2)).toBe(pageA)
  })
})

test.describe('Claude notices in an inactive workspace', () => {
  test('finishes in the inactive one: the tab gets the counter, the active view shows the toast with the origin and "Abrir workspace" clears it', async ({
    launchWorkspaces
  }) => {
    const pageA = await launchWorkspaces({
      folders: [repoA],
      turns: [[{ delay: 1500 }, { assistant: 'work done' }]]
    })
    await spyNotifications()
    await sendCommand(app, pageA, 'claude.toggleSidebar')
    await expect(pageA.locator('.claude-tab[role=tab]')).toHaveCount(1)
    await sendClaude(pageA, 'session A')
    await expect(claudeTab(pageA, 'session A')).toBeVisible()

    // Leaves A while Claude works: A becomes inactive.
    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    await expect(tabNamed(pageB, 'proj-a')).toHaveAttribute('data-status', 'running')

    // Finished: counter on A's tab (seen from B's active view), no counter on the active tab itself.
    const unread = tabNamed(pageB, 'proj-a').locator('.workspace-tab-unread')
    await expect(unread).toHaveText('1')
    await expect(unread).toHaveAttribute('aria-label', '1 não lida')
    await expect(tabNamed(pageB, 'proj-b').locator('.workspace-tab-unread')).toHaveCount(0)
    await expect(tabNamed(pageB, 'proj-a')).toHaveAttribute('data-status', 'done')

    // Toast only in the active view, with the origin workspace card and the path in the tooltip.
    const toast = pageB.locator('.toasts .toast[data-tone="done"]')
    await expect(toast).toHaveCount(1)
    const origin = pageB.locator('.toasts .toast-stack:has(.toast[data-tone="done"]) .toast-origin')
    await expect(origin.locator('.toast-origin-name')).toHaveText('proj-a')
    await expect(origin.locator('.toast-origin-branch')).toHaveText('main')
    await expect(origin).toHaveAttribute('title', repoA)
    await expect(pageA.locator('.toasts .toast[data-tone="done"]')).toHaveCount(0)

    // "Abrir workspace" activates A, removes the toast and clears the counter in both views.
    await toast.getByRole('button', { name: 'Abrir workspace' }).click()
    await expect.poll(async () => activePage(app)).toBe(pageA)
    await expect(tabNamed(pageA, 'proj-a')).toHaveClass(/\bactive\b/)
    await expect(workspaceTabs(pageA).locator('.workspace-tab-unread')).toHaveCount(0)
    await expect(workspaceTabs(pageB).locator('.workspace-tab-unread')).toHaveCount(0)
    await expect(tabNamed(pageA, 'proj-a')).not.toHaveAttribute('data-status', 'done')
    await expect(pageB.locator('.toasts .toast[data-tone="done"]')).toHaveCount(0)
    // The session that finished is the one shown on open.
    await expect(claudeTab(pageA, 'session A')).toHaveAttribute('aria-selected', 'true')
  })

  test('activating the workspace by tab (without the toast) also clears the counter and dismisses the toast', async ({
    launchWorkspaces
  }) => {
    const pageA = await launchWorkspaces({
      folders: [repoA],
      turns: [[{ delay: 1000 }, { assistant: 'pronto' }]]
    })
    await sendCommand(app, pageA, 'claude.toggleSidebar')
    await sendClaude(pageA, 'session A')
    await expect(claudeTab(pageA, 'session A')).toBeVisible()
    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    await expect(tabNamed(pageB, 'proj-a').locator('.workspace-tab-unread')).toHaveText('1')
    await expect(pageB.locator('.toasts .toast[data-tone="done"]')).toHaveCount(1)

    expect(await select(1)).toBe(pageA)
    await expect(workspaceTabs(pageA).locator('.workspace-tab-unread')).toHaveCount(0)
    await expect(pageB.locator('.toasts .toast[data-tone="done"]')).toHaveCount(0)
  })

  test('a finished session and another running: the tab shows the counter and the running indicator', async ({
    launchWorkspaces
  }) => {
    const pageA = await launchWorkspaces({
      folders: [repoA],
      turns: [[{ assistant: 'first done' }], [{ delay: 30_000 }, { assistant: 'never arrives' }]]
    })
    await sendCommand(app, pageA, 'claude.toggleSidebar')
    // Window without OS focus: otherwise the open and seen session would be marked as read when it finishes.
    await blurWindow(pageA)
    await sendClaude(pageA, 'session A')
    await expect(claudeTab(pageA, 'session A')).toBeVisible()
    await expect(pageA.locator('.claude-tab[role=tab] .status-dot.done').first()).toBeVisible()
    await pageA.getByRole('button', { name: 'Nova conversa' }).click()
    await expect(pageA.locator('.claude-tab[role=tab]')).toHaveCount(2)
    await sendClaude(pageA, 'session B')
    await expect(claudeTab(pageA, 'session B')).toBeVisible()

    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    const tabA = tabNamed(pageB, 'proj-a')
    // running takes priority over done in the status, but the counter still holds.
    await expect(tabA).toHaveAttribute('data-status', 'running')
    await expect(tabA).toHaveClass(/\brunning\b/)
    await expect(tabA.locator('.workspace-tab-unread')).toHaveText('1')
    // The active workspace (B) shows none of this.
    await expect(tabNamed(pageB, 'proj-b')).not.toHaveClass(/\brunning\b/)
  })
})

test.describe('persistence', () => {
  test('closing with three workspaces and reopening restores the three tabs, the active one and each session', async ({
    launchWorkspaces
  }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await treeRow(pageA, 'alfa.txt').dblclick()
    await expect(editorTabs(pageA)).toHaveText(['alfa.txt'])

    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    await treeRow(pageB, 'beta.txt').dblclick()
    await expect(editorTabs(pageB)).toHaveText(['beta.txt'])

    await addWorkspace(pageB, repoC)
    const pageC = await waitPageOfRoot(app, repoC)
    await treeRow(pageC, 'gama.txt').dblclick()
    await expect(editorTabs(pageC)).toHaveText(['gama.txt'])

    // The active one at the end is the middle one.
    expect(await select(2)).toBe(pageB)
    await app.close()

    const restored = await launchWorkspaces()
    // Only the active one gets a view; the others stay dormant, but with a tab (folder name).
    await expect.poll(() => tabNames(restored)).toEqual(['proj-a', 'proj-b', 'proj-c'])
    expect(await restored.evaluate(() => (globalThis as unknown as WalphGlobals).api.workspace.current())).toBe(repoB)
    await expect(tabNamed(restored, 'proj-b')).toHaveClass(/\bactive\b/)
    await expect(tabNamed(restored, 'proj-a')).toHaveClass(/\bdormant\b/)
    await expect(tabNamed(restored, 'proj-c')).toHaveClass(/\bdormant\b/)
    expect(app.windows().length).toBe(1)
    await expect(editorTabs(restored)).toHaveText(['beta.txt'])

    // Activating a dormant one creates its view and restores its session.
    await tabNamed(restored, 'proj-a').click()
    const restoredA = await waitPageOfRoot(app, repoA)
    await expect(editorTabs(restoredA)).toHaveText(['alfa.txt'])
    await expect(tabNamed(restoredA, 'proj-a')).not.toHaveClass(/\bdormant\b/)
    await tabNamed(restoredA, 'proj-c').click()
    const restoredC = await waitPageOfRoot(app, repoC)
    await expect(editorTabs(restoredC)).toHaveText(['gama.txt'])
    await expect(restoredC.locator('.cm-content')).toContainText('gama')
  })

  test('a folder that vanished between runs does not come back as a tab', async ({ launchWorkspaces, makeRepo }) => {
    const gone = makeRepo({ 'x.txt': 'x\n' }, 'proj-some')
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await addWorkspace(pageA, gone)
    await waitPageOfRoot(app, gone)
    await select(1)
    await app.close()
    rmSync(gone, { recursive: true, force: true })

    const restored = await launchWorkspaces()
    await expect.poll(() => tabNames(restored)).toEqual(['proj-a'])
    await expect(tabNamed(restored, 'proj-a')).toHaveClass(/\bactive\b/)
  })
})

test.describe('close workspace', () => {
  test('ends only its own processes: the closed one pty dies and the other stays alive', async ({
    launchWorkspaces
  }) => {
    test.skip(process.platform === 'win32', 'uses process.kill(pid, 0) and $$')
    const pageA = await launchWorkspaces({ folders: [repoA] })
    const pidA = await shellPid(pageA, repoA)
    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    const pidB = await shellPid(pageB, repoB)
    expect(pidA).not.toBe(pidB)
    expect(isAlive(pidA)).toBe(true)
    expect(isAlive(pidB)).toBe(true)

    // Closes A (inactive) through B's view API, like the tab "x".
    const idOfA = await pageA.evaluate(
      async () => (await (globalThis as unknown as WalphGlobals).api.workspaces.list()).selfId
    )
    await pageB.evaluate((id) => (globalThis as unknown as WalphGlobals).api.workspaces.close(id), idOfA)

    await expect.poll(() => isAlive(pidA), { timeout: 10_000 }).toBe(false)
    expect(isAlive(pidB)).toBe(true)
    await expect.poll(() => tabNames(pageB)).toEqual(['proj-b'])
    await expect.poll(() => app.windows().length).toBe(1)
    expect(await activePage(app)).toBe(pageB)
    await expect(treeRow(pageB, 'beta.txt')).toBeVisible()
  })

  test('closing the active one by command activates the neighbor and keeps the window', async ({
    launchWorkspaces
  }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await addWorkspace(pageA, repoB)
    const pageB = await waitPageOfRoot(app, repoB)
    await addWorkspace(pageB, repoC)
    const pageC = await waitPageOfRoot(app, repoC)
    expect(await select(2)).toBe(pageB)

    await sendCommand(app, pageB, 'workspace.close')
    await expect.poll(() => tabNames(pageC)).toEqual(['proj-a', 'proj-c'])
    // Takes the closed one's place: the neighbor that now has the same index (C).
    await expect.poll(async () => activePage(app)).toBe(pageC)
    await expect.poll(() => pageB.isClosed()).toBe(true)
  })

  test('closing the last workspace leaves the window open with the Welcome', async ({ launchWorkspaces }) => {
    const pageA = await launchWorkspaces({ folders: [repoA] })
    await expect(treeRow(pageA, 'alfa.txt')).toBeVisible()

    await sendCommand(app, pageA, 'workspace.close')
    const empty = await waitActivePage(app)
    await expect(empty.locator('.welcome')).toBeVisible()
    await expect.poll(() => tabNames(empty)).toEqual(['Sem pasta'])
    expect(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)).toBe(1)
    expect(await empty.evaluate(() => (globalThis as unknown as WalphGlobals).api.workspace.current())).toBeNull()

    // Closing the empty view again does nothing (nothing to close) and the window stays.
    await sendCommand(app, empty, 'workspace.close')
    await expect(empty.locator('.welcome')).toBeVisible()
    expect(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)).toBe(1)

    // And the empty window still opens a folder (reuses the empty view instead of adding a tab).
    await addWorkspace(empty, repoB)
    const opened = await waitPageOfRoot(app, repoB)
    await expect(treeRow(opened, 'beta.txt')).toBeVisible()
    await expect.poll(() => tabNames(opened)).toEqual(['proj-b'])
  })
})
