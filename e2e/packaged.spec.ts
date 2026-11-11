import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from './fixtures'
import { cleanEnv, sendCommand, waitForTerminalIdle, type WalphGlobals } from './helpers'

// The packaged app opens a folder, searches, runs git and opens a terminal.
// Only runs with WALPH_PACKAGED_EXE=<absolute executable of the packaged app>.

const exe = process.env.WALPH_PACKAGED_EXE

test.skip(!exe, 'set WALPH_PACKAGED_EXE to the packaged app executable')
test.setTimeout(90_000)

test('packaged app opens the folder, searches with ripgrep, shows git and opens the terminal', async ({
  launch,
  makeRepo
}) => {
  const repo = makeRepo(
    {
      'README.md': '# projeto\n',
      'src/alvo.ts': 'export const needle_pkg_marker = 1\n'
    },
    'projeto'
  )

  const { app, page } = await launch({
    folders: [repo],
    executablePath: exe,
    // DOM renderer: the terminal text is readable in `.xterm-rows`.
    settings: { 'terminal.gpuAcceleration': 'off' }
  })

  // Explorer
  const row = (name: string) =>
    page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
  await expect(row('README.md')).toBeVisible()
  await expect(row('src')).toBeVisible()

  // Search (bundled ripgrep)
  await sendCommand(app, page, 'view.search')
  const query = page.getByRole('textbox', { name: 'Buscar', exact: true })
  await expect(query).toBeVisible()
  await query.fill('needle_pkg_marker')
  await expect(page.locator('.search-summary')).toContainText(/1 resultado/)
  await expect(page.locator('.search-match')).toHaveCount(1)

  // Git: a change on disk shows up in the view
  writeFileSync(join(repo, 'README.md'), '# projeto alterado\n')
  expect(readFileSync(join(repo, 'README.md'), 'utf8')).toContain('alterado')
  await sendCommand(app, page, 'view.git')
  await expect(
    page.locator('.git-file', { has: page.locator('.tree-label', { hasText: /^README\.md$/ }) })
  ).toBeVisible()

  // Terminal
  await sendCommand(app, page, 'terminal.toggle')
  const pane = page.locator('.terminal-pane:not([hidden])').first()
  await expect(pane).toBeVisible()
  await waitForTerminalIdle(pane)
  await pane.locator('.xterm-screen').click()
  await page.keyboard.type('echo PKG_$((20+22))')
  await page.keyboard.press('Enter')
  await expect.poll(() => pane.locator('.xterm-rows').innerText()).toContain('PKG_42')
})

test('packaged app ships the lib.*.d.ts of the bundled tsserver', () => {
  const resources =
    process.platform === 'darwin' ? join(dirname(exe!), '..', 'Resources') : join(dirname(exe!), 'resources')
  const lib = join(resources, 'app.asar.unpacked', 'node_modules', 'tsserver-bundled', 'lib')
  for (const name of ['lib.d.ts', 'lib.es5.d.ts', 'lib.es2023.d.ts', 'lib.dom.d.ts']) {
    expect(existsSync(join(lib, name)), name).toBe(true)
  }
})

test('packaged app: `Walph <folder>` in a second run opens the folder in the running instance', async ({
  launch,
  makeRepo,
  tmp,
  userDataDir
}) => {
  const a = makeRepo({ 'a.txt': 'a' }, 'proj-a')
  const b = makeRepo({ 'b.txt': 'b' }, 'proj-b')
  const { page } = await launch({ folders: [a], executablePath: exe })
  await expect(page.locator('.workspace-bar')).toBeVisible()

  // Relative to the cwd, like `cd <base> && walph proj-b`.
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(exe!, [`--user-data-dir=${userDataDir}`, 'proj-b'], {
      cwd: tmp,
      env: cleanEnv(),
      stdio: 'ignore'
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('The second instance did not exit within 15 s.'))
    }, 15_000)
    child.on('exit', (c) => {
      clearTimeout(timer)
      resolve(c)
    })
  })
  expect(code).toBe(0)
  await expect
    .poll(async () =>
      (await page.evaluate(() => (globalThis as unknown as WalphGlobals).api.workspaces.list())).workspaces.map(
        (w) => w.root
      )
    )
    .toEqual([a, b])
})
