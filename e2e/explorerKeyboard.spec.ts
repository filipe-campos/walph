import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { exitApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo } from './helpers'

let tmpBase: string
let repoDir: string
let app: ElectronApplication
let page: Page

const row = (name: string): Locator =>
  page.locator('.tree .tree-row[role="treeitem"]', {
    has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) })
  })

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repoDir = makeRepo(tmpBase, 'keyboard-project', { 'folder/inside.txt': 'inside\n', 'a.txt': 'a\n', 'b.txt': 'b\n' })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repoDir] }))
  await expect(row('a.txt')).toBeVisible()
})

test.afterAll(async () => {
  await exitApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test('arrows move the selection and focus; → and ← open and close folders', async () => {
  await row('folder').click()
  await expect(row('folder')).toBeFocused()
  await expect(row('folder')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(row('folder')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(row('inside.txt')).toBeFocused()
  await expect(row('inside.txt')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(row('folder')).toBeFocused()
  await page.keyboard.press('End')
  await expect(row('b.txt')).toBeFocused()
})

test('Shift+arrows extend the selection and Esc goes back to the focused item', async () => {
  await row('a.txt').click()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(row('a.txt')).toHaveAttribute('aria-selected', 'true')
  await expect(row('b.txt')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(row('a.txt')).toHaveAttribute('aria-selected', 'false')
  await expect(row('b.txt')).toHaveAttribute('aria-selected', 'true')
})

test('Enter renames the selected item and focus returns to the row', async () => {
  // A single click opens the preview without taking focus from the row (the editor does not steal it): Enter renames.
  await row('b.txt').click()
  await expect(page.locator('.tab.preview')).toBeVisible()
  await expect(row('b.txt')).toBeFocused()
  await page.keyboard.press('Enter')
  const input = page.locator('.tree-row.editing input')
  await expect(input).toBeFocused()
  await input.fill('c.txt')
  await page.keyboard.press('Enter')
  await expect.poll(() => existsSync(join(repoDir, 'c.txt'))).toBe(true)
  await expect(row('c.txt')).toBeFocused()
})

test('Esc cancels the rename and returns focus to the row', async () => {
  await row('a.txt').focus()
  await page.keyboard.press('Enter')
  await page.locator('.tree-row.editing input').press('Escape')
  await expect(page.locator('.tree-row.editing')).toHaveCount(0)
  await expect(row('a.txt')).toBeFocused()
  expect(existsSync(join(repoDir, 'a.txt'))).toBe(true)
})
