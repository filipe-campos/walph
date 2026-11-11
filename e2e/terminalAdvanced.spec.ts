import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand as sendAppCommand, waitForTerminalIdle } from './helpers'

// The e2e tsconfig has no DOM lib: type only what runs inside the page.
interface DomNode {
  nodeType: number
  textContent: string | null
  parentElement: DomEl | null
}
interface DomEl extends DomNode {
  querySelectorAll(selector: string): DomEl[]
}
interface DomRange {
  setStart(node: DomNode, offset: number): void
  setEnd(node: DomNode, offset: number): void
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
}
interface DomDocument {
  querySelectorAll(selector: string): DomEl[]
  createTreeWalker(root: DomEl, whatToShow: number): { nextNode(): DomNode | null }
  createRange(): DomRange
}
interface PageGlobals {
  document: DomDocument
  api: {
    terminal: {
      create(o: { cwd: string | null }): Promise<{ id: string }>
      write(id: string, data: string): void
      kill(id: string): void
      resolveLink(id: string, path: string): Promise<string | null>
    }
  }
}

// Approximate terminal line height (px) only to leave the link's line; any line above works.
const LINE_PX = 15

let tmpBase: string
let repoDir: string
let userDataDir: string
let app: ElectronApplication
let page: Page

// Native menu shortcuts do not fire from synthetic keys: send the command through main, as the menu does.
const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const panes = (): Locator => page.locator('.terminal-pane:not([hidden])')
const rowsText = (pane: Locator): Promise<string> => pane.locator('.xterm-rows').innerText()
const groupTabs = (): Locator => page.locator('.term-tab')

const waitForPrompt = waitForTerminalIdle

async function runInPane(pane: Locator, command: string): Promise<void> {
  await pane.locator('.xterm-screen').click()
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
}

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repoDir = makeRepo(tmpBase, 'projeto-terminal', {
    'README.md': '# projeto\n',
    'src/broken.ts': 'const a = 1\nconst b = 2\nconst c: string = 3\nconst d = 4\n'
  })
  userDataDir = join(tmpBase, 'userdata')
  // DOM renderer (no WebGL): the terminal text is readable in `.xterm-rows`. Profile only on POSIX.
  const settings: Record<string, unknown> = { 'terminal.gpuAcceleration': 'off' }
  if (process.platform !== 'win32') settings['terminal.profiles'] = { Sh: { path: '/bin/sh' } }
  ;({ app, page } = await launchWith(tmpBase, userDataDir, { folders: [repoDir], settings }))
  await expect(treeRow('README.md')).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

test.describe('Advanced terminal', () => {
  test('splitting creates two panes in the same group and each output stays in its pane', async () => {
    await sendCommand('terminal.toggle')
    await expect(panes()).toHaveCount(1)
    await waitForPrompt(panes().first())

    await sendCommand('terminal.split')
    await expect(panes()).toHaveCount(2)
    // A single group (one tab) with both panes.
    await expect(groupTabs()).toHaveCount(1)
    const [a, b] = [panes().nth(0), panes().nth(1)]
    await waitForPrompt(b)

    await runInPane(a, 'echo PANE_A_$((1+1))')
    await expect.poll(() => rowsText(a)).toContain('PANE_A_2')
    await runInPane(b, 'echo PANE_B_$((2+3))')
    await expect.poll(() => rowsText(b)).toContain('PANE_B_5')

    expect(await rowsText(a)).not.toContain('PANE_B_5')
    expect(await rowsText(b)).not.toContain('PANE_A_2')
  })

  test('kills the split pane and one terminal remains', async () => {
    await sendCommand('terminal.kill')
    await expect(panes()).toHaveCount(1)
    await expect(groupTabs()).toHaveCount(1)
  })

  test('Ctrl/Cmd+click on path:line:column opens the file at the line', async () => {
    const pane = panes().first()
    // The printf breaks the path in the typed command: only the OUTPUT contains `src/broken.ts(3,5)`.
    await runInPane(pane, "printf 'src/%s.ts(3,5): error TS2322: x\\n' broken")
    await expect.poll(() => rowsText(pane)).toContain('src/broken.ts(3,5)')

    // Screen position of the start of the path (Range over the text nodes of the output line).
    const point = await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobals
      const needle = 'src/broken.ts(3,5)'
      for (const row of g.document.querySelectorAll('.terminal-pane:not([hidden]) .xterm-rows > div')) {
        const text = row.textContent ?? ''
        const at = text.indexOf(needle)
        if (at < 0 || !text.trimStart().startsWith('src/broken.ts')) continue
        const walker = g.document.createTreeWalker(row, 4)
        let seen = 0
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const len = n.textContent?.length ?? 0
          // Middle of the word `broken`, away from the link edges.
          const target = at + 6
          if (target < seen + len) {
            const range = g.document.createRange()
            range.setStart(n, target - seen)
            range.setEnd(n, target - seen + 1)
            const r = range.getBoundingClientRect()
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          }
          seen += len
        }
      }
      return null
    })
    expect(point).not.toBeNull()

    // Link validation is async (goes to main): move the mouse until the link is active, then click with the modifier.
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    // xterm caches the hover "no links" answer per line. The `runInPane` click lands in the middle of the pane, which
    // (depending on the pane height, e.g. Linux/Xvfb) may be exactly the line that was still going to receive the
    // printf output: moving to another line first clears that cache, otherwise its link is never requested.
    await page.mouse.move(point!.x, point!.y - 3 * LINE_PX)
    await page.mouse.move(point!.x - 3, point!.y)
    await page.mouse.move(point!.x, point!.y)
    await expect(page.locator('.terminal-link-hint')).toBeVisible()
    await page.mouse.move(point!.x + 1, point!.y)
    await page.keyboard.down(modifier)
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.up(modifier)

    await expect(page.locator('.tab-bar .tab', { hasText: 'broken.ts' })).toBeVisible()
    await expect(page.locator('.status-bar')).toContainText(/Ln 3, Col 5/)
  })

  test('resolveLink uses the shell current directory for relative paths', async () => {
    const id = await page.evaluate(async (cwd) => {
      const g = globalThis as unknown as PageGlobals
      return (await g.api.terminal.create({ cwd })).id
    }, repoDir)
    const resolveLink = (path: string): Promise<string | null> =>
      page.evaluate(([i, p]) => (globalThis as unknown as PageGlobals).api.terminal.resolveLink(i, p), [id, path])
    try {
      expect(await resolveLink('src/broken.ts')).toBe(join(repoDir, 'src', 'broken.ts'))
      expect(await resolveLink('src/nao-existe.ts')).toBeNull()
      expect(await resolveLink('src')).toBeNull() // a folder is not a file link

      if (process.platform !== 'win32') {
        await page.evaluate(([i]) => (globalThis as unknown as PageGlobals).api.terminal.write(i, 'cd src\r'), [id])
        // The shell cwd is read from the OS: wait for the `cd` to take effect.
        await expect.poll(() => resolveLink('broken.ts'), { timeout: 15_000 }).toBe(join(repoDir, 'src', 'broken.ts'))
      }
    } finally {
      await page.evaluate(([i]) => (globalThis as unknown as PageGlobals).api.terminal.kill(i), [id])
    }
  })

  test('find opens the field focused, counts matches and Esc closes', async () => {
    const pane = panes().first()
    await runInPane(pane, 'echo ACHADO_$((4+4))')
    await expect.poll(() => rowsText(pane)).toContain('ACHADO_8')

    await sendCommand('terminal.find')
    const input = page.locator('.terminal-find-input')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused()

    await page.keyboard.type('ACHADO_8')
    // Only the output has `ACHADO_8` (the typed command has `ACHADO_$((4+4))`).
    await expect(page.locator('.terminal-find-status')).toHaveText('1 de 1')

    await input.fill('ACHADO_')
    await expect(page.locator('.terminal-find-status')).toHaveText(/^\d+ de 2$/)

    await input.fill('texto_que_nao_existe_zzz')
    await expect(page.locator('.terminal-find-status')).toHaveText('Sem resultados')

    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
  })

  test('profiles: the picker lists "Sh" and choosing it creates an sh terminal', async () => {
    test.skip(process.platform === 'win32', '/bin/sh profile only on POSIX')
    const before = await groupTabs().count()

    await sendCommand('terminal.newWithProfile')
    const item = page.locator('.palette-item', { has: page.locator('.palette-label', { hasText: /^Sh$/ }) })
    await expect(item).toBeVisible()
    await item.click()

    await expect(groupTabs()).toHaveCount(before + 1)
    // The automatic title comes from the foreground process.
    await expect(groupTabs().last()).toContainText('sh', { timeout: 15_000 })
    const pane = panes().first()
    await waitForPrompt(pane)
    await runInPane(pane, 'echo PERFIL_$((6*7))')
    await expect.poll(() => rowsText(pane)).toContain('PERFIL_42')
  })

  test('moving the panel puts it right of the editor and maximizing hides the editor', async () => {
    const editor = page.locator('.editor-slot')
    const panel = page.locator('.panel-container')
    await expect(panel).toBeVisible()

    const below = await panel.boundingBox()
    const editorBelow = await editor.boundingBox()
    expect(below!.y).toBeGreaterThanOrEqual(editorBelow!.y + editorBelow!.height - 1)

    await sendCommand('view.togglePanelPosition')
    await expect(page.locator('.main.panel-right')).toHaveCount(1)
    await expect
      .poll(async () => {
        const p = await panel.boundingBox()
        const e = await editor.boundingBox()
        return p!.x >= e!.x + e!.width - 1
      })
      .toBe(true)

    await sendCommand('view.togglePanelMaximized')
    await expect(editor).toBeHidden()
    await expect(panel).toBeVisible()
    await expect(page.locator('.panel-container.maximized')).toHaveCount(1)

    await sendCommand('view.togglePanelMaximized')
    await expect(editor).toBeVisible()
    await sendCommand('view.togglePanelPosition')
    await expect(page.locator('.main.panel-right')).toHaveCount(0)
  })
})
