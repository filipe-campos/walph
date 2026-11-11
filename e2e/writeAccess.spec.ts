import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand, type WalphGlobals } from './helpers'

// `fs:writeFile` only writes inside the view folder or an outside file that main read for the tab.
let tmpBase: string
let userDataDir: string
let secret: string
let app: ElectronApplication
let page: Page

const write = (path: string, text: string): Promise<void> =>
  page.evaluate(([p, c]) => (globalThis as unknown as WalphGlobals).api.fs.writeFile(p, c), [path, text] as const)

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  userDataDir = join(tmpBase, 'userdata')
  const repo = makeRepo(tmpBase, 'projeto', { 'a.txt': 'alfa\n' })
  secret = join(tmpBase, 'fora.txt')
  writeFileSync(secret, 'original')
  ;({ app, page } = await launchWith(tmpBase, userDataDir, { folders: [repo] }))
  await expect(page.locator('.tree .tree-row').first()).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test('an outside file open in a tab (user settings.json) saves normally', async () => {
  await sendCommand(app, page, 'workbench.openSettingsJson')
  await expect(page.locator('.tab-bar .tab.active .tab-label')).toHaveText('settings.json')
  await expect(page.locator('.cm-content')).toContainText('{')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('{ "editor.fontSize": 17 }')
  await expect(page.locator('.tab-bar .tab.active')).toHaveClass(/\bdirty\b/)
  await sendCommand(app, page, 'editor.save')
  await expect(page.locator('.tab-bar .tab.active')).not.toHaveClass(/\bdirty\b/)
  expect(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).toContain('"editor.fontSize": 17')
  await expect(page.locator('.toast-error')).toHaveCount(0)
})

test('an outside path that no tab opened is refused, existing or new', async () => {
  await expect(write(secret, 'tampered')).rejects.toThrow(/fora da pasta aberta/)
  await expect(write(join(tmpBase, 'new.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
  expect(readFileSync(secret, 'utf8')).toBe('original')
  expect(existsSync(join(tmpBase, 'new.txt'))).toBe(false)
})
