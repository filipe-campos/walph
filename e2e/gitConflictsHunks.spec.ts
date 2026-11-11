import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, test, type Launch } from './fixtures'
import { git, sendCommand as sendAppCommand } from './helpers'

let app: ElectronApplication
let page: Page

async function open(launch: Launch, repo: string): Promise<void> {
  ;({ app, page } = await launch({ folders: [repo] }))
  await expect(page.locator('.tree .tree-row').first()).toBeVisible()
  await expect(page.locator('.status-bar button[title^="Mudar de branch…"]')).toBeVisible()
  await sendCommand('view.git')
}

const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)

const gitFile = (name: string): Locator =>
  page.locator('.git-file', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const editor = (): Locator => page.locator('.code-editor .cm-content[contenteditable="true"]')

const lines = (n: number): string => Array.from({ length: n }, (_, i) => `l${i + 1}\n`).join('')

test.describe('stage by hunk', () => {
  test('the stage button of a hunk in the diff only takes that hunk to the index', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': lines(20) })
    const changed = lines(20).replace('l2\n', 'dois\n').replace('l18\n', 'dezoito\n')
    writeFileSync(join(repo, 'a.txt'), changed)
    await open(launch, repo)

    await gitFile('a.txt').click()
    const stage = page.locator('.diff-host [data-hunk-action="stage"]')
    await expect(stage).toHaveCount(2)
    await stage.first().click()

    await expect.poll(() => git(repo, 'show', ':a.txt')).toBe(lines(20).replace('l2\n', 'dois\n'))
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe(changed)
    await expect(page.locator('.git-section', { hasText: 'Staged' }).locator('.git-file')).toHaveCount(1)
  })
})

test.describe('merge conflicts', () => {
  test('lists the file, resolves it in the editor and marks it as resolved', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'c.txt': 'base\n' })
    git(repo, 'switch', '-q', '-c', 'outra')
    writeFileSync(join(repo, 'c.txt'), 'deles\n')
    git(repo, 'commit', '-qam', 'deles')
    git(repo, 'switch', '-q', 'main')
    writeFileSync(join(repo, 'c.txt'), 'nosso\n')
    git(repo, 'commit', '-qam', 'nosso')
    expect(() => git(repo, 'merge', 'outra')).toThrow()
    await open(launch, repo)

    await expect(page.locator('.git-operation-banner')).toContainText('Merge em andamento')
    const mergeSection = page.locator('.git-section', { hasText: 'Alterações de Merge' })
    await expect(mergeSection.locator('.git-file')).toHaveCount(1)

    await gitFile('c.txt').click()
    await expect(editor()).toContainText('<<<<<<< HEAD')
    await expect(page.locator('.cm-merge-current')).toHaveCount(1)
    await expect(page.locator('.cm-merge-incoming')).toHaveCount(1)
    await page.locator('.cm-merge-action[data-choice="incoming"]').click()
    await expect(editor()).toHaveText('deles')
    await sendCommand('editor.save')
    await expect.poll(() => readFileSync(join(repo, 'c.txt'), 'utf8')).toBe('deles\n')

    await gitFile('c.txt').hover()
    await gitFile('c.txt').getByRole('button', { name: 'Marcar como resolvido (stage)' }).click()
    await expect.poll(() => git(repo, 'status', '--porcelain')).toBe('M  c.txt\n')
    await expect(mergeSection).toHaveCount(0)
    await expect(page.locator('.git-operation-banner')).toBeVisible()
  })
})

test.describe('blame', () => {
  test('annotation at the end of the cursor line and in the status bar', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'b.txt': 'um\ndois\n' })
    await open(launch, repo)
    await sendCommand('view.explorer')
    await page.locator('.tree .tree-row', { hasText: 'b.txt' }).click()
    await expect(editor()).toContainText('um')

    await expect(page.locator('.cm-blame-inline')).toContainText('Walph Test')
    await expect(page.locator('.cm-blame-inline')).toContainText('initial')
    await expect(page.locator('.status-bar [data-status="blame"]')).toContainText('Walph Test')

    await editor().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' mais')
    await expect(page.locator('.cm-blame-inline')).toContainText('Não commitado ainda')
  })
})
