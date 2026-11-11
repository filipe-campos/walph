import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { confirmCalls as confirmCallsOf, expect, stubConfirm as stubConfirmOf, test, type Launch } from './fixtures'
import { git, sendCommand as sendAppCommand, waitForIdle } from './helpers'

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
const stashRow = (message: string): Locator =>
  page.locator(`.git-file[aria-label^="stash@{0}: "][aria-label$="${message}"]`)
const diffSides = (): Locator => page.locator('.diff-host .cm-content')
const diffHeader = (): Locator => page.locator('.diff-editor .diff-header')
const paletteInput = (): Locator => page.locator('.palette-input')

const sideTexts = async (): Promise<string[]> => (await diffSides().allInnerTexts()).map((t) => t.trim())

test.describe('diff editor', () => {
  test('an unstaged change shows Staged against the working tree, read-only', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'um\ndois\ntres\n' })
    writeFileSync(join(repo, 'a.txt'), 'um\nDOIS\ntres\n')
    await open(launch, repo)

    await gitFile('a.txt').click()

    await expect(diffHeader()).toContainText('a.txt')
    await expect(diffHeader()).toContainText('Staged ↔ Working Tree')
    await expect(diffSides()).toHaveCount(2)
    await expect.poll(sideTexts).toEqual(['um\ndois\ntres', 'um\nDOIS\ntres'])
    await expect(diffSides().first()).toHaveAttribute('contenteditable', 'false')
    await expect(diffSides().last()).toHaveAttribute('contenteditable', 'false')
    await expect(page.locator('.diff-host .cm-changedLine')).not.toHaveCount(0)
  })

  test('a staged change shows HEAD against the index and follows the stage and the disk', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo({ 'a.txt': 'um\ndois\n' })
    writeFileSync(join(repo, 'a.txt'), 'um\ndois\ntres\n')
    await open(launch, repo)
    await gitFile('a.txt').hover()
    await gitFile('a.txt').getByRole('button', { name: 'Adicionar ao stage' }).click()
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('a.txt')

    await gitFile('a.txt').click()
    await expect(diffHeader()).toContainText('HEAD ↔ Staged')
    await expect.poll(sideTexts).toEqual(['um\ndois', 'um\ndois\ntres'])

    // Editing again on disk: the file now shows under Alterações and the staged side stays the index one.
    writeFileSync(join(repo, 'a.txt'), 'um\ndois\ntres\nquatro\n')
    const changes = page.locator('.git-section', { hasText: 'Alterações' }).locator('.git-file')
    await expect(changes).toHaveCount(1)
    await waitForIdle(page)

    // The disk diff opens in another tab (proof the edit was already processed); the staged tab keeps the index.
    await changes.click()
    await expect(diffHeader()).toContainText('Staged ↔ Working Tree')
    await expect.poll(sideTexts).toEqual(['um\ndois\ntres', 'um\ndois\ntres\nquatro'])
    await page.locator('.git-section', { hasText: 'Staged' }).locator('.git-file').click()
    await expect(diffHeader()).toContainText('HEAD ↔ Staged')
    await expect.poll(sideTexts).toEqual(['um\ndois', 'um\ndois\ntres'])
  })

  test('the open diff is reloaded when the file changes on disk', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'um\n' })
    writeFileSync(join(repo, 'a.txt'), 'um\ndois\n')
    await open(launch, repo)
    await gitFile('a.txt').click()
    await expect.poll(sideTexts).toEqual(['um', 'um\ndois'])

    writeFileSync(join(repo, 'a.txt'), 'um\ndois\ntrês ção\n')

    await expect.poll(sideTexts).toEqual(['um', 'um\ndois\ntrês ção'])
  })

  test('a file deleted in the working tree leaves the right side empty', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'conteudo\n', 'b.txt': 'b\n' })
    rmSync(join(repo, 'a.txt'))
    await open(launch, repo)

    await gitFile('a.txt').click()

    await expect(diffHeader()).toContainText('Staged ↔ Working Tree')
    await expect.poll(sideTexts).toEqual(['conteudo', ''])
  })

  test('a CRLF file opens the diff without marking every line as changed', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'um\r\ndois\r\ntres\r\n' })
    writeFileSync(join(repo, 'a.txt'), 'um\r\ndois\r\nTRES\r\n')
    await open(launch, repo)

    await gitFile('a.txt').click()

    await expect.poll(sideTexts).toEqual(['um\ndois\ntres', 'um\ndois\nTRES'])
    await expect(page.locator('.diff-host .cm-changedLine')).toHaveCount(2)
  })

  test('"Abrir arquivo" in the header opens the editable file in another tab', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'um\n' })
    writeFileSync(join(repo, 'a.txt'), 'um\ndois\n')
    await open(launch, repo)
    await gitFile('a.txt').click()
    await expect(diffSides()).toHaveCount(2)

    await page.locator('.diff-header').getByRole('button', { name: 'Abrir arquivo' }).click()

    await expect(
      page.locator('.cm-editor:not(.cm-merge-a):not(.cm-merge-b) .cm-content[contenteditable="true"]')
    ).toBeVisible()
    await expect(page.locator('.tab-bar .tab')).toHaveCount(2)
  })

  test('a file from a commit opens the read-only diff with the short hash', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'um\n' })
    writeFileSync(join(repo, 'a.txt'), 'um\ndois\n')
    git(repo, 'commit', '-q', '-am', 'segundo')
    const short = git(repo, 'rev-parse', '--short=7', 'HEAD').trim()
    await open(launch, repo)
    await sendCommand('git.showHistory')

    const commit = page.locator('.commit-row', { hasText: 'segundo' })
    await commit.click()
    await page.locator('.commit-file', { has: page.locator('.tree-label', { hasText: /^a\.txt$/ }) }).click()

    await expect(diffHeader()).toContainText(`Commit ${short} (somente leitura)`)
    await expect.poll(sideTexts).toEqual(['um', 'um\ndois'])
    await expect(page.locator('.diff-header').getByRole('button', { name: 'Abrir arquivo' })).toHaveCount(0)
  })
})

test.describe('stash', () => {
  const stubConfirm = (response: number): Promise<void> => stubConfirmOf(app, response)
  const confirmCalls = (): Promise<{ message: string; buttons: string[] }[]> => confirmCallsOf(app)

  test('stashes the changes with a message, cleans the working tree and lists the stash', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo({ 'a.txt': 'a\n' })
    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    await open(launch, repo)
    await expect(gitFile('a.txt')).toBeVisible()

    await sendCommand('git.stash')
    await paletteInput().fill('trabalho em curso')
    await expect(page.locator('.palette-item', { hasText: 'Guardar com a mensagem "trabalho em curso"' })).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(stashRow('trabalho em curso')).toBeVisible()
    await expect(page.locator('.toast', { hasText: 'Alterações guardadas no stash.' })).toBeVisible()
    expect(git(repo, 'status', '--porcelain').trim()).toBe('')
    expect(git(repo, 'stash', 'list')).toContain('trabalho em curso')
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('a\n')
  })

  test('without local changes it warns and creates no stash', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'a\n' })
    await open(launch, repo)

    await sendCommand('git.stash')
    await paletteInput().fill('nada')
    await page.keyboard.press('Enter')

    await expect(page.locator('.toast-error', { hasText: 'Não há alterações locais para guardar' })).toBeVisible()
    expect(git(repo, 'stash', 'list').trim()).toBe('')
  })

  test('apply keeps the stash, apply and remove (pop) drops it', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'a\n' })
    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    git(repo, 'stash', 'push', '-q', '-m', 'primeiro')
    await open(launch, repo)
    await expect(stashRow('primeiro')).toBeVisible()

    await stashRow('primeiro').hover()
    await stashRow('primeiro').getByRole('button', { name: 'Aplicar', exact: true }).click()
    await expect(gitFile('a.txt')).toBeVisible()
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('a2\n')
    expect(git(repo, 'stash', 'list')).toContain('primeiro')
    await expect(stashRow('primeiro')).toBeVisible()

    git(repo, 'checkout', '-q', '--', 'a.txt')
    await expect(gitFile('a.txt')).toHaveCount(0)
    await stashRow('primeiro').hover()
    await stashRow('primeiro').getByRole('button', { name: 'Aplicar e remover (pop)' }).click()
    await expect(gitFile('a.txt')).toBeVisible()
    await expect(stashRow('primeiro')).toHaveCount(0)
    expect(git(repo, 'stash', 'list').trim()).toBe('')
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('a2\n')
  })

  test('remove asks for confirmation: cancel keeps the stash, confirm removes it', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'a\n' })
    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    git(repo, 'stash', 'push', '-q', '-m', 'descartavel')
    await open(launch, repo)
    await expect(stashRow('descartavel')).toBeVisible()

    await stubConfirm(1)
    await stashRow('descartavel').hover()
    await stashRow('descartavel').getByRole('button', { name: 'Remover', exact: true }).click()
    await expect.poll(async () => (await confirmCalls()).length).toBe(1)
    expect((await confirmCalls())[0].message).toContain('descartavel')
    expect(git(repo, 'stash', 'list')).toContain('descartavel')
    await expect(stashRow('descartavel')).toBeVisible()

    await stubConfirm(0)
    await stashRow('descartavel').hover()
    await stashRow('descartavel').getByRole('button', { name: 'Remover', exact: true }).click()
    await expect(stashRow('descartavel')).toHaveCount(0)
    expect(git(repo, 'stash', 'list').trim()).toBe('')
  })

  test('the picker applies the chosen stash and warns when there are no stashes', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    await open(launch, repo)

    await sendCommand('git.stashApply')
    await expect(page.locator('.toast', { hasText: 'Não há stashes neste repositório.' })).toBeVisible()
    await expect(page.locator('.palette')).toHaveCount(0)

    writeFileSync(join(repo, 'b.txt'), 'b2\n')
    git(repo, 'stash', 'push', '-q', '-m', 'do b')
    await expect(stashRow('do b')).toBeVisible()

    await sendCommand('git.stashApply')
    const item = page.locator('.palette-item', { hasText: 'do b' })
    await expect(item).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(gitFile('b.txt')).toBeVisible()
    expect(readFileSync(join(repo, 'b.txt'), 'utf8')).toBe('b2\n')
    expect(git(repo, 'stash', 'list')).toContain('do b')
  })
})
