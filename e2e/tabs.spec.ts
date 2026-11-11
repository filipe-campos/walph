import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { exitApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { git } from './helpers'

let tmpBase: string
let repoDir: string
let app: ElectronApplication
let page: Page

function write(rel: string, content: string): void {
  const abs = join(repoDir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

const abs = (rel: string): string => join(repoDir, rel)

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const tabs = (): Locator => page.locator('.tab-bar .tab')
const tab = (name: string): Locator =>
  tabs().filter({ has: page.locator('.tab-label', { hasText: new RegExp(`^${name}$`) }) })
const editor = (): Locator => page.locator('.cm-editor .cm-content')

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repoDir = join(tmpBase, 'projeto-abas')
  mkdirSync(repoDir, { recursive: true })
  write('a.txt', 'content of file A\n')
  write('b.txt', 'content of file B\n')
  write('externo.txt', 'linha original\n')
  write('conflito.txt', 'base do conflito\n')
  write('apagar.txt', 'vou ser apagado\n')
  git(repoDir, 'init', '-q', '-b', 'main')
  git(repoDir, 'add', '.')
  git(repoDir, 'commit', '-q', '-m', 'initial')
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repoDir] }))
  await expect(treeRow('a.txt')).toBeVisible()
})

test.afterAll(async () => {
  await exitApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test.describe('preview tab', () => {
  test('single click opens a preview tab (italic)', async () => {
    await treeRow('a.txt').click()
    await expect(tabs()).toHaveCount(1)
    await expect(tab('a.txt')).toHaveClass(/\bpreview\b/)
    await expect(editor()).toContainText('content of file A')
  })

  test('clicking another file replaces the preview tab', async () => {
    await treeRow('b.txt').click()
    await expect(tabs()).toHaveCount(1)
    await expect(tab('b.txt')).toHaveClass(/\bpreview\b/)
    await expect(tab('a.txt')).toHaveCount(0)
    await expect(editor()).toContainText('content of file B')
  })

  test('double click on the tab pins it', async () => {
    await tab('b.txt').dblclick()
    await expect(tab('b.txt')).not.toHaveClass(/\bpreview\b/)
  })

  test('with the tab pinned, opening another file creates a second tab', async () => {
    await treeRow('a.txt').click()
    await expect(tabs()).toHaveCount(2)
    await expect(tab('b.txt')).not.toHaveClass(/\bpreview\b/)
    await expect(tab('a.txt')).toHaveClass(/\bpreview\b/)
    await expect(editor()).toContainText('content of file A')
  })

  test('editing the preview tab pins it and it is no longer replaced', async () => {
    await editor().click()
    await page.keyboard.type('X')
    await expect(tab('a.txt')).toHaveClass(/\bdirty\b/)
    await expect(tab('a.txt')).not.toHaveClass(/\bpreview\b/)
    await treeRow('externo.txt').click()
    await expect(tabs()).toHaveCount(3)
    await expect(tab('a.txt')).toHaveCount(1)
  })
})

test.describe('external changes on disk', () => {
  test('a clean file is reloaded with the disk content', async () => {
    await expect(tab('externo.txt')).toBeVisible()
    await expect(editor()).toContainText('linha original')
    appendFileSync(abs('externo.txt'), 'linha externa\n')
    await expect(editor()).toContainText('linha externa', { timeout: 15_000 })
    await expect(tab('externo.txt')).not.toHaveClass(/\bdirty\b/)
    await expect(page.locator('.conflict-bar')).toHaveCount(0)
  })

  test('a dirty file shows the conflict bar and "Recarregar do disco" restores the disk', async () => {
    await treeRow('conflito.txt').dblclick()
    await expect(editor()).toContainText('base do conflito')
    await editor().click()
    await page.keyboard.type('MINHA-EDICAO ')
    await expect(tab('conflito.txt')).toHaveClass(/\bdirty\b/)

    appendFileSync(abs('conflito.txt'), 'veio do disco\n')
    const bar = page.locator('.conflict-bar')
    await expect(bar).toBeVisible({ timeout: 15_000 })
    // The user's edit is not lost until they decide.
    await expect(editor()).toContainText('MINHA-EDICAO')

    await bar.getByRole('button', { name: 'Recarregar do disco' }).click()
    await expect(bar).toHaveCount(0)
    await expect(editor()).toContainText('veio do disco')
    await expect(editor()).not.toContainText('MINHA-EDICAO')
    await expect(tab('conflito.txt')).not.toHaveClass(/\bdirty\b/)
    // The disk keeps the external content.
    expect(readFileSync(abs('conflito.txt'), 'utf8')).toBe('base do conflito\nveio do disco\n')
  })

  test('a file deleted on disk marks the tab as removed', async () => {
    await treeRow('apagar.txt').dblclick()
    await expect(editor()).toContainText('vou ser apagado')
    unlinkSync(abs('apagar.txt'))
    await expect(tab('apagar.txt')).toHaveClass(/\bdeleted\b/, { timeout: 15_000 })
    await expect(tab('apagar.txt')).toHaveAttribute('title', /removido do disco/)
  })
})
