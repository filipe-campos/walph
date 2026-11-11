import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { exitApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand } from './helpers'

// File options on save (settings + .editorconfig), rulers, visible whitespace and "Reabrir Aba Fechada".
let tmpBase: string
let repo: string
let app: ElectronApplication
let page: Page

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const tabs = (): Locator => page.locator('.tab-bar .tab')
const tab = (name: string): Locator =>
  tabs().filter({ has: page.locator('.tab-label', { hasText: new RegExp(`^${name}$`) }) })
const editor = (): Locator => page.locator('.cm-editor .cm-content')

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repo = makeRepo(tmpBase, 'projeto-opcoes', {
    '.editorconfig':
      'root = true\n\n[*.txt]\ntrim_trailing_whitespace = true\ninsert_final_newline = true\nmax_line_length = 40\n',
    'a.txt': 'alfa   \nbeta\t',
    'b.log': 'markdown  '
  })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), {
    folders: [repo],
    settings: { 'editor.rulers': [20], 'files.trimFinalNewlines': true, 'editor.renderWhitespace': 'all' }
  }))
  await expect(treeRow('a.txt')).toBeVisible()
})

test.afterAll(async () => {
  await exitApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test('rulers from the settings and from max_line_length; whitespace drawn', async () => {
  await treeRow('a.txt').dblclick()
  await expect(editor()).toContainText('alfa')
  await expect(page.locator('.cm-rulers .cm-ruler')).toHaveCount(2)
  await expect(page.locator('.cm-ws-space').first()).toBeVisible()
  await expect(page.locator('.cm-ws-tab')).toHaveCount(1)
})

test('saving applies .editorconfig: trims trailing whitespace and inserts the final newline', async () => {
  await editor().click()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.type('x')
  await expect(tab('a.txt')).toHaveClass(/\bdirty\b/)
  await sendCommand(app, page, 'editor.save')
  await expect(tab('a.txt')).not.toHaveClass(/\bdirty\b/)
  await expect.poll(() => readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('xalfa\nbeta\n')
})

test('outside .editorconfig only the settings apply', async () => {
  await treeRow('b.log').dblclick()
  await expect(editor()).toContainText('markdown')
  await expect(page.locator('.cm-rulers .cm-ruler')).toHaveCount(1)
  await editor().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await sendCommand(app, page, 'editor.save')
  await expect(tab('b.log')).not.toHaveClass(/\bdirty\b/)
  // `files.trimFinalNewlines` trims the trailing empty lines; the trailing space stays (not enabled in the settings).
  await expect.poll(() => readFileSync(join(repo, 'b.log'), 'utf8')).toBe('markdown  \n')
})

test('Reabrir Aba Fechada puts the tab back in place', async () => {
  await expect(tabs()).toHaveCount(2)
  await tab('a.txt').click()
  await sendCommand(app, page, 'workbench.closeTab')
  await expect(tab('a.txt')).toHaveCount(0)
  await sendCommand(app, page, 'workbench.reopenClosedEditor')
  await expect(tab('a.txt')).toBeVisible()
  await expect(tabs().first()).toHaveText(/a\.txt/)
  await expect(editor()).toContainText('xalfa')
})
