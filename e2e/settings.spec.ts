import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand as sendAppCommand, settle, testEventCount } from './helpers'

// The e2e tsconfig has no DOM lib: types only what runs inside the page.
interface DomGlobals {
  getComputedStyle(el: unknown): { getPropertyValue(prop: string): string }
}

let tmpBase: string
let repoDir: string
let userDataDir: string
let app: ElectronApplication
let page: Page

function writeIn(base: string, rel: string, content: string): void {
  const abs = join(base, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

const writeUserSettings = (content: string): void => writeIn(userDataDir, 'settings.json', content)
const writeWorkspaceSettings = (content: string): void => writeIn(repoDir, '.walph/settings.json', content)

// Native menu shortcuts do not fire from synthetic keys: sends the command through main, like the menu does.
const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const editor = (): Locator => page.locator('.cm-editor')
const notices = (): Locator => page.locator('.toast-error')

const cssOf = (locator: Locator, prop: string): Promise<string> =>
  locator.evaluate((el, p) => (globalThis as unknown as DomGlobals).getComputedStyle(el).getPropertyValue(p), prop)

/** Perceived luminance (0-1) of a computed `rgb()`/`rgba()` color. */
async function luminanceOf(locator: Locator, prop: string): Promise<number> {
  const color = await cssOf(locator, prop)
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Terminal background: xterm paints the viewport with the theme color.
const terminalBg = (): Locator => page.locator('.xterm .xterm-viewport').first()

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  userDataDir = join(tmpBase, 'userdata')
  repoDir = makeRepo(tmpBase, 'projeto-config', {
    'index.ts': 'export const a = 1\n',
    'dist/bundle.js': 'bundle compilado\n',
    'src/dist/nested.js': 'dist aninhado\n',
    'src/app.ts': 'export const app = 1\n'
  })
  ;({ app, page } = await launchWith(tmpBase, userDataDir, { folders: [repoDir] }))
  await expect(treeRow('index.ts')).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test.describe('user settings', () => {
  test('editor.fontSize in settings.json applies to the open editor, without reloading', async () => {
    await treeRow('index.ts').dblclick()
    await expect(editor()).toBeVisible()
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('13px')

    // Marks the page: on a reload, the mark is gone.
    await page.evaluate(() => ((globalThis as unknown as { __mark: number }).__mark = 1))
    writeUserSettings('{ "editor.fontSize": 16 }')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('16px')
    expect(await page.evaluate(() => (globalThis as unknown as { __mark?: number }).__mark)).toBe(1)
    await expect(treeRow('index.ts')).toBeVisible()
  })

  test('"Abrir Configurações (JSON)" opens the file; editing and saving applies the change', async () => {
    await sendCommand('workbench.openSettingsJson')
    await expect(page.locator('.tab-bar .tab.active .tab-label')).toHaveText('settings.json')
    await expect(page.locator('.cm-content')).toContainText('editor.fontSize')

    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText('{ "editor.fontSize": 18 }')
    await sendCommand('editor.save')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('18px')
    // It does not become a "changed externally" warning: the write is the editor's own.
    await expect(notices()).toHaveCount(0)
  })

  test('the workspace overrides the user, and removing the key goes back to the user value', async () => {
    writeWorkspaceSettings('{ "editor.fontSize": 20 }')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('20px')
    writeWorkspaceSettings('{}')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('18px')
  })
})

test.describe('files.exclude', () => {
  test('without the setting, dist shows in the explorer and in Quick Open', async () => {
    await expect(treeRow('dist')).toBeVisible()
    await sendCommand('workbench.quickOpen')
    await page.getByRole('combobox').fill('bundle')
    await expect(page.getByRole('option', { name: /bundle\.js/ })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('"**/dist" in .walph/settings.json hides dist from the explorer and Quick Open', async () => {
    writeWorkspaceSettings('{ "files.exclude": { "**/dist": true } }')
    await expect(treeRow('dist')).toHaveCount(0)
    await expect(treeRow('src')).toBeVisible()
    await treeRow('src').click()
    await expect(treeRow('app.ts')).toBeVisible()
    // The "**/" glob applies at any depth.
    await expect(treeRow('dist')).toHaveCount(0)

    await sendCommand('workbench.quickOpen')
    const input = page.getByRole('combobox')
    await input.fill('bundle')
    await expect(page.locator('.palette-empty')).toHaveText('Nenhum arquivo encontrado')
    await input.fill('nested')
    await expect(page.locator('.palette-empty')).toHaveText('Nenhum arquivo encontrado')
    await input.fill('app.ts')
    await expect(page.getByRole('option', { name: /app\.ts/ })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('false turns the glob off and dist comes back', async () => {
    writeWorkspaceSettings('{ "files.exclude": { "**/dist": false } }')
    // Two "dist" (root and src/, already expanded): both come back.
    await expect(treeRow('dist')).toHaveCount(2)
    await sendCommand('workbench.quickOpen')
    await page.getByRole('combobox').fill('bundle')
    await expect(page.getByRole('option', { name: /bundle\.js/ })).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

test.describe('theme', () => {
  test('Walph Light switches the UI, the editor and the terminal to light colors', async () => {
    writeWorkspaceSettings('{}')
    await sendCommand('terminal.toggle')
    await expect(page.locator('.xterm')).toBeVisible()

    // Starting point: everything dark.
    await expect.poll(() => luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(0.3)
    expect(await luminanceOf(editor(), 'background-color')).toBeLessThan(0.3)
    await expect.poll(() => luminanceOf(terminalBg(), 'background-color')).toBeLessThan(0.3)

    writeUserSettings('{ "editor.fontSize": 18, "workbench.theme": "Walph Light" }')
    await expect.poll(() => luminanceOf(page.locator('body'), 'background-color')).toBeGreaterThan(0.7)
    await expect.poll(() => luminanceOf(editor(), 'background-color')).toBeGreaterThan(0.7)
    await expect.poll(() => luminanceOf(terminalBg(), 'background-color')).toBeGreaterThan(0.7)
    // The editor text gets darker too.
    expect(await luminanceOf(page.locator('.cm-content'), 'color')).toBeLessThan(0.5)
    // The other keys in the file still apply.
    expect(await cssOf(editor(), 'font-size')).toBe('18px')
  })

  test('an unknown theme warns and falls back to Walph Dark', async () => {
    writeUserSettings('{ "editor.fontSize": 18, "workbench.theme": "Tema Fantasma" }')
    await expect(page.locator('.toast', { hasText: 'Tema "Tema Fantasma" não encontrado' })).toBeVisible()
    await expect.poll(() => luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(0.3)
  })
})

test.describe('invalid settings.json', () => {
  test('invalid JSON shows an error with line:column and keeps the last valid value', async () => {
    writeUserSettings('{ "editor.fontSize": 14 }')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('14px')

    writeUserSettings('{\n  "editor.fontSize": 30\n  "editor.tabSize": 4\n}')
    // Old warnings (e.g. from the theme) may still be on screen: looks for the one from this read.
    const error = notices().filter({ hasText: 'linha:coluna 3:3' })
    await expect(error).toHaveCount(1)
    await expect(error).toContainText('settings.json')
    // Keeps the value of the last valid version.
    expect(await cssOf(editor(), 'font-size')).toBe('14px')
    await settle(page)
    expect(await cssOf(editor(), 'font-size')).toBe('14px')
  })

  test('fixing the file applies it again', async () => {
    writeUserSettings('{ "editor.fontSize": 15 }')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('15px')
  })

  test('an invalid value becomes a warning and the valid keys in the file still apply', async () => {
    writeUserSettings('{ "editor.fontSize": 17, "editor.tabSize": "x", "chave.inexistente": 1 }')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('17px')
    await expect(page.locator('.toast', { hasText: '"editor.tabSize"' })).toBeVisible()
  })

  test('deleting the file goes back to the defaults', async () => {
    unlinkSync(join(userDataDir, 'settings.json'))
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('13px')
  })
})

test.describe('theme picker', () => {
  const selected = (): Locator => page.locator('.palette [role="option"][aria-selected="true"]')

  test('opened from the palette, it starts on the current theme and previews no other', async () => {
    writeUserSettings('{ "workbench.theme": "Walph Light" }')
    await expect.poll(() => luminanceOf(page.locator('body'), 'background-color')).toBeGreaterThan(0.7)

    await sendCommand('workbench.showCommandPalette')
    await page.getByRole('combobox').fill('>Selecionar Tema')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('dialog', { name: 'Selecionar tema' })).toBeVisible()
    await expect(selected()).toContainText('Walph Light')
    await settle(page)
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeGreaterThan(0.7)

    // The mouse only highlights: it neither previews nor moves the selection.
    await page.getByRole('option', { name: /Walph Dark/ }).hover()
    await settle(page)
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeGreaterThan(0.7)
    await expect(selected()).toContainText('Walph Light')

    await page.keyboard.press('Escape')
    await expect(page.locator('.palette')).toHaveCount(0)
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeGreaterThan(0.7)
  })

  test('the arrows preview; Enter saves and the open settings.json follows', async () => {
    await sendCommand('workbench.openSettingsJson')
    await expect(page.locator('.cm-content')).toContainText('Walph Light')

    await sendCommand('workbench.selectTheme')
    await expect(selected()).toContainText('Walph Light')
    await page.keyboard.press('ArrowUp')
    await expect(selected()).toContainText('Walph Dark')
    await expect.poll(() => luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(0.3)
    await page.keyboard.press('Enter')

    // The tab was clean: it reloads from disk instead of showing (and then reverting) the old value.
    await expect(page.locator('.cm-content')).toContainText('Walph Dark')
    await expect(page.locator('.tab-bar .tab.active')).not.toHaveClass(/dirty/)
    await expect(notices()).toHaveCount(0)
  })

  test('workspace theme: picking another writes to .walph/settings.json and the UI does not revert', async () => {
    writeUserSettings('{ "workbench.theme": "Walph Dark" }')
    writeWorkspaceSettings('{ "workbench.theme": "Walph Light" }')
    await expect.poll(() => luminanceOf(page.locator('body'), 'background-color')).toBeGreaterThan(0.7)

    await sendCommand('workbench.selectTheme')
    await expect(selected()).toContainText('Walph Light')
    await page.keyboard.press('ArrowUp')
    await expect(selected()).toContainText('Walph Dark')
    const reloads = await testEventCount(app, 'settings.watcherReload.workspace')
    await page.keyboard.press('Enter')

    await expect(page.locator('.toast-info', { hasText: 'Tema gravado nas configurações do workspace.' })).toBeVisible()
    // The workspace value (which wins) was rewritten; had it stayed as it was, the theme would turn light again.
    await expect
      .poll(() => readFileSync(join(repoDir, '.walph/settings.json'), 'utf8'))
      .toContain('"workbench.theme": "Walph Dark"')
    // The watcher rereads its own save: if it sent a snapshot reverting the theme, it would arrive before the settle.
    await expect.poll(() => testEventCount(app, 'settings.watcherReload.workspace')).toBeGreaterThan(reloads)
    await settle(page)
    expect(await luminanceOf(page.locator('body'), 'background-color')).toBeLessThan(0.3)
    // The user file was not touched.
    expect(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).toContain('Walph Dark')
    writeWorkspaceSettings('{}')
  })
})
