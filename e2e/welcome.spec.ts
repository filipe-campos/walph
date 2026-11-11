import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { closeApp, expect, makeTmpDir, removeDir, test } from './fixtures'
import { launchApp, makeRepo, pageOfRoot, sendCommand, waitPageOfRoot, type WalphGlobals } from './helpers'

// Welcome: recents with multiple selection, clone repository (progress, cancel, rejected URL), Terminal and
// "Comece com o Claude". The folder dialog is native: `dialog.showOpenDialog` is replaced in main. The Claude SDK is
// the fake one (`WALPH_FAKE_CLAUDE`). `file://` is only accepted in test mode (hidden windows, unpackaged app).

type Call = Record<string, unknown>

const isWindows = process.platform === 'win32'

let tmpBase: string
let userDataDir: string
let home: string
let repos: string[]
let app: ElectronApplication | null = null
let count = 0

const HOUR = 3_600_000

/** Writes `<userData>/recent.json` before opening the app (the list is loaded on the first read). */
function seedRecents(folders: Array<{ path: string; lastOpened: number | null; branch: string | null }>): void {
  writeFileSync(join(userDataDir, 'recent.json'), JSON.stringify({ folders }))
}

interface LaunchOptions {
  env?: Record<string, string>
  turns?: Array<Array<Record<string, unknown>>>
}

/** Opens the app WITHOUT a folder: the Welcome shows. `HOME` points to a temporary folder (empty terminal cwd). */
async function launch(options: LaunchOptions = {}): Promise<Page> {
  const env: Record<string, string> = { HOME: home, USERPROFILE: home, ...options.env }
  if (options.turns) {
    const script = join(tmpBase, `script-${count}.json`)
    writeFileSync(script, JSON.stringify({ turns: options.turns }))
    env.WALPH_FAKE_CLAUDE = script
    env.WALPH_FAKE_CLAUDE_STORE = join(tmpBase, `store-${count}.json`)
  }
  app = await launchApp({ userDataDir, env })
  const page = await app.firstWindow()
  await expect(page.locator('.welcome')).toBeVisible()
  await expect(page.locator('.workspace-bar')).toBeVisible()
  return page
}

const rows = (page: Page): Locator => page.locator('li.recent-item')
const rowOf = (page: Page, path: string): Locator =>
  rows(page).filter({ has: page.locator(`button.recent-open[title="${path}"]`) })
const workspaceTabs = (page: Page): Locator => page.locator('.workspace-bar .workspace-tab')
const tabNames = (page: Page): Promise<string[]> => workspaceTabs(page).locator('.workspace-tab-name').allTextContents()
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Replaces `dialog.showOpenDialog` and counts the calls in `globalThis.__dialogCalls`. `null` = user cancels. */
function stubOpenDialog(path: string | null): Promise<void> {
  return app!.evaluate(({ dialog }, picked) => {
    const g = globalThis as unknown as { __dialogCalls: number }
    g.__dialogCalls = 0
    dialog.showOpenDialog = () => {
      g.__dialogCalls++
      return Promise.resolve(picked ? { canceled: false, filePaths: [picked] } : { canceled: true, filePaths: [] })
    }
  }, path)
}

const dialogCalls = (): Promise<number> =>
  app!.evaluate(() => (globalThis as unknown as { __dialogCalls: number }).__dialogCalls)

const claudeCalls = (): Promise<Call[]> =>
  app!.evaluate(
    () => (globalThis as unknown as { __walphFakeClaudeCalls?: Call[] }).__walphFakeClaudeCalls?.slice() ?? []
  )

/** Opens the clone URL picker (`git.clone` command) and types the URL. */
async function typeCloneUrl(page: Page, url: string): Promise<Locator> {
  await sendCommand(app!, page, 'git.clone')
  const input = page.locator('input.palette-input')
  await expect(input).toBeFocused()
  await input.fill(url)
  return input
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test.beforeAll(() => {
  tmpBase = makeTmpDir('walph-e2e-welcome-')
  repos = ['proj-a', 'proj-b', 'proj-c'].map((name) => makeRepo(tmpBase, name, { [`${name}.txt`]: `${name}\n` }))
})

test.afterAll(() => {
  removeDir(tmpBase)
})

test.beforeEach(() => {
  count++
  userDataDir = join(tmpBase, `ud-${count}`)
  home = join(tmpBase, `home-${count}`)
  mkdirSync(userDataDir, { recursive: true })
  mkdirSync(home, { recursive: true })
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ 'terminal.gpuAcceleration': 'off' }))
})

test.afterEach(async () => {
  await closeApp(app)
  app = null
})

test.describe('recents', () => {
  test('show branch and "aberto há"; with no selection the button is "Abrir todos"', async () => {
    seedRecents([
      { path: repos[0], lastOpened: Date.now() - 2 * HOUR, branch: 'feature/x' },
      { path: repos[1], lastOpened: null, branch: null }
    ])
    const page = await launch()
    await expect(rows(page)).toHaveCount(2)
    const first = rowOf(page, repos[0])
    await expect(first.locator('.recent-branch')).toHaveText('feature/x')
    await expect(first.locator('.recent-age')).toHaveText('aberto há 2 h')
    // An old entry without date/branch invents nothing.
    const second = rowOf(page, repos[1])
    await expect(second.locator('.recent-branch')).toHaveCount(0)
    await expect(second.locator('.recent-age')).toHaveCount(0)
    await expect(page.locator('button.recent-open-many')).toHaveText('Abrir todos')
    await expect(page.locator('button.recent-clear')).toHaveCount(0)
  })

  test('selecting three recents with ⌘/Ctrl-click and opening creates three tabs in the WorkspaceBar', async () => {
    seedRecents(repos.map((path, i) => ({ path, lastOpened: Date.now() - (i + 1) * HOUR, branch: 'main' })))
    const page = await launch()
    const openMany = page.locator('button.recent-open-many')

    // ⌘/Ctrl-click selects without opening.
    await rowOf(page, repos[0])
      .locator('button.recent-open')
      .click({ modifiers: [mod] })
    await expect(rowOf(page, repos[0])).toHaveAttribute('data-selected', 'true')
    await expect(openMany).toHaveText('Abrir 1 workspace')
    await expect(workspaceTabs(page)).toHaveCount(1)

    // Space selects the focused row (and does not open it).
    const second = rowOf(page, repos[1]).locator('button.recent-open')
    await second.focus()
    await second.press('Space')
    await expect(rowOf(page, repos[1])).toHaveAttribute('data-selected', 'true')
    await expect(openMany).toHaveText('Abrir 2 workspaces')

    // The checkbox also selects; space again unchecks.
    await rowOf(page, repos[2]).locator('input.recent-check').check()
    await expect(openMany).toHaveText('Abrir 3 workspaces')
    await second.press('Space')
    await expect(rowOf(page, repos[1])).toHaveAttribute('data-selected', 'false')
    await expect(openMany).toHaveText('Abrir 2 workspaces')
    await second.press('Space')
    await expect(openMany).toHaveText('Abrir 3 workspaces')
    await expect(page.locator('button.recent-clear')).toBeVisible()

    await openMany.click()
    // The empty view is reused by the first folder and the others come in dormant (only one view starts): three tabs,
    // one per folder; each loads when activated.
    const names = ['proj-a', 'proj-b', 'proj-c']
    const first = await waitPageOfRoot(app!, repos[0])
    await expect.poll(() => tabNames(first)).toEqual(expect.arrayContaining(names))
    await expect(workspaceTabs(first)).toHaveCount(3)
    await expect(first.locator('.workspace-bar .workspace-tab[data-status="dormant"]')).toHaveCount(2)
    expect(await pageOfRoot(app!, repos[1])).toBeNull()
    expect(await pageOfRoot(app!, repos[2])).toBeNull()
    await workspaceTabs(first).filter({ hasText: 'proj-b' }).click()
    const activated = await waitPageOfRoot(app!, repos[1])
    await expect(workspaceTabs(activated)).toHaveCount(3)
  })

  test('clearing the selection turns the button back to "Abrir todos"', async () => {
    seedRecents(repos.map((path) => ({ path, lastOpened: Date.now(), branch: null })))
    const page = await launch()
    await rowOf(page, repos[0]).locator('input.recent-check').check()
    await rowOf(page, repos[1]).locator('input.recent-check').check()
    await expect(page.locator('button.recent-open-many')).toHaveText('Abrir 2 workspaces')
    await page.locator('button.recent-clear').click()
    await expect(page.locator('button.recent-open-many')).toHaveText('Abrir todos')
    await expect(page.locator('li.recent-item[data-selected="true"]')).toHaveCount(0)
  })

  test('a single click opens only that folder', async () => {
    seedRecents(repos.map((path) => ({ path, lastOpened: Date.now(), branch: null })))
    const page = await launch()
    await rowOf(page, repos[1]).locator('button.recent-open').click()
    const opened = await waitPageOfRoot(app!, repos[1])
    await expect(workspaceTabs(opened)).toHaveCount(1)
    await expect.poll(() => tabNames(opened)).toEqual(['proj-b'])
  })
})

test.describe('clone repository', () => {
  let bare: string

  test.beforeEach(() => {
    // Local origin: `git clone --bare` of a repository with one file.
    const source = makeRepo(tmpBase, `source-${count}`, { 'README.md': '# source\n', 'src/app.txt': 'content\n' })
    bare = join(tmpBase, `source-${count}.git`)
    execFileSync('git', ['clone', '-q', '--bare', source, bare], { stdio: 'pipe' })
  })

  test('valid URL: progress arrives, the folder is cloned and opens as a workspace', async () => {
    const parent = join(tmpBase, `dest-${count}`)
    mkdirSync(parent)
    const page = await launch()
    // Listens to the progress before starting: the local clone is too fast to wait for the toast.
    await page.evaluate(() => {
      const g = globalThis as unknown as WalphGlobals & { __progress: Array<{ stage: string; destination: string }> }
      g.__progress = []
      g.api.git.onCloneProgress((p) => g.__progress.push({ stage: p.stage, destination: p.destination }))
    })
    await stubOpenDialog(parent)

    const input = await typeCloneUrl(page, `file://${bare}`)
    const item = page.locator('.palette-item', { hasText: `Clonar em "${basename(bare)}"…` })
    await expect(item).toBeVisible()
    await input.press('Enter')

    const destination = join(parent, basename(bare))
    const cloned = await waitPageOfRoot(app!, destination)
    expect(await dialogCalls()).toBe(1)
    // The folder has the repository files and the .git.
    expect(readFileSync(join(destination, 'README.md'), 'utf8')).toBe('# source\n')
    expect(readFileSync(join(destination, 'src/app.txt'), 'utf8')).toBe('content\n')
    expect(existsSync(join(destination, '.git'))).toBe(true)
    await expect.poll(() => tabNames(cloned)).toContain(basename(bare))
    await expect(cloned.locator('.tree .tree-row .tree-label', { hasText: /^README\.md$/ })).toBeVisible()
    await expect(cloned.locator('.toast[data-key="git:clone"]')).toHaveCount(0)

    // The progress went through the main event (the first stage is "Conectando"), always with the real destination.
    const events = await page.evaluate(
      () => (globalThis as unknown as { __progress: Array<{ stage: string; destination: string }> }).__progress
    )
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].stage).toBe('Conectando')
    expect(events.every((e) => e.destination === destination)).toBe(true)
  })

  test('canceling the folder dialog does not clone, notify or create anything', async () => {
    const parent = join(tmpBase, `dest-${count}`)
    mkdirSync(parent)
    const page = await launch()
    await stubOpenDialog(null)
    const input = await typeCloneUrl(page, `file://${bare}`)
    await expect(page.locator('.palette-item', { hasText: 'Clonar em' })).toBeVisible()
    await input.press('Enter')
    await expect.poll(dialogCalls).toBe(1)
    await expect(page.locator('.toast')).toHaveCount(0)
    await expect(workspaceTabs(page)).toHaveCount(1)
    expect(existsSync(join(parent, basename(bare)))).toBe(false)
  })

  test('an existing destination folder shows the error and keeps its contents', async () => {
    const parent = join(tmpBase, `dest-${count}`)
    const existing = join(parent, basename(bare))
    mkdirSync(existing, { recursive: true })
    writeFileSync(join(existing, 'mine.txt'), 'do not delete\n')
    const page = await launch()
    await stubOpenDialog(parent)
    const input = await typeCloneUrl(page, `file://${bare}`)
    await expect(page.locator('.palette-item', { hasText: 'Clonar em' })).toBeVisible()
    await input.press('Enter')
    await expect(page.locator('.toast-error')).toContainText('já existe')
    expect(readFileSync(join(existing, 'mine.txt'), 'utf8')).toBe('do not delete\n')
  })

  test.describe('with slow git', () => {
    // POSIX only: the fake "git" is a shell script. It writes the pid, prints a progress line, creates a file in the
    // partial folder and sleeps; the other subcommands (config, etc.) go to the real git.
    test.skip(isWindows, 'fake git is a shell script')

    let pidFile: string
    let bin: string

    test.beforeEach(() => {
      bin = join(tmpBase, `bin-${count}`)
      mkdirSync(bin)
      pidFile = join(tmpBase, `clone-${count}.pid`)
      const realGit = execFileSync('which', ['git']).toString().trim()
      const script = join(bin, 'git')
      writeFileSync(
        script,
        [
          '#!/bin/sh',
          'if [ "$1" = clone ]; then',
          '  for a; do dest="$a"; done',
          `  echo $$ > "${pidFile}"`,
          '  touch "$dest/partial.txt"',
          "  printf 'Receiving objects:  42%% (42/100)\\r' >&2",
          '  exec sleep 300',
          'fi',
          `exec "${realGit}" "$@"`,
          ''
        ].join('\n')
      )
      chmodSync(script, 0o755)
    })

    test('the toast shows the progress bar and "Cancelar" kills git and deletes the partial folder', async () => {
      const parent = join(tmpBase, `dest-${count}`)
      mkdirSync(parent)
      const page = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } })
      await stubOpenDialog(parent)
      const input = await typeCloneUrl(page, `file://${bare}`)
      await expect(page.locator('.palette-item', { hasText: 'Clonar em' })).toBeVisible()
      await input.press('Enter')

      const destination = join(parent, basename(bare))
      const toast = page.locator('.toast[data-key="git:clone"]')
      await expect(toast).toBeVisible()
      await expect(toast).toContainText(`Clonando ${basename(bare)}`)
      await expect(toast).toContainText('Recebendo objetos 42%')
      await expect(toast.locator('[role=progressbar]')).toBeVisible()
      // The fake git is running and the partial folder exists.
      await expect.poll(() => existsSync(pidFile)).toBe(true)
      const pid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(isAlive(pid)).toBe(true)
      expect(existsSync(join(destination, 'partial.txt'))).toBe(true)

      await toast.locator('.toast-action', { hasText: 'Cancelar' }).click()

      await expect(page.locator('.toast', { hasText: 'Clonagem cancelada.' })).toBeVisible()
      await expect(toast).toHaveCount(0)
      await expect.poll(() => existsSync(destination)).toBe(false)
      await expect.poll(() => isAlive(pid)).toBe(false)
      // No new workspace and the clone slot was released: cloning again works.
      await expect(workspaceTabs(page)).toHaveCount(1)
      const again = await typeCloneUrl(page, `file://${bare}`)
      await expect(page.locator('.palette-item', { hasText: 'Clonar em' })).toBeVisible()
      await again.press('Enter')
      await expect(page.locator('.toast[data-key="git:clone"]')).toBeVisible()
      await page.locator('.toast[data-key="git:clone"] .toast-action', { hasText: 'Cancelar' }).click()
      // The notice of the first cancel may still be on screen: there are two.
      await expect(page.locator('.toast', { hasText: 'Clonagem cancelada.' })).toHaveCount(2)
    })

    test('reloading the view during the clone kills git and deletes the partial folder', async () => {
      const parent = join(tmpBase, `dest-${count}`)
      mkdirSync(parent)
      const page = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } })
      await stubOpenDialog(parent)
      const input = await typeCloneUrl(page, `file://${bare}`)
      await expect(page.locator('.palette-item', { hasText: 'Clonar em' })).toBeVisible()
      await input.press('Enter')
      await expect.poll(() => existsSync(pidFile)).toBe(true)
      const pid = Number(readFileSync(pidFile, 'utf8').trim())

      await page.reload()
      await expect(page.locator('.welcome')).toBeVisible()
      await expect.poll(() => isAlive(pid)).toBe(false)
      await expect.poll(() => existsSync(join(parent, basename(bare)))).toBe(false)
    })
  })
})

test.describe('rejected clone URL', () => {
  test('the QuickInput shows the message in pt-BR and does not offer to clone', async () => {
    const page = await launch()
    await stubOpenDialog(join(tmpBase, 'unused'))
    const cases: Array<[string, RegExp]> = [
      ['-x', /começam com "-"/],
      ['--upload-pack=touch /tmp/x', /começam com "-"/],
      ['ext::sh -c touch% /tmp/x', /Transporte "ext::" não é permitido\./],
      ['/home/user/repo', /caminhos locais não são aceitos/],
      ['http://github.com/a/b.git', /protocolo "http:\/\/"/]
    ]
    const input = await typeCloneUrl(page, cases[0][0])
    for (const [url, message] of cases) {
      await input.fill(url)
      const empty = page.locator('.palette-empty')
      await expect(empty).toContainText('URL de clone inválida:')
      await expect(empty).toContainText(message)
      await expect(page.locator('.palette-item')).toHaveCount(0)
    }
    // Enter on a rejected URL does nothing.
    await input.press('Enter')
    expect(await dialogCalls()).toBe(0)
    await expect(page.locator('.toast[data-key="git:clone"]')).toHaveCount(0)
  })

  test('api.git.clone rejects "-x" and "ext::" with a pt-BR message, without opening the dialog', async () => {
    const page = await launch()
    await stubOpenDialog(join(tmpBase, 'unused'))
    for (const url of ['-x', 'ext::sh -c touch% /tmp/x', '--upload-pack=x']) {
      const outcome = await page.evaluate(async (u) => {
        try {
          await (globalThis as unknown as WalphGlobals).api.git.clone(u)
          return 'resolved'
        } catch (err) {
          return (err as Error).message
        }
      }, url)
      expect(outcome, url).toContain('URL de clone inválida:')
    }
    expect(await dialogCalls()).toBe(0)
    const check = await page.evaluate(() => (globalThis as unknown as WalphGlobals).api.git.checkCloneUrl('ext::sh'))
    expect(check).toMatchObject({ ok: false })
  })
})

test.describe('terminal and Claude', () => {
  test('the Terminal action opens the panel with the shell in the user home', async () => {
    test.skip(isWindows, 'reads the cwd with pwd')
    const page = await launch()
    await expect(page.locator('.panel-container')).toBeHidden()
    await page.locator('.welcome-action[data-action="terminal.toggle"]').click()
    await expect(page.locator('.panel-container')).toBeVisible()
    const rowsText = page.locator('.xterm-rows')
    await expect(rowsText).toBeVisible()
    // The shell may read the line before the prompt appears; echoes a marker along with the cwd.
    const term = page.locator('.xterm-helper-textarea')
    await term.focus()
    await page.keyboard.type('echo "CWD=$(pwd -P)"')
    await page.keyboard.press('Enter')
    await expect(rowsText).toContainText(`CWD=${realpathSync(home)}`, { timeout: 20_000 })
  })

  test('"Comece com o Claude" with a selected recent opens the workspace and sends the request', async () => {
    seedRecents(repos.map((path) => ({ path, lastOpened: Date.now(), branch: 'main' })))
    const page = await launch({ turns: [[{ assistant: 'Starting now.' }]] })
    const request = 'create a README for the project'

    await rowOf(page, repos[1]).locator('input.recent-check').check()
    await expect(page.locator('.welcome-claude-target')).toContainText('Em proj-b')
    await page.locator('.welcome-claude-input').fill(request)
    await page.locator('.welcome-claude-input').press('Enter')

    const opened = await waitPageOfRoot(app!, repos[1])
    await expect.poll(() => tabNames(opened)).toEqual(['proj-b'])
    // The Claude panel shows the user request and the fake SDK reply.
    await expect(opened.locator('.claude-user-text', { hasText: request })).toBeVisible()
    await expect(opened.getByText('Starting now.', { exact: true })).toBeVisible()
    // The SDK received exactly the typed request, once.
    const users = (await claudeCalls()).filter((c) => c.type === 'user')
    expect(users).toHaveLength(1)
    expect(JSON.stringify(users[0].content)).toContain(request)
  })

  test('"Comece com o Claude" with no recent asks for the folder; canceling the dialog sends nothing', async () => {
    const page = await launch({ turns: [[{ assistant: 'Should not run.' }]] })
    await stubOpenDialog(null)
    const input = page.locator('.welcome-claude-input')
    await input.fill('hello')
    await input.press('Enter')
    await expect.poll(dialogCalls).toBe(1)
    // The text stays in the field and no session was created.
    await expect(input).toHaveValue('hello')
    await expect(workspaceTabs(page)).toHaveCount(1)
    expect((await claudeCalls()).filter((c) => c.type === 'user')).toHaveLength(0)
  })

  test('Shift+Enter breaks the line instead of sending', async () => {
    const page = await launch({ turns: [[{ assistant: 'x' }]] })
    await stubOpenDialog(null)
    const input = page.locator('.welcome-claude-input')
    await input.fill('line 1')
    await input.press('Shift+Enter')
    await input.pressSequentially('line 2')
    await expect(input).toHaveValue('line 1\nline 2')
    expect(await dialogCalls()).toBe(0)
  })
})

function basename(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  return name.replace(/\.git$/, '')
}
