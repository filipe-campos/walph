import { chmodSync, lstatSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { exitApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { flushWatcher, makeRepo, sendCommand } from './helpers'

// The editor save is atomic (tmp + rename): the save itself must not become an "external change" or a conflict.
let tmpBase: string
let repo: string
let app: ElectronApplication
let page: Page

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const tab = (name: string): Locator =>
  page.locator('.tab-bar .tab').filter({ has: page.locator('.tab-label', { hasText: new RegExp(`^${name}$`) }) })
const editor = (): Locator => page.locator('.cm-editor .cm-content')
const tmpFiles = (): string[] => readdirSync(repo).filter((n) => n.endsWith('.tmp'))

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repo = makeRepo(tmpBase, 'projeto', { 'a.txt': 'alfa\n', 'run.sh': '#!/bin/sh\n', 'real.txt': 'alvo\n' })
  chmodSync(join(repo, 'run.sh'), 0o750)
  symlinkSync('real.txt', join(repo, 'link.txt'))
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repo] }))
  await expect(treeRow('a.txt')).toBeVisible()
})

test.afterAll(async () => {
  await exitApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

async function editAndSave(name: string, text: string): Promise<void> {
  await treeRow(name).dblclick()
  await expect(tab(name)).toBeVisible()
  await editor().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
  await expect(tab(name)).toHaveClass(/\bdirty\b/)
  await sendCommand(app, page, 'editor.save')
  await expect(tab(name)).not.toHaveClass(/\bdirty\b/)
}

test('saving writes to disk, leaves no temp file and the watcher sees no conflict and does not reload', async () => {
  await editAndSave('a.txt', 'BETA')
  expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toContain('BETA')
  // Wait for the watcher batch (150 ms) to pass: the save itself must be ignored by the baseline comparison.
  await flushWatcher(page, repo)
  await expect(page.locator('.conflict-bar')).toHaveCount(0)
  await expect(tab('a.txt')).not.toHaveClass(/\bdirty\b/)
  await expect(tab('a.txt')).not.toHaveClass(/\bdeleted\b/)
  await expect(editor()).toContainText('BETA')
  expect(tmpFiles()).toEqual([])
  // The temp file is never visible in the explorer.
  await expect(page.locator('.tree .tree-label', { hasText: '.walph-' })).toHaveCount(0)
})

test('saving keeps the file mode', async () => {
  test.skip(process.platform === 'win32')
  await editAndSave('run.sh', '# fim')
  expect(statSync(join(repo, 'run.sh')).mode & 0o777).toBe(0o750)
})

test('saving a symlink writes to the target and keeps the link', async () => {
  test.skip(process.platform === 'win32')
  await editAndSave('link.txt', 'NOVO')
  expect(lstatSync(join(repo, 'link.txt')).isSymbolicLink()).toBe(true)
  expect(readFileSync(join(repo, 'real.txt'), 'utf8')).toContain('NOVO')
})
