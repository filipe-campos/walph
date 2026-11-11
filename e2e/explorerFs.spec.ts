import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { confirmCalls as confirmCallsOf, expect, stubConfirm as stubConfirmOf, test, type Launch } from './fixtures'
import { sendCommand as sendAppCommand } from './helpers'

let app: ElectronApplication
let page: Page

async function open(launch: Launch, repo: string): Promise<void> {
  ;({ app, page } = await launch({ folders: [repo] }))
  await expect(row('a.txt')).toBeVisible()
}

const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)
const stubConfirm = (response: number): Promise<void> => stubConfirmOf(app, response)
const confirmCalls = (): Promise<{ message: string; buttons: string[] }[]> => confirmCallsOf(app)

const row = (name: string): Locator =>
  page.locator('.tree .tree-row[role="treeitem"]', {
    has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) })
  })
const editInput = (): Locator => page.locator('.tree-row.editing input')
const tab = (name: string): Locator => page.locator('.tab-bar .tab .tab-label', { hasText: new RegExp(`^${name}$`) })
const errorToast = (text: string | RegExp): Locator => page.locator('.toast-error', { hasText: text })

/** Replaces `shell.trashItem` with one that moves the item to `trashDir` and records the path: never the real trash. */
async function stubTrash(trashDir: string, failWith?: string): Promise<void> {
  mkdirSync(trashDir, { recursive: true })
  await app.evaluate(
    ({ shell }, { dir, fail }) => {
      const g = globalThis as unknown as { __trashed: string[] }
      g.__trashed = []
      const fs = process.getBuiltinModule('node:fs/promises')
      const path = process.getBuiltinModule('node:path')
      shell.trashItem = async (target: string) => {
        if (fail) throw new Error(fail)
        g.__trashed.push(target)
        await fs.rename(target, path.join(dir, path.basename(target)))
      }
    },
    { dir: trashDir, fail: failWith }
  )
}

const trashed = (): Promise<string[]> =>
  app.evaluate(() => (globalThis as unknown as { __trashed: string[] }).__trashed)

async function createVia(button: 'Novo Arquivo' | 'Nova Pasta', name: string): Promise<void> {
  await page.locator('.sidebar-title').getByRole('button', { name: button, exact: true }).click()
  await expect(editInput()).toBeFocused()
  await editInput().fill(name)
  await page.keyboard.press('Enter')
}

const FILES = {
  'a.txt': 'a\n',
  'dir/inside.txt': 'inside\n',
  'dir/sub/deep.txt': 'deep\n',
  'other/x.txt': 'x\n'
}

test.describe('create', () => {
  test('Novo Arquivo creates at the root, opens in a tab and shows in the tree', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)

    await createVia('Novo Arquivo', 'new.ts')

    await expect.poll(() => existsSync(join(repo, 'new.ts'))).toBe(true)
    expect(readFileSync(join(repo, 'new.ts'), 'utf8')).toBe('')
    await expect(row('new.ts')).toBeVisible()
    await expect(tab('new.ts')).toBeVisible()
  })

  test('Nova Pasta creates inside the selected folder and expands it', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await row('dir').click()
    await expect(row('dir')).toHaveAttribute('aria-selected', 'true')

    await createVia('Nova Pasta', 'newdir')

    await expect.poll(() => existsSync(join(repo, 'dir', 'newdir'))).toBe(true)
    await expect(row('newdir')).toBeVisible()
    expect(existsSync(join(repo, 'newdir'))).toBe(false)
  })

  test('with a file selected, the new file goes to its folder', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await row('dir').click()
    await row('inside.txt').click()

    await createVia('Novo Arquivo', 'sibling.txt')

    await expect.poll(() => existsSync(join(repo, 'dir', 'sibling.txt'))).toBe(true)
    expect(existsSync(join(repo, 'sibling.txt'))).toBe(false)
  })

  test('an existing name warns and does not overwrite the file', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)

    await createVia('Novo Arquivo', 'a.txt')

    await expect(errorToast('Já existe')).toBeVisible()
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('a\n')
  })

  test('a name with a path separator is rejected and nothing is created', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)

    await createVia('Novo Arquivo', '../outside.txt')

    await expect(errorToast('Nome inválido')).toBeVisible()
    expect(existsSync(join(repo, '..', 'outside.txt'))).toBe(false)
    expect(readdirSync(repo).sort()).toEqual(['.git', 'a.txt', 'dir', 'other'])
  })

  test('Esc cancels the creation and a blank name creates nothing', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)

    await page.locator('.sidebar-title').getByRole('button', { name: 'Novo Arquivo', exact: true }).click()
    await editInput().fill('canceled.txt')
    await page.keyboard.press('Escape')
    await expect(editInput()).toHaveCount(0)

    await createVia('Novo Arquivo', '   ')
    await expect(editInput()).toHaveCount(0)

    expect(readdirSync(repo).sort()).toEqual(['.git', 'a.txt', 'dir', 'other'])
  })
})

test.describe('trash', () => {
  test('Delete confirms and sends the file to the trash, closing its tab', async ({ launch, makeRepo, tmp }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await stubTrash(join(tmp, 'trash'))
    await stubConfirm(0)
    await row('a.txt').dblclick()
    await expect(tab('a.txt')).toBeVisible()

    await row('a.txt').focus()
    await page.keyboard.press('Delete')

    await expect(row('a.txt')).toHaveCount(0)
    await expect(tab('a.txt')).toHaveCount(0)
    expect(existsSync(join(repo, 'a.txt'))).toBe(false)
    expect(await trashed()).toEqual([join(repo, 'a.txt')])
    expect(readFileSync(join(tmp, 'trash', 'a.txt'), 'utf8')).toBe('a\n')
    const calls = await confirmCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].message).toBe('Mover "a.txt" para a lixeira?')
  })

  test('canceling the confirmation keeps the file', async ({ launch, makeRepo, tmp }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await stubTrash(join(tmp, 'trash'))
    await stubConfirm(1)

    await row('a.txt').focus()
    await page.keyboard.press('Delete')

    await expect.poll(async () => (await confirmCalls()).length).toBe(1)
    expect(await trashed()).toEqual([])
    expect(existsSync(join(repo, 'a.txt'))).toBe(true)
    await expect(row('a.txt')).toBeVisible()
  })

  test('deleting a folder takes its contents and closes the tabs inside it', async ({ launch, makeRepo, tmp }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await stubTrash(join(tmp, 'trash'))
    await stubConfirm(0)
    await row('dir').click()
    await row('inside.txt').dblclick()
    await expect(tab('inside.txt')).toBeVisible()

    await row('dir').focus()
    await page.keyboard.press('Delete')

    await expect(row('dir')).toHaveCount(0)
    await expect(tab('inside.txt')).toHaveCount(0)
    expect(existsSync(join(repo, 'dir'))).toBe(false)
    expect(await trashed()).toEqual([join(repo, 'dir')])
    expect(existsSync(join(tmp, 'trash', 'dir', 'sub', 'deep.txt'))).toBe(true)
    expect(existsSync(join(repo, 'other', 'x.txt'))).toBe(true)
  })

  test('an OS refusal becomes an error message and the file stays in place', async ({ launch, makeRepo, tmp }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await stubTrash(join(tmp, 'trash'), 'volume without trash')
    await stubConfirm(0)

    await row('a.txt').focus()
    await page.keyboard.press('Delete')

    await expect(errorToast('volume without trash')).toBeVisible()
    expect(existsSync(join(repo, 'a.txt'))).toBe(true)
    await expect(row('a.txt')).toBeVisible()
  })
})

test.describe('move and drag', () => {
  test('dragging a file onto a folder moves it on disk and the open tab follows the new path', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await row('a.txt').dblclick()
    await expect(tab('a.txt')).toBeVisible()

    await row('a.txt').dragTo(row('other'))

    await expect.poll(() => existsSync(join(repo, 'other', 'a.txt'))).toBe(true)
    await expect.poll(() => existsSync(join(repo, 'a.txt'))).toBe(false)
    expect(readFileSync(join(repo, 'other', 'a.txt'), 'utf8')).toBe('a\n')
    await expect(row('a.txt')).toHaveCount(0)
    await expect(tab('a.txt')).toBeVisible()
    await expect(page.locator('.tab-bar .tab.active')).toHaveAttribute('title', join(repo, 'other', 'a.txt'))
  })

  test('dragging a folder into another moves the whole tree', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)

    await row('dir').dragTo(row('other'))

    await expect.poll(() => existsSync(join(repo, 'other', 'dir', 'sub', 'deep.txt'))).toBe(true)
    expect(existsSync(join(repo, 'dir'))).toBe(false)
  })

  test('dropping on the empty area of the tree moves to the root', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await row('other').click()
    await row('x.txt').dragTo(page.locator('.tree[role="tree"]'), { targetPosition: { x: 20, y: 400 } })

    await expect.poll(() => existsSync(join(repo, 'x.txt'))).toBe(true)
    await expect.poll(() => existsSync(join(repo, 'other', 'x.txt'))).toBe(false)
  })

  test('a destination with the same name warns and does not overwrite', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ ...FILES, 'other/a.txt': 'different\n' })
    await open(launch, repo)

    await row('a.txt').dragTo(row('other'))

    await expect(errorToast(/Já existe|existe/)).toBeVisible()
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('a\n')
    expect(readFileSync(join(repo, 'other', 'a.txt'), 'utf8')).toBe('different\n')
  })

  test('a folder cannot be dropped into itself or a descendant', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)
    await row('dir').click()
    await expect(row('sub')).toBeVisible()

    await row('dir').dragTo(row('sub'))
    await row('dir').dragTo(row('dir'))
    // Moves reach main in order: when this one finishes, the invalid drags above were already processed.
    await row('a.txt').dragTo(row('other'))
    await expect.poll(() => existsSync(join(repo, 'other', 'a.txt'))).toBe(true)

    expect(existsSync(join(repo, 'dir', 'sub', 'deep.txt'))).toBe(true)
    expect(existsSync(join(repo, 'dir', 'sub', 'dir'))).toBe(false)
    expect(existsSync(join(repo, 'dir', 'dir'))).toBe(false)
    await expect(errorToast(/.+/)).toHaveCount(0)
  })

  test('cut and paste moves, copy and paste duplicates with a free name', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)

    await row('a.txt').click()
    await sendCommand('explorer.cut')
    await row('other').click()
    await sendCommand('explorer.paste')
    await expect.poll(() => existsSync(join(repo, 'other', 'a.txt'))).toBe(true)
    await expect.poll(() => existsSync(join(repo, 'a.txt'))).toBe(false)

    await row('a.txt').click()
    await sendCommand('explorer.copy')
    await sendCommand('explorer.paste')
    await expect.poll(() => readdirSync(join(repo, 'other')).sort()).toEqual(['a copy.txt', 'a.txt', 'x.txt'])
    expect(readFileSync(join(repo, 'other', 'a copy.txt'), 'utf8')).toBe('a\n')
  })

  test('⌘/Ctrl-click selects several items, copy and paste takes them all', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    await open(launch, repo)

    await row('a.txt').click()
    await row('dir').click({ modifiers: ['ControlOrMeta'] })
    await expect(row('a.txt')).toHaveAttribute('aria-selected', 'true')
    await expect(row('dir')).toHaveAttribute('aria-selected', 'true')
    // Toggling the selection opens neither the folder nor the file.
    await expect(row('inside.txt')).toHaveCount(0)
    await expect(page.locator('.tab-bar .tab')).toHaveCount(1)

    await sendCommand('explorer.copy')
    await row('other').click()
    await sendCommand('explorer.paste')

    await expect.poll(() => existsSync(join(repo, 'other', 'a.txt'))).toBe(true)
    await expect.poll(() => existsSync(join(repo, 'other', 'dir', 'inside.txt'))).toBe(true)
    expect(existsSync(join(repo, 'a.txt'))).toBe(true)
  })
})
