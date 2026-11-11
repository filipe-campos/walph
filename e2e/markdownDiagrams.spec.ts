import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { exitApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand } from './helpers'

const DOC = [
  '# Recursos',
  '',
  '```mermaid',
  'graph TD',
  '  A[Inicio] --> B[Fim]',
  '```',
  '',
  '```mermaid',
  'isto nao e um diagrama',
  '```',
  '',
  'Formula $x^2 + \\sqrt{y}$ no texto.',
  '',
  '> [!NOTE]',
  '> Um aviso.',
  '',
  'Com nota[^1].',
  '',
  '[^1]: Rodape.',
  ''
].join('\n')

let tmpBase: string
let app: ElectronApplication
let page: Page

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  const repo = makeRepo(tmpBase, 'projeto', { 'doc.md': DOC })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repo] }))
  await expect(treeRow('doc.md')).toBeVisible()
})

test.afterAll(async () => {
  await exitApp(app)
  removeDir(tmpBase)
})

test('preview draws mermaid, KaTeX, alerts and footnotes under the CSP', async () => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await treeRow('doc.md').dblclick()
  await sendCommand(app, page, 'editor.markdownPreview')
  const preview = page.locator('.markdown-preview')
  await expect(preview.locator('.md-diagram svg').first()).toBeVisible({ timeout: 20_000 })
  await expect(preview.locator('.md-diagram-error')).toHaveCount(1)
  await expect(preview.locator('.katex')).toHaveCount(1)
  await expect(preview.locator('.markdown-alert-note')).toContainText('Um aviso.')
  await expect(preview.locator('section.footnotes')).toContainText('Rodape.')
  expect(errors.filter((e) => /Content Security Policy|eval/i.test(e))).toEqual([])
})
