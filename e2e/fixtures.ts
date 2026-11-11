import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, makeRepo as makeRepoIn, setWindowFocus } from './helpers'

export { expect }

export interface LaunchSpec {
  folders?: string[] | undefined
  env?: Record<string, string> | undefined
  /** Contents of `<userData>/settings.json` written before opening the app. */
  settings?: Record<string, unknown> | undefined
  /** Script of the fake Claude SDK (`WALPH_FAKE_CLAUDE`). */
  claudeScript?: unknown
  /** Turns on the fake session store (`WALPH_FAKE_CLAUDE_STORE`), the same across test restarts. */
  claudeStore?: boolean | undefined
  executablePath?: string | undefined
}

export interface Launched {
  app: ElectronApplication
  page: Page
}

export type Launch = (spec?: LaunchSpec) => Promise<Launched>
export type MakeRepo = (files: Record<string, string>, name?: string) => string

export function makeTmpDir(prefix = 'walph-e2e-'): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
}

export function removeDir(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true })
}

/** A dirty tab makes main ask before closing (native dialog): with no answer in 5 s, kills the process. */
export async function closeApp(app: ElectronApplication | null | undefined): Promise<void> {
  if (!app) return
  let proc: ReturnType<ElectronApplication['process']> | null = null
  try {
    proc = app.process()
  } catch {
    // the test already closed the app
  }
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
  if (proc && proc.exitCode === null) proc.kill('SIGKILL')
}

/** `exit` and not `close`: dirty tabs left by the test would make the quit guard open the native dialog (hanging). */
export async function exitApp(app: ElectronApplication | null | undefined): Promise<void> {
  if (!app) return
  await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {})
  await app.close().catch(() => {})
}

/** The native confirmation dialog cannot be automated: main starts answering `response` (0 = confirm). */
export async function stubConfirm(app: ElectronApplication, response: number): Promise<void> {
  await app.evaluate(({ dialog }, r) => {
    const g = globalThis as unknown as { __confirmCalls: unknown[] }
    g.__confirmCalls = []
    dialog.showMessageBox = (...args: unknown[]) => {
      g.__confirmCalls.push(args[args.length - 1])
      return Promise.resolve({ response: r, checkboxChecked: false })
    }
  }, response)
}

export const confirmCalls = (app: ElectronApplication): Promise<{ message: string; buttons: string[] }[]> =>
  app.evaluate(() => (globalThis as unknown as { __confirmCalls: never[] }).__confirmCalls)

/** For specs comparing the text of `.cm-content`: the line blame and the inlay hints are widgets inside it. */
export const PLAIN_EDITOR_SETTINGS = { 'git.blame.inline': false, 'editor.inlayHints.enabled': 'off' }

/** Opens the app with an isolated `userData`, the fake Claude script and the requested folders. */
export async function launchWith(tmp: string, userDataDir: string, spec: LaunchSpec = {}): Promise<Launched> {
  mkdirSync(userDataDir, { recursive: true })
  if (spec.settings) writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify(spec.settings))
  const env = { ...spec.env }
  if (spec.claudeScript !== undefined) {
    const script = join(tmp, `script-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(script, JSON.stringify(spec.claudeScript))
    env.WALPH_FAKE_CLAUDE = script
  }
  if (spec.claudeStore) env.WALPH_FAKE_CLAUDE_STORE = join(tmp, 'claude-store.json')
  const app = await launchApp({
    userDataDir,
    folders: spec.folders,
    env,
    executablePath: spec.executablePath
  })
  const page = await app.firstWindow()
  return { app, page }
}

interface Fixtures {
  /** Temporary folder of the test, removed at the end. */
  tmp: string
  userDataDir: string
  /** Creates a git repository with one commit at `<tmp>/<name>`. */
  makeRepo: MakeRepo
  /** Opens the app; every opened app is closed at the end of the test. */
  launch: Launch
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring even without dependencies
  tmp: async ({}, use) => {
    const dir = makeTmpDir()
    await use(dir)
    removeDir(dir)
  },
  userDataDir: async ({ tmp }, use) => {
    const dir = join(tmp, 'userdata')
    mkdirSync(dir, { recursive: true })
    await use(dir)
  },
  makeRepo: async ({ tmp }, use) => {
    let seq = 0
    await use((files, name = `repo-${++seq}`) => makeRepoIn(tmp, name, files))
  },
  launch: async ({ tmp, userDataDir }, use) => {
    const apps: ElectronApplication[] = []
    await use(async (spec) => {
      const launched = await launchWith(tmp, userDataDir, spec)
      apps.push(launched.app)
      return launched
    })
    await Promise.all(apps.map(closeApp))
  }
})

export interface ClaudeLaunchSpec {
  folder: string
  script: unknown
  settings?: Record<string, unknown> | undefined
  store?: boolean | undefined
  env?: Record<string, string> | undefined
}

/** Opens the app with the fake Claude SDK and the window without OS focus (auto focus only for a seen session). */
export async function startClaude(launch: Launch, spec: ClaudeLaunchSpec): Promise<Launched> {
  const launched = await launch({
    folders: [spec.folder],
    settings: { 'terminal.gpuAcceleration': 'off', ...spec.settings },
    claudeScript: spec.script,
    claudeStore: spec.store,
    env: spec.env
  })
  await expect(launched.page.locator('.tree .tree-row').first()).toBeVisible()
  await setWindowFocus(launched.page, false)
  return launched
}
