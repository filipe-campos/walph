import { basename, join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo } from './helpers'

const README = '# Projeto de teste\n'
const INDEX = "export const saudacao = 'olá, mundo'\n"

let tmpBase: string
let repoDir: string
let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repoDir = makeRepo(tmpBase, 'projeto-fumaca', { 'README.md': README, 'src/index.ts': INDEX })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repoDir] }))
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe('smoke', () => {
  test('shows the repository folder in the explorer tree and in the title', async () => {
    const labels = page.locator('.tree .tree-row .tree-label')
    await expect(labels.filter({ hasText: /^src$/ })).toHaveCount(1)
    await expect(labels.filter({ hasText: /^README\.md$/ })).toHaveCount(1)
    await expect(page).toHaveTitle(new RegExp(basename(repoDir)))
  })

  test('opens a file and shows the content in the editor with the tab', async () => {
    await page.locator('.tree .tree-row', { hasText: /^README\.md$/ }).click()
    await expect(page.locator('.cm-editor .cm-content')).toContainText('Projeto de teste')
    await expect(page.locator('.tab-bar .tab.active .tab-label')).toHaveText('README.md')
  })

  test('expands a folder and opens the file inside', async () => {
    await page.locator('.tree .tree-row', { hasText: /^src$/ }).click()
    await page.locator('.tree .tree-row', { hasText: /^index\.ts$/ }).click()
    await expect(page.locator('.cm-editor .cm-content')).toContainText('olá, mundo')
    await expect(page.locator('.tab-bar .tab.active .tab-label')).toHaveText('index.ts')
  })
})
