import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { WalphApi } from '@shared/types'
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'

// The window is a `BaseWindow` with no webContents of its own and each workspace is a `WebContentsView`:
// `BrowserWindow.getAllWindows()` returns empty and `app.browserWindow(page)` does not see the view. These helpers
// talk to the view through its `webContents`.

/** `window.api` as seen from inside `page.evaluate` (this project has no DOM lib). */
export interface WalphGlobals {
  api: WalphApi
}

export const appRoot = resolve(__dirname, '..')

/**
 * An inherited `ELECTRON_RUN_AS_NODE` (VS Code / Claude Code) would make Electron run as plain Node. `WALPH_LOCALE`
 * pins the system language to pt-BR: the specs check the pt-BR texts on any machine.
 */
export function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)
  ) as Record<string, string>
  return { WALPH_LOCALE: 'pt-BR', ...env, ...extra }
}

let emptyGitConfig: string | null = null

/** Empty config in a file: `os.devNull` is `\\.\nul` on Windows and git does not read that path. */
function emptyGitConfigFile(): string {
  if (emptyGitConfig) return emptyGitConfig
  const dir = mkdtempSync(join(tmpdir(), 'walph-e2e-gitcfg-'))
  const file = join(dir, 'config')
  writeFileSync(file, '')
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
  emptyGitConfig = file
  return file
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Walph Test', '-c', 'user.email=test@walph.local', ...args], {
    cwd,
    // Isolates from the user's ~/.gitconfig (e.g. commit.gpgsign would ask for a passphrase or fail without the key).
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: emptyGitConfigFile()
    },
    stdio: 'pipe',
    encoding: 'utf8'
  })
}

/** Creates a git repository with one commit at `<base>/<name>` and returns its path. */
export function makeRepo(base: string, name: string, files: Record<string, string>): string {
  const dir = join(base, name)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'initial')
  return dir
}

export interface LaunchOptions {
  userDataDir: string
  folders?: string[] | undefined
  env?: Record<string, string> | undefined
  /** Packaged app executable; without it, opens `out/main/index.js` with the project's Electron. */
  executablePath?: string | undefined
}

/** Opens the built app (`out/main/index.js`) with an isolated `--user-data-dir` and the folders as argv. */
export function launchApp({
  userDataDir,
  folders = [],
  env = {},
  executablePath
}: LaunchOptions): Promise<ElectronApplication> {
  const args = [`--user-data-dir=${userDataDir}`, ...folders]
  return electron.launch({
    ...(executablePath ? { executablePath, args } : { args: [join(appRoot, 'out/main/index.js'), ...args] }),
    env: cleanEnv(env)
  })
}

const viewIds = new WeakMap<Page, number>()

/** Id of the `webContents` serving the page (the workspace view). Marks the page and looks for the mark in main. */
export async function webContentsIdOf(app: ElectronApplication, page: Page): Promise<number> {
  const cached = viewIds.get(page)
  if (cached !== undefined) return cached
  const mark = `e2e-${Math.random().toString(36).slice(2)}`
  await page.evaluate((m) => {
    ;(globalThis as unknown as { __e2eMark: string }).__e2eMark = m
  }, mark)
  const id = await app.evaluate(async ({ webContents }, m) => {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue
      const found: unknown = await wc.executeJavaScript('window.__e2eMark').catch(() => null)
      if (found === m) return wc.id
    }
    return -1
  }, mark)
  if (id < 0) throw new Error('The page does not belong to any webContents of the app.')
  viewIds.set(page, id)
  return id
}

/** Sends an event from main to the view that owns the page (what the menu does with the active view). */
export async function sendToPage(
  app: ElectronApplication,
  page: Page,
  channel: string,
  ...args: unknown[]
): Promise<void> {
  const id = await webContentsIdOf(app, page)
  await app.evaluate(
    ({ webContents }, { id: wcId, channel: ch, args: a }) => {
      webContents.fromId(wcId)?.send(ch, ...a)
    },
    { id, channel, args }
  )
}

/** Native menu accelerators do not fire from synthetic keys: sends `app:command` through main, as the menu does. */
export function sendCommand(app: ElectronApplication, page: Page, id: string): Promise<void> {
  return sendToPage(app, page, 'app:command', id)
}

/** Simulates main's request to open a folder in this view (the native dialog cannot be automated). */
export function requestOpen(app: ElectronApplication, page: Page, folder: string): Promise<void> {
  return sendToPage(app, page, 'workspace:openRequested', folder)
}

/** Id of the `BaseWindow` hosting the page's view (the views of a window share the same one). */
export async function hostWindowId(app: ElectronApplication, page: Page): Promise<number> {
  const id = await webContentsIdOf(app, page)
  const winId = await app.evaluate(({ BaseWindow }, wcId) => {
    const win = BaseWindow.getAllWindows().find((w) =>
      w.contentView.children.some((v) => (v as Electron.WebContentsView).webContents?.id === wcId)
    )
    return win ? win.id : -1
  }, id)
  if (winId < 0) throw new Error('The view is not in any window.')
  return winId
}

/** Closes the page's host window (normal close, with the dirty files guard). */
export async function closeHostWindow(app: ElectronApplication, page: Page): Promise<void> {
  const winId = await hostWindowId(app, page)
  await app.evaluate(
    ({ BaseWindow }, id) =>
      BaseWindow.getAllWindows()
        .find((w) => w.id === id)
        ?.close(),
    winId
  )
}

/**
 * Records the calls to `BaseWindow.prototype.focus` (window ids) in `globalThis.__focused`. With hidden windows the
 * OS focus never changes: this is how "focused the other window" is checked. Returns the reader.
 */
export async function spyWindowFocus(app: ElectronApplication): Promise<() => Promise<number[]>> {
  await app.evaluate(({ BaseWindow }) => {
    const g = globalThis as unknown as { __focused: number[]; __focusPatched?: boolean }
    g.__focused = []
    if (g.__focusPatched) return
    g.__focusPatched = true
    const original = BaseWindow.prototype.focus
    BaseWindow.prototype.focus = function (this: Electron.BaseWindow) {
      g.__focused.push(this.id)
      return original.call(this)
    }
  })
  return () => app.evaluate(() => (globalThis as unknown as { __focused: number[] }).__focused)
}

/** Live pages (views) whose folder (`workspace.current()`) is `root`; `null` if none (yet). */
export async function pageOfRoot(app: ElectronApplication, root: string): Promise<Page | null> {
  for (const p of app.windows()) {
    const current = await p
      .evaluate(() => (globalThis as unknown as WalphGlobals).api.workspace.current())
      .catch(() => undefined)
    if (current === root) return p
  }
  return null
}

/** Waits for the view of the `root` folder's workspace to exist (dormant workspaces only get a view when activated). */
export async function waitPageOfRoot(app: ElectronApplication, root: string): Promise<Page> {
  let found: Page | null = null
  await expect
    .poll(
      async () => {
        found = await pageOfRoot(app, root)
        return found !== null
      },
      { message: `view de ${root}` }
    )
    .toBe(true)
  // Main answers before React mounts (it waits for the fonts) and subscribes to `app:command`: a `sendCommand` right
  // after would be lost.
  await expect(found!.locator('.workspace-bar')).toBeVisible()
  return found!
}

/** The page of the window's visible view (the active workspace's); `null` if none has state yet. */
export async function activePage(app: ElectronApplication): Promise<Page | null> {
  for (const p of app.windows()) {
    const state = await p
      .evaluate(() => (globalThis as unknown as WalphGlobals).api.workspaces.list())
      .catch(() => null)
    if (state && state.workspaces.find((w) => w.active)?.id === state.selfId) return p
  }
  return null
}

/** Waits for an active view and returns it (it disappears briefly while the workspace switches). */
export async function waitActivePage(app: ElectronApplication): Promise<Page> {
  let found: Page | null = null
  await expect
    .poll(
      async () => {
        found = await activePage(app)
        return found !== null
      },
      { message: 'view do workspace ativo' }
    )
    .toBe(true)
  return found!
}

/** Playwright emulates page focus: simulates the window with or without OS focus (the hidden test one never has it). */
export const setWindowFocus = (page: Page, focused: boolean): Promise<void> =>
  page.evaluate((f) => {
    // The e2e tsconfig has no DOM lib: the code runs in the page, so only what it uses is typed.
    const g = globalThis as unknown as {
      document: { hasFocus(): boolean }
      dispatchEvent(event: unknown): boolean
      Event: new (type: string) => unknown
    }
    g.document.hasFocus = () => f
    g.dispatchEvent(new g.Event(f ? 'focus' : 'blur'))
  }, focused)

export const blurWindow = (page: Page): Promise<void> => setWindowFocus(page, false)
export const focusWindow = (page: Page): Promise<void> => setWindowFocus(page, true)

/** Waits for the renderer to settle: two rAF passes after the current state (React already applied what was queued). */
export const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const g = globalThis as unknown as { requestAnimationFrame(cb: () => void): number }
        g.requestAnimationFrame(() => g.requestAnimationFrame(() => resolve()))
      })
  )

/** Waits for the renderer to finish the async work flagged in `<html data-pending>` (`lib/pendingWork.ts`). */
export async function waitForIdle(page: Page): Promise<void> {
  await expect(page.locator('html[data-pending]')).toHaveCount(0)
  await settle(page)
}

/** Count of an internal main event (`countTestEvent` in `window/hiddenMode.ts`). */
export const testEventCount = (app: ElectronApplication, name: string): Promise<number> =>
  app.evaluate(
    (_, n) => (globalThis as { __walphTestEvents?: Record<string, number> }).__walphTestEvents?.[n] ?? 0,
    name
  )

/**
 * Waits for the folder watcher to deliver a batch: creates a file, waits for it to appear in the explorer (which is
 * open) and deletes it. Events arrive in order, so everything that happened on disk before has already been processed.
 */
export async function flushWatcher(page: Page, dir: string): Promise<void> {
  const name = `flush-${Math.random().toString(36).slice(2, 8)}.txt`
  const row = page.locator('.tree .tree-row .tree-label', { hasText: name })
  writeFileSync(join(dir, name), '')
  await expect(row).toBeVisible()
  rmSync(join(dir, name))
  await expect(row).toHaveCount(0)
}

/** Text of all sessions saved by main in `<userData>/sessions` (the file is per folder). */
export function sessionFilesText(userDataDir: string): string {
  const dir = join(userDataDir, 'sessions')
  try {
    return readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
  } catch {
    return ''
  }
}

/** Waits for the terminal output to stop changing (prompt drawn): typing before it would duplicate the input. */
export async function waitForTerminalIdle(pane: Locator, timeout = 20_000): Promise<void> {
  let last = ''
  let stable = 0
  await expect
    .poll(
      async () => {
        const text = await pane.locator('.xterm-rows').innerText()
        stable = text.trim() !== '' && text === last ? stable + 1 : 0
        last = text
        return stable
      },
      { intervals: [100], timeout }
    )
    .toBeGreaterThanOrEqual(3)
}

/**
 * Records in main the `window:setContext` calls received (`when` contexts, like `claudeFocus`). Returns the wait for
 * the latest value of a key: the app handler runs before the spy, so the value already holds when the spy sees it.
 */
export async function spyContexts(app: ElectronApplication): Promise<(key: string, value: boolean) => Promise<void>> {
  await app.evaluate(({ ipcMain }) => {
    const g = globalThis as unknown as { __contexts?: Record<string, unknown> }
    if (g.__contexts) return
    g.__contexts = {}
    ipcMain.on('window:setContext', (_event, key: string, value: unknown) => {
      g.__contexts![key] = value
    })
  })
  return (key, value) =>
    expect
      .poll(() =>
        app.evaluate(
          (_electron, k) => (globalThis as unknown as { __contexts: Record<string, unknown> }).__contexts[k],
          key
        )
      )
      .toBe(value)
}
