import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand } from './helpers'

// The e2e tsconfig has no DOM lib: type only what runs inside the page.
interface DomGlobals {
  getComputedStyle(el: unknown): { getPropertyValue(prop: string): string }
}

let tmpBase: string
let repoDir: string
let userDataDir: string
let app: ElectronApplication
let page: Page

const userSettingsPath = (): string => join(userDataDir, 'settings.json')
const workspaceSettingsPath = (): string => join(repoDir, '.walph/settings.json')

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

// Atomic write (tmp + rename), like the app's and the editors'.
function writeAtomic(path: string, content: string): void {
  writeFileSync(`${path}.tmp`, content)
  renameSync(`${path}.tmp`, path)
}

const modal = (): Locator => page.getByTestId('settings-modal')
const control = (key: string): Locator => page.getByTestId(`setting-${key}`)
const row = (key: string): Locator => modal().locator(`[data-setting-key="${key}"]`)
const editor = (): Locator => page.locator('.cm-editor')
const gear = (): Locator => page.locator('.activity-item.settings')

const cssOf = (locator: Locator, prop: string): Promise<string> =>
  locator.evaluate((el, p) => (globalThis as unknown as DomGlobals).getComputedStyle(el).getPropertyValue(p), prop)

async function openModal(): Promise<void> {
  await sendCommand(app, page, 'workbench.openSettings')
  await expect(modal()).toBeVisible()
}

async function closeModal(): Promise<void> {
  if (await modal().isVisible()) await page.keyboard.press('Escape')
  await expect(modal()).toBeHidden()
}

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  userDataDir = join(tmpBase, 'userdata')
  repoDir = makeRepo(tmpBase, 'projeto-modal', { 'index.ts': 'export const a = 1\n' })
  write(userSettingsPath(), '// my comment\n{\n  "editor.tabSize": 4 // width\n}\n')

  ;({ app, page } = await launchWith(tmpBase, userDataDir, { folders: [repoDir] }))
  await expect(page.locator('.tree .tree-label', { hasText: 'index.ts' })).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test.describe('settings modal', () => {
  test('the activity bar gear opens the modal and Esc returns focus to it', async () => {
    await gear().focus()
    await gear().click()
    await expect(modal()).toBeVisible()
    await expect(modal()).toHaveAttribute('role', 'dialog')
    await expect(modal().locator('[data-section="editor"]')).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(modal()).toBeHidden()
    await expect(gear()).toBeFocused()
  })

  test('Esc returns focus to whoever had it before the command (the editor)', async () => {
    await page.locator('.tree .tree-label', { hasText: 'index.ts' }).dblclick()
    await expect(editor()).toBeVisible()
    await page.locator('.cm-content').click()
    await expect(page.locator('.cm-content')).toBeFocused()

    await openModal()
    await page.keyboard.press('Escape')
    await expect(modal()).toBeHidden()
    await expect(page.locator('.cm-content')).toBeFocused()
  })

  test('Tab is trapped in the modal (wraps around in both directions)', async () => {
    await openModal()
    const inside = (): Promise<boolean> =>
      page.evaluate(() => {
        const d = (
          globalThis as unknown as {
            document: { activeElement: unknown; querySelector(s: string): { contains(n: unknown): boolean } | null }
          }
        ).document
        return !!d.querySelector('[data-testid="settings-modal"]')?.contains(d.activeElement)
      })
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      expect(await inside()).toBe(true)
    }
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside()).toBe(true)
    }
    await closeModal()
  })

  test('changing editor.fontSize updates open tabs right away and keeps settings.json comments', async () => {
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('13px')
    await openModal()

    const field = control('editor.fontSize')
    await field.fill('18')
    await field.press('Enter')

    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('18px')
    await expect.poll(() => readFileSync(userSettingsPath(), 'utf8')).toMatch(/"editor\.fontSize":\s*18/)
    const text = readFileSync(userSettingsPath(), 'utf8')
    expect(text).toContain('// my comment')
    expect(text).toContain('// width')
    expect(text).toMatch(/"editor\.tabSize":\s*4/)
    await closeModal()
  })

  test('invalid value shows the error and does not write', async () => {
    await openModal()
    const field = control('editor.fontSize')
    await field.fill('500')
    await field.press('Enter')
    await expect(row('editor.fontSize').getByRole('alert')).toBeVisible()
    expect(readFileSync(userSettingsPath(), 'utf8')).toMatch(/"editor\.fontSize":\s*18/)
    await expect(editor()).toBeVisible()
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('18px')
    // The first Esc only discards the draft (the modal stays open); the field returns to the stored value.
    await field.press('Escape')
    await expect(modal()).toBeVisible()
    await expect(row('editor.fontSize').getByRole('alert')).toBeHidden()
    await expect(field).toHaveValue('18')
    await closeModal()
  })

  test('editing settings.json on disk with the modal open updates the controls', async () => {
    await openModal()
    await expect(control('editor.fontSize')).toHaveValue('18')
    write(userSettingsPath(), '{ "editor.fontSize": 21 }')
    await expect(control('editor.fontSize')).toHaveValue('21')
    await expect.poll(() => cssOf(editor(), 'font-size')).toBe('21px')
    await closeModal()
  })

  test('an external write right after the app write is not lost (folder watcher)', async () => {
    await openModal()
    await expect(control('editor.fontSize')).toHaveValue('21')
    // The app writes (tmp + rename) and, without waiting, an external editor writes over it: chokidar's blind window.
    await page.evaluate(async () => {
      const api = (
        globalThis as unknown as { api: { settings: { setValue(l: string, k: string, v: number): Promise<void> } } }
      ).api
      await api.settings.setValue('user', 'editor.fontSize', 24)
    })
    writeAtomic(userSettingsPath(), '{ "editor.fontSize": 25 }')
    await expect(control('editor.fontSize')).toHaveValue('25')
    writeAtomic(userSettingsPath(), '{ "editor.fontSize": 26 }')
    writeAtomic(userSettingsPath(), '{ "editor.fontSize": 21 }')
    await expect(control('editor.fontSize')).toHaveValue('21')
    await closeModal()
  })

  test('user "Restaurar padrão" removes the key from the file', async () => {
    write(userSettingsPath(), '// c\n{ "editor.fontSize": 21, "editor.tabSize": 4 }\n')
    await openModal()
    await expect(control('editor.fontSize')).toHaveValue('21')
    await row('editor.fontSize').getByTitle('Restaurar padrão').click()
    await expect(control('editor.fontSize')).toHaveValue('13')
    await expect.poll(() => readFileSync(userSettingsPath(), 'utf8')).not.toContain('editor.fontSize')
    expect(readFileSync(userSettingsPath(), 'utf8')).toContain('// c')
    // Closes with the button: focus after restoring is covered by the next test.
    await modal().getByTitle('Fechar').click()
    await expect(modal()).toBeHidden()
  })

  test('in the Workspace scope, terminal.shell is disabled with the explanation', async () => {
    await openModal()
    await modal().locator('[data-section="terminal"]').click()
    const shell = control('terminal.shell')
    await expect(shell).toBeEnabled()

    await modal().locator('[data-scope="workspace"]').click()
    await expect(shell).toBeDisabled()
    await expect(row('terminal.shell')).toContainText('um repositório não pode escolher executáveis')

    await modal().locator('[data-scope="user"]').click()
    await expect(shell).toBeEnabled()
    await closeModal()
  })

  test('a .walph/settings.json value shows the indicator and "Restaurar" reverts to the user one and cleans the file', async () => {
    write(userSettingsPath(), '{ "editor.tabSize": 4 }')
    write(workspaceSettingsPath(), '// from the repo\n{\n  "editor.tabSize": 8,\n  "editor.insertSpaces": false\n}\n')
    await openModal()
    await expect(control('editor.tabSize')).toHaveValue('4')
    // In the user scope it only warns that the workspace overrides.
    await expect(row('editor.tabSize')).toContainText('O workspace atual sobrescreve este valor.')

    await modal().locator('[data-scope="workspace"]').click()
    await expect(control('editor.tabSize')).toHaveValue('8')
    const badge = row('editor.tabSize').getByTestId('workspace-override')
    await expect(badge).toHaveText('definido no workspace')

    await row('editor.tabSize').locator('[data-action="reset-workspace"]').click()
    await expect(badge).toBeHidden()
    await expect(control('editor.tabSize')).toHaveValue('4')
    await expect.poll(() => readFileSync(workspaceSettingsPath(), 'utf8')).not.toContain('editor.tabSize')
    const left = readFileSync(workspaceSettingsPath(), 'utf8')
    expect(left).toContain('// from the repo')
    expect(left).toMatch(/"editor\.insertSpaces":\s*false/)
    // With the button: focus after "Restaurar" is covered by the last test.
    await modal().getByTitle('Fechar').click()
    await expect(modal()).toBeHidden()
  })

  test('changing in the Workspace scope writes to .walph/settings.json and not to the user one', async () => {
    await openModal()
    await modal().locator('[data-scope="workspace"]').click()
    const field = control('editor.tabSize')
    await field.fill('2')
    await field.press('Enter')
    await expect.poll(() => readFileSync(workspaceSettingsPath(), 'utf8')).toMatch(/"editor\.tabSize":\s*2/)
    expect(readFileSync(userSettingsPath(), 'utf8')).toMatch(/"editor\.tabSize":\s*4/)
    await expect(row('editor.tabSize').getByTestId('workspace-override')).toBeVisible()
    await closeModal()
  })

  test('"Abrir Configurações (JSON)" still opens the file tab', async () => {
    await sendCommand(app, page, 'workbench.openSettingsJson')
    await expect(modal()).toBeHidden()
    await expect(page.locator('.tab-bar .tab.active .tab-label')).toHaveText('settings.json')
  })

  test('"Editar no settings.json" of a complex setting closes the modal and opens the file', async () => {
    await openModal()
    await modal().locator('[data-section="terminal"]').click()
    await row('terminal.profiles').locator('[data-action="edit-json"]').click()
    await expect(modal()).toBeHidden()
    await expect(page.locator('.tab-bar .tab.active .tab-label')).toHaveText('settings.json')
  })

  test('after "Restaurar padrão" (the button hides) focus stays inside the modal and Esc closes', async () => {
    write(userSettingsPath(), '{ "editor.fontSize": 21 }')
    await openModal()
    await expect(control('editor.fontSize')).toHaveValue('21')
    await row('editor.fontSize').getByTitle('Restaurar padrão').click()
    await expect(control('editor.fontSize')).toHaveValue('13')
    await expect(row('editor.fontSize').getByTitle('Restaurar padrão')).toBeHidden()
    const focusInside = await page.evaluate(() => {
      const d = (
        globalThis as unknown as {
          document: { activeElement: unknown; querySelector(s: string): { contains(n: unknown): boolean } | null }
        }
      ).document
      return !!d.querySelector('[data-testid="settings-modal"]')?.contains(d.activeElement)
    })
    // If it fails, close with the button so the following tests are not contaminated (serial mode).
    if (!focusInside && (await modal().isVisible())) await modal().getByTitle('Fechar').click()
    expect(focusInside).toBe(true)
    await page.keyboard.press('Escape')
    await expect(modal()).toBeHidden()
  })

  test('clicking the backdrop with a valid draft writes before closing', async () => {
    write(userSettingsPath(), '// my comment\n{\n  "editor.fontSize": 14\n}\n')
    await openModal()
    await expect(control('editor.fontSize')).toHaveValue('14')
    await control('editor.fontSize').fill('17')
    await page.mouse.click(4, 300)
    await expect(modal()).toBeHidden()
    await expect.poll(() => readFileSync(userSettingsPath(), 'utf8')).toContain('"editor.fontSize": 17')
  })

  test('opening and closing the modal neither restarts nor delays a toast countdown', async () => {
    // Bar progress in ms (`currentTime` ignores the negative `animation-delay` of a remounted item).
    type Anim = { effect: { getComputedTiming(): { progress: number | null; duration: number } } }
    const barTime = (): Promise<number> =>
      page
        .locator('.toast .toast-time')
        .first()
        .evaluate((el) => {
          const timing = (el as unknown as { getAnimations(): Anim[] }).getAnimations()[0]?.effect.getComputedTiming()
          return timing ? (timing.progress ?? 0) * timing.duration : -1
        })
    const started = Date.now()
    write(userSettingsPath(), '{ "editor.fontSize": ')
    await expect(page.locator('.toast').first()).toBeVisible()
    await page.mouse.move(1, 1)
    await expect.poll(barTime).toBeGreaterThan(1500)
    const before = await barTime()

    await openModal()
    const opened = await barTime()
    expect(opened).toBeGreaterThanOrEqual(before)
    // The bar keeps moving with the modal open.
    await expect.poll(barTime).toBeGreaterThan(opened + 500)

    await modal().getByTitle('Fechar').click()
    await expect(modal()).toBeHidden()
    expect(await barTime()).toBeGreaterThan(opened + 500)
    // Hides near the original deadline (8 s for the error toast), not 8 s after reopening.
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 9000 })
    expect(Date.now() - started).toBeLessThan(9500)
    write(userSettingsPath(), '{}')
  })
})
