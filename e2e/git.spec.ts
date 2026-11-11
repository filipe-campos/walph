import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import {
  confirmCalls as confirmCallsOf,
  expect,
  PLAIN_EDITOR_SETTINGS,
  stubConfirm as stubConfirmOf,
  test,
  type Launch
} from './fixtures'
import { git, sendCommand as sendAppCommand } from './helpers'

let app: ElectronApplication
let page: Page
let repoSeq = 0

/** Temporary repository on `main`; each item of `commits` becomes a commit (files + message). */
function makeRepo(tmp: string, commits: { message: string; files: Record<string, string> }[]): string {
  const dir = join(tmp, `repo-${++repoSeq}`)
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  for (const { message, files } of commits) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
    }
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', message)
  }
  return dir
}

async function open(launch: Launch, repo: string): Promise<void> {
  ;({ app, page } = await launch({ folders: [repo], settings: PLAIN_EDITOR_SETTINGS }))
  await expect(page.locator('.tree .tree-row').first()).toBeVisible()
  // The git commands need the status already loaded (the branch shows in the status bar).
  await expect(statusBranch()).toBeVisible()
}

const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)
const stubConfirm = (response: number): Promise<void> => stubConfirmOf(app, response)
const confirmCalls = (): Promise<{ message: string; buttons: string[] }[]> => confirmCallsOf(app)

const numbered = (n: number): string => Array.from({ length: n }, (_, i) => `l${i + 1}`).join('\n') + '\n'

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const gitFile = (name: string): Locator =>
  page.locator('.git-file', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const gutter = (kind: string): Locator => page.locator(`.cm-git-gutter .cm-gutterElement.cm-git-${kind}`)
const statusBranch = (): Locator => page.locator('.status-bar button[title^="Mudar de branch…"]')
const paletteInput = (): Locator => page.locator('.palette-input')

async function goTo(line: number, column = 1): Promise<void> {
  // Only types once the overlay field is focused: otherwise the first characters land in the editor.
  await sendCommand('editor.goToLine')
  await expect(page.getByRole('combobox')).toBeFocused()
  await page.keyboard.type(`${line}:${column}`)
  await page.keyboard.press('Enter')
}

async function openFile(name: string): Promise<void> {
  await treeRow(name).dblclick()
  await expect(page.locator('.tab-bar .tab .tab-label', { hasText: new RegExp(`^${name}$`) })).toBeVisible()
  await expect(page.locator('.cm-content')).toBeVisible()
}

test.describe('branches', () => {
  test('creates the branch teste from the picker, switches to it and back to main', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'a\n' } }])
    await open(launch, repo)
    await expect(statusBranch()).toContainText('main')

    await sendCommand('git.createBranch')
    await paletteInput().fill('teste')
    await expect(page.locator('.palette-item', { hasText: 'Criar branch "teste"' })).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(statusBranch()).toContainText('teste')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('teste')
    await expect(page.locator('.palette')).toHaveCount(0)

    // Goes back to main by picking it in the branch picker.
    await sendCommand('git.checkout')
    const main = page.locator('.palette-item', { hasText: /^main/ })
    await expect(main).toBeVisible()
    await expect(page.locator('.palette-item', { hasText: /^teste/ })).toContainText('atual')
    await main.click()

    await expect(statusBranch()).toContainText('main')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')
    expect(git(repo, 'branch', '--format=%(refname:short)').split('\n').filter(Boolean).sort()).toEqual([
      'main',
      'teste'
    ])
  })

  test('does not create a branch that already exists and stays on the current one', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'a\n' } }])
    git(repo, 'branch', 'existente')
    await open(launch, repo)

    await sendCommand('git.createBranch')
    await paletteInput().fill('existente')
    await page.keyboard.press('Enter')

    await expect(page.getByText('Já existe uma branch com esse nome.')).toBeVisible()
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')
    await expect(statusBranch()).toContainText('main')
  })
})

test.describe('editor gutter', () => {
  test('marks added, modified and removed lines and clears them on stage', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': numbered(10) } }])
    await open(launch, repo)
    await openFile('a.txt')

    // No changes, no marks.
    await expect(page.locator('.cm-git-gutter')).toHaveCount(1)
    await expect(page.locator('.cm-git-gutter .cm-gutterElement[class*="cm-git-"]')).toHaveCount(0)

    // Bottom to top, so the base line numbers stay valid.
    await goTo(8)
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Delete') // removes "l8"
    await goTo(5)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('novo') // adds after "l5"
    await goTo(2)
    await page.keyboard.press('Shift+End')
    await page.keyboard.type('DOIS') // replaces "l2"

    // Document: l1 DOIS l3 l4 l5 novo l6 l7 l9 l10
    await expect(gutter('modified')).toHaveCount(1)
    await expect(gutter('added')).toHaveCount(1)
    await expect(gutter('deleted')).toHaveCount(1)
    const lineText = (kind: string): Promise<string | null> =>
      page
        .locator('.cm-line')
        .nth(kind === 'modified' ? 1 : kind === 'added' ? 5 : 8)
        .textContent()
    expect(await lineText('modified')).toBe('DOIS')
    expect(await lineText('added')).toBe('novo')
    expect(await lineText('deleted')).toBe('l9')

    // Position: each mark is aligned with the right line (same index across lines and gutter elements).
    const tops = await page.locator('.cm-line').evaluateAll((els) => els.map((l) => l.getBoundingClientRect().top))
    const positions: number[] = []
    for (const k of ['modified', 'added', 'deleted']) {
      const top = (await gutter(k).boundingBox())!.y
      positions.push(tops.findIndex((t) => Math.abs(t - top) < 3) + 1)
    }
    expect(positions).toEqual([2, 6, 9])

    // Saves and stages from the Git view: the index now matches the document and the marks disappear.
    await sendCommand('editor.save')
    await expect.poll(() => readFileSync(join(repo, 'a.txt'), 'utf8')).toContain('DOIS')
    await sendCommand('view.git')
    await expect(gitFile('a.txt')).toBeVisible()
    await gitFile('a.txt').hover()
    await gitFile('a.txt').getByRole('button', { name: 'Adicionar ao stage' }).click()

    await expect(page.locator('.git-section', { hasText: 'Staged' })).toBeVisible()
    await expect(page.locator('.cm-git-gutter .cm-gutterElement[class*="cm-git-"]')).toHaveCount(0)
    expect(git(repo, 'diff', '--cached', '--name-only').trim()).toBe('a.txt')
  })

  test('the gutter works with the folder opened through a symbolic link', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': numbered(5) } }])
    const link = join(tmp, `link-${repoSeq}`)
    symlinkSync(repo, link, 'dir')
    await open(launch, link)
    await openFile('a.txt')
    await goTo(3)
    await page.keyboard.press('Shift+End')
    await page.keyboard.type('TRES')
    await expect(gutter('modified')).toHaveCount(1)
  })

  test('a new file (outside the index) shows no marks', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'a\n' } }])
    writeFileSync(join(repo, 'novo.txt'), 'x\ny\n')
    await open(launch, repo)
    await openFile('novo.txt')
    await goTo(1)
    await page.keyboard.type('mudou')
    await expect(page.locator('.cm-line').first()).toHaveText('mudoux')
    await expect(page.locator('.cm-git-gutter .cm-gutterElement[class*="cm-git-"]')).toHaveCount(0)
  })
})

test.describe('discard changes', () => {
  test('discards a modified file and the content goes back to HEAD', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'original\n', 'b.txt': 'b\n' } }])
    writeFileSync(join(repo, 'a.txt'), 'alterado\n')
    writeFileSync(join(repo, 'b.txt'), 'b alterado\n')
    await open(launch, repo)
    await sendCommand('view.git')
    await expect(gitFile('a.txt')).toBeVisible()
    await stubConfirm(0)

    await gitFile('a.txt').hover()
    await gitFile('a.txt').getByRole('button', { name: 'Descartar alterações' }).click()

    await expect(gitFile('a.txt')).toHaveCount(0)
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe(git(repo, 'show', 'HEAD:a.txt'))
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('original\n')
    // Only the chosen file is discarded.
    expect(readFileSync(join(repo, 'b.txt'), 'utf8')).toBe('b alterado\n')
    const calls = await confirmCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].message).toContain('a.txt')
    expect(calls[0].buttons).toEqual(['Descartar', 'Cancelar'])
  })

  test('cancelling the confirmation discards nothing', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'original\n' } }])
    writeFileSync(join(repo, 'a.txt'), 'alterado\n')
    await open(launch, repo)
    await sendCommand('view.git')
    await expect(gitFile('a.txt')).toBeVisible()
    await stubConfirm(1)

    await gitFile('a.txt').hover()
    await gitFile('a.txt').getByRole('button', { name: 'Descartar alterações' }).click()

    await expect.poll(async () => (await confirmCalls()).length).toBe(1)
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('alterado\n')
    await expect(gitFile('a.txt')).toBeVisible()
  })

  test('discards an untracked file, which no longer exists in the folder', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'a\n' } }])
    writeFileSync(join(repo, 'lixo.txt'), 'temporário\n')
    await open(launch, repo)
    await sendCommand('view.git')
    await expect(gitFile('lixo.txt')).toBeVisible()
    await stubConfirm(0)

    await gitFile('lixo.txt').hover()
    await gitFile('lixo.txt').getByRole('button', { name: 'Descartar alterações' }).click()

    await expect(gitFile('lixo.txt')).toHaveCount(0)
    expect(existsSync(join(repo, 'lixo.txt'))).toBe(false)
    expect(existsSync(join(repo, 'a.txt'))).toBe(true)
    expect((await confirmCalls())[0].message).toContain('lixo.txt')
  })

  test('"Discard All Changes" restores the tracked files and removes the new ones', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'a\n', 'b.txt': 'b\n' } }])
    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    writeFileSync(join(repo, 'b.txt'), 'b2\n')
    writeFileSync(join(repo, 'novo.txt'), 'n\n')
    await open(launch, repo)
    await sendCommand('view.git')
    await expect(gitFile('novo.txt')).toBeVisible()
    await stubConfirm(0)

    await sendCommand('git.discardAll')

    await expect.poll(() => git(repo, 'status', '--porcelain').trim()).toBe('')
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('a\n')
    expect(existsSync(join(repo, 'novo.txt'))).toBe(false)
  })
})

test.describe('commit, amend, undo and history', () => {
  test('Amend changes the last commit message without creating another', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [
      { message: 'primeiro', files: { 'a.txt': 'a\n' } },
      { message: 'mensagem antiga', files: { 'b.txt': 'b\n' } }
    ])
    await open(launch, repo)

    await sendCommand('git.commitAmend')
    const box = page.locator('.commit-box textarea')
    // Amend prefills the box with the last commit message.
    await expect(box).toHaveValue('mensagem antiga')
    await expect(page.locator('.commit-amend input')).toBeChecked()
    await box.fill('mensagem nova')
    await page.getByRole('button', { name: 'Alterar Commit' }).click()

    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('mensagem nova')
    expect(git(repo, 'rev-list', '--count', 'HEAD').trim()).toBe('2')
    await expect(box).toHaveValue('')
    await expect(page.locator('.commit-amend input')).not.toBeChecked()
  })

  test('a normal commit creates a new commit with what is staged', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'a\n' } }])
    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    await open(launch, repo)
    await sendCommand('view.git')
    await expect(gitFile('a.txt')).toBeVisible()

    const commit = page.getByTestId('commit-submit')
    await page.locator('.commit-box textarea').fill('segundo')
    await expect(commit).toBeDisabled() // nothing staged
    await gitFile('a.txt').hover()
    await gitFile('a.txt').getByRole('button', { name: 'Adicionar ao stage' }).click()
    await expect(commit).toBeEnabled()
    await commit.click()

    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('segundo')
    expect(git(repo, 'rev-list', '--count', 'HEAD').trim()).toBe('2')
    await expect(gitFile('a.txt')).toHaveCount(0)
  })

  test('"Undo Last Commit" keeps the changes staged and restores the message', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [
      { message: 'primeiro', files: { 'a.txt': 'a\n' } },
      { message: 'segundo commit', files: { 'b.txt': 'b\n' } }
    ])
    await open(launch, repo)

    await sendCommand('git.undoLastCommit')

    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('primeiro')
    // The file of the undone commit stays staged (nothing is lost).
    expect(git(repo, 'status', '--porcelain').trim()).toBe('A  b.txt')
    expect(readFileSync(join(repo, 'b.txt'), 'utf8')).toBe('b\n')
    await expect(page.locator('.git-section', { hasText: 'Staged' }).locator('.git-file')).toHaveCount(1)
    await expect(gitFile('b.txt')).toBeVisible()
    await expect(page.locator('.commit-box textarea')).toHaveValue('segundo commit')
  })

  test('the history lists the commits (newest to oldest) and shows the files of a commit', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [
      { message: 'primeiro', files: { 'a.txt': 'a\n' } },
      { message: 'segundo: ação', files: { 'sub/b.txt': 'b\n' } },
      { message: 'terceiro', files: { 'a.txt': 'a2\n' } }
    ])
    await open(launch, repo)

    await sendCommand('git.showHistory')
    const rows = page.locator('.commit-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.locator('.commit-subject')).toHaveText(['terceiro', 'segundo: ação', 'primeiro'])
    const head = git(repo, 'rev-parse', '--short', 'HEAD').trim()
    await expect(rows.first().locator('.commit-meta')).toContainText(head)
    await expect(rows.first().locator('.commit-meta')).toContainText('Walph Test')

    // Expanding the second commit shows the file it added; opening it creates a read-only diff.
    await rows.nth(1).click()
    const file = page.locator('.commit-file', { has: page.locator('.tree-label', { hasText: /^b\.txt$/ }) })
    await expect(file).toBeVisible()
    await expect(file.locator('.git-letter')).toHaveText('A')
    await file.click()
    await expect(page.locator('.tab-bar .tab').first()).toBeVisible()
    await expect(page.locator('.tab-bar .tab .tab-label', { hasText: 'b.txt' })).toBeVisible()
  })

  test('a freshly created repository, with no commits, shows an empty history', async ({ launch, tmp }) => {
    const dir = join(tmp, `vazio-${++repoSeq}`)
    mkdirSync(dir, { recursive: true })
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'a.txt'), 'a\n')
    await open(launch, dir)

    await sendCommand('git.showHistory')
    await expect(page.getByText('Nenhum commit ainda.')).toBeVisible()
    await expect(page.locator('.commit-row')).toHaveCount(0)
  })
})

test.describe('keyboard in the Git view', () => {
  test('arrows walk the changes, Tab reaches the row actions and staging keeps the focus in the list', async ({
    launch,
    tmp
  }) => {
    const repo = makeRepo(tmp, [{ message: 'initial', files: { 'a.txt': 'a\n', 'b.txt': 'b\n' } }])
    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    writeFileSync(join(repo, 'b.txt'), 'b2\n')
    await open(launch, repo)
    await sendCommand('view.git')

    const tree = page.getByRole('tree', { name: 'Controle de Código' })
    const changes = tree.getByRole('treeitem', { name: 'Alterações, 2 itens' })
    const fileA = tree.getByRole('treeitem', { name: /^a\.txt / })
    const fileB = tree.getByRole('treeitem', { name: /^b\.txt / })
    await expect(fileA).toBeVisible()
    await fileA.focus()
    await expect(fileA.getByRole('button', { name: 'Adicionar ao stage' })).toBeVisible()

    await page.keyboard.press('ArrowUp')
    await expect(changes).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(changes).toHaveAttribute('aria-expanded', 'false')
    await expect(fileA).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    await expect(changes).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('End')
    await expect(fileB).toBeFocused()
    await page.keyboard.press('Home')
    await expect(changes).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(fileA).toBeFocused()

    // Open file → Discard → Stage.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(fileA.getByRole('button', { name: 'Adicionar ao stage' })).toBeFocused()
    await page.keyboard.press('Enter')

    const staged = page.locator('.git-section', { hasText: 'Staged' })
    await expect(staged.locator('.git-file')).toHaveCount(1)
    await expect(staged.getByRole('treeitem', { name: /^a\.txt / })).toBeVisible()
    expect(git(repo, 'diff', '--cached', '--name-only').trim()).toBe('a.txt')
    await expect(fileB).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page.locator('.tab-bar .tab .tab-label', { hasText: 'b.txt' })).toBeVisible()
  })

  test('Enter expands a history commit and opens the diff of one of its files', async ({ launch, tmp }) => {
    const repo = makeRepo(tmp, [
      { message: 'primeiro', files: { 'a.txt': 'a\n' } },
      { message: 'segundo', files: { 'b.txt': 'b\n' } }
    ])
    await open(launch, repo)
    await sendCommand('git.showHistory')

    const commit = page.locator('.commit-row', { hasText: 'segundo' })
    await expect(commit).toHaveAttribute('aria-expanded', 'false')
    await commit.focus()
    await page.keyboard.press('Enter')
    await expect(commit).toHaveAttribute('aria-expanded', 'true')
    const file = page.locator('.commit-file', { has: page.locator('.tree-label', { hasText: /^b\.txt$/ }) })
    await expect(file).toBeVisible()

    await page.keyboard.press('ArrowDown')
    await expect(file).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(commit).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(commit).toHaveAttribute('aria-expanded', 'false')
    await expect(file).toHaveCount(0)

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await expect(file).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('.tab-bar .tab .tab-label', { hasText: 'b.txt' })).toBeVisible()
  })

  test('clicking the last commit in the status bar opens the history with that commit expanded', async ({
    launch,
    tmp
  }) => {
    const repo = makeRepo(tmp, [
      { message: 'primeiro', files: { 'a.txt': 'a\n' } },
      { message: 'segundo', files: { 'b.txt': 'b\n' } }
    ])
    await open(launch, repo)

    await page.locator('.status-bar [data-status="commit"]').click()
    const rows = page.locator('.commit-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toHaveAttribute('aria-expanded', 'true')
    await expect(rows.nth(1)).toHaveAttribute('aria-expanded', 'false')
    await expect(
      page.locator('.commit-file', { has: page.locator('.tree-label', { hasText: /^b\.txt$/ }) })
    ).toBeVisible()
  })
})
