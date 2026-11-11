import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import {
  confirmCalls as confirmCallsOf,
  expect,
  PLAIN_EDITOR_SETTINGS,
  stubConfirm as stubConfirmOf,
  test,
  type Launch
} from './fixtures'
import { sendCommand as sendAppCommand, settle } from './helpers'

let app: ElectronApplication
let page: Page

const read = (repo: string, rel: string): string => readFileSync(join(repo, rel), 'utf8')

async function open(launch: Launch, repo: string): Promise<void> {
  ;({ app, page } = await launch({ folders: [repo], settings: PLAIN_EDITOR_SETTINGS }))
  await expect(page.locator('.tree .tree-row').first()).toBeVisible()
}

const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)
const stubConfirm = (response: number): Promise<void> => stubConfirmOf(app, response)
const confirmCalls = (): Promise<{ message: string }[]> => confirmCallsOf(app)

const queryInput = (): Locator => page.getByRole('textbox', { name: 'Buscar', exact: true })
const replaceInput = (): Locator => page.getByRole('textbox', { name: 'Substituir', exact: true })
const includeInput = (): Locator => page.getByRole('textbox', { name: 'Arquivos a incluir' })
const excludeInput = (): Locator => page.getByRole('textbox', { name: 'Arquivos a excluir' })
const summary = (): Locator => page.locator('.search-summary')
const fileRows = (): Locator => page.locator('.search-file')
const matchRows = (): Locator => page.locator('.search-match')
const fileRow = (name: string): Locator =>
  page.locator('.search-file', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const tab = (name: string): Locator =>
  page.locator('.tab-bar .tab', { has: page.locator('.tab-label', { hasText: new RegExp(`^${name}$`) }) })
const editor = (): Locator => page.locator('.cm-editor .cm-content')

async function openSearch(): Promise<void> {
  await sendCommand('view.search')
  await expect(queryInput()).toBeVisible()
}

async function search(query: string): Promise<void> {
  await queryInput().fill(query)
  await expect(summary()).toContainText(/resultado/)
}

async function openReplace(value: string): Promise<void> {
  if (!(await replaceInput().isVisible())) await page.getByRole('button', { name: 'Alternar substituição' }).click()
  await replaceInput().fill(value)
}

async function openFilters(): Promise<void> {
  if (!(await includeInput().isVisible()))
    await page.getByRole('button', { name: 'Alternar detalhes da busca' }).click()
}

async function openFile(name: string): Promise<void> {
  await page
    .locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
    .dblclick()
  await expect(tab(name)).toBeVisible()
  await expect(editor()).toBeVisible()
}

/** PIDs of `rg` among the descendants of the app's main process (macOS/Linux). */
function rgDescendants(rootPid: number): number[] {
  const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' })
  const rows = out
    .split('\n')
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }))
  const family = new Set([rootPid])
  for (let grew = true; grew;) {
    grew = false
    for (const r of rows)
      if (!family.has(r.pid) && family.has(r.ppid)) {
        family.add(r.pid)
        grew = true
      }
  }
  return rows.filter((r) => family.has(r.pid) && /(^|\/)rg(\s|$)/.test(r.cmd)).map((r) => r.pid)
}

test.describe('replace in files', () => {
  test('foo -> bar changes exactly the matches shown and spares ignored and excluded files', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo({
      '.gitignore': 'ignorado/\n',
      'a.txt': 'foo um\nsem nada\nfoo dois foo\n',
      'sub/b.txt': 'xfoo\r\nação FOO ç\r\nfim\r\n',
      'c.md': 'foo\n',
      'node_modules/x.txt': 'foo no node_modules\n',
      'ignorado/y.txt': 'foo ignorado pelo git\n',
      'manter.log': 'foo que o filtro exclui\n'
    })
    await open(launch, repo)
    await openSearch()
    await openFilters()
    await excludeInput().fill('*.log')
    await search('foo')

    // a.txt (3) + b.txt (2, case-insensitive) + c.md (1)
    await expect(summary()).toHaveText('6 resultado(s) em 3 arquivo(s)')
    await expect(fileRows()).toHaveCount(3)
    await expect(matchRows()).toHaveCount(6)

    await openReplace('bar')
    await stubConfirm(0)
    await page.getByRole('button', { name: 'Substituir tudo' }).click()

    // The list only empties once the replace finished in every file (the rg order is not fixed).
    await expect(matchRows()).toHaveCount(0)
    expect(read(repo, 'c.md')).toBe('bar\n')
    expect(read(repo, 'a.txt')).toBe('bar um\nsem nada\nbar dois bar\n')
    expect(read(repo, 'sub/b.txt')).toBe('xbar\r\nação bar ç\r\nfim\r\n')
    expect(read(repo, 'node_modules/x.txt')).toBe('foo no node_modules\n')
    expect(read(repo, 'ignorado/y.txt')).toBe('foo ignorado pelo git\n')
    expect(read(repo, 'manter.log')).toBe('foo que o filtro exclui\n')

    const calls = await confirmCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].message).toContain('6 ocorrência(s) em 3 arquivo(s)')
  })

  test('cancelling the confirmation changes no file', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'foo\n' })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    await openReplace('bar')
    await stubConfirm(1)
    await page.getByRole('button', { name: 'Substituir tudo' }).click()
    await expect.poll(async () => (await confirmCalls()).length).toBe(1)
    await settle(page)
    expect(read(repo, 'a.txt')).toBe('foo\n')
    await expect(matchRows()).toHaveCount(1)
  })

  test('regex (\\w+)Service -> $1Repository shows the preview and replaces on disk', async ({ launch, makeRepo }) => {
    const repo = makeRepo({
      'a.ts': 'class UserService {}\nconst x = new OrderService(PaymentService)\n',
      'b.ts': 'Service sozinho\n'
    })
    await open(launch, repo)
    await openSearch()
    await page.getByRole('button', { name: 'Expressão regular' }).click()
    await search('(\\w+)Service')
    await expect(summary()).toHaveText('3 resultado(s) em 1 arquivo(s)')

    await openReplace('$1Repository')
    await expect(page.locator('.search-match .match-old').first()).toHaveText('UserService')
    await expect(page.locator('.search-match .match-new').first()).toHaveText('UserRepository')
    await expect(page.locator('.search-match .match-new')).toHaveText([
      'UserRepository',
      'OrderRepository',
      'PaymentRepository'
    ])

    await stubConfirm(0)
    await page.getByRole('button', { name: 'Substituir tudo' }).click()
    await expect
      .poll(() => read(repo, 'a.ts'))
      .toBe('class UserRepository {}\nconst x = new OrderRepository(PaymentRepository)\n')
    expect(read(repo, 'b.ts')).toBe('Service sozinho\n')
  })

  test('a dirty tab gets the edit in the buffer (disk untouched); an open clean tab is reloaded', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo({ 'suja.txt': 'foo aqui\n', 'limpa.txt': 'foo ali\n' })
    await open(launch, repo)
    await openFile('limpa.txt')
    await openFile('suja.txt')
    await editor().click()
    // Edits after the match: editing before it on the same line shifts the column and the match is skipped (by design).
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('NOVO')
    await expect(tab('suja.txt')).toHaveClass(/\bdirty\b/)

    await openSearch()
    await search('foo')
    await expect(summary()).toHaveText('2 resultado(s) em 2 arquivo(s)')
    await openReplace('bar')
    await stubConfirm(0)
    await page.getByRole('button', { name: 'Substituir tudo' }).click()

    // Clean: the disk changes and, when the tab is opened, the editor shows the new content.
    await expect.poll(() => read(repo, 'limpa.txt')).toBe('bar ali\n')
    // Dirty: only the buffer changes; the disk keeps the original text.
    expect(read(repo, 'suja.txt')).toBe('foo aqui\n')
    await expect(tab('suja.txt')).toHaveClass(/\bdirty\b/)
    await tab('suja.txt').click()
    await expect(editor()).toHaveText('bar aquiNOVO')
    await tab('limpa.txt').click()
    await expect(editor()).toHaveText('bar ali')
    await expect(tab('limpa.txt')).not.toHaveClass(/\bdirty\b/)
  })

  test('line inserted above in the dirty tab: the match is still replaced in the buffer', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo({ 'suja.txt': 'um\nfoo aqui\n' })
    await open(launch, repo)
    await openFile('suja.txt')
    await editor().click()
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.type('linha nova\n')
    await expect(tab('suja.txt')).toHaveClass(/\bdirty\b/)

    await openSearch()
    await search('foo')
    await openReplace('bar')
    await stubConfirm(0)
    await page.getByRole('button', { name: 'Substituir tudo' }).click()

    await expect(editor()).toContainText('bar aqui')
    expect(read(repo, 'suja.txt')).toBe('um\nfoo aqui\n')
  })

  test('replaces a single match (row action) and then a single file', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'foo 1\nfoo 2 foo 3\n', 'b.txt': 'foo b\n' })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    await expect(summary()).toHaveText('4 resultado(s) em 2 arquivo(s)')
    await openReplace('bar')

    // With the preview open the row shows "foo" struck through + the new "bar".
    const first = page.locator('.search-match', { hasText: /^foobar 1$/ })
    const matchesBefore = await matchRows().count()
    await first.hover()
    await first.getByRole('button', { name: 'Substituir' }).click()

    await expect.poll(() => read(repo, 'a.txt')).toBe('bar 1\nfoo 2 foo 3\n')
    expect(read(repo, 'b.txt')).toBe('foo b\n')
    await expect(matchRows()).toHaveCount(matchesBefore - 1)

    // Replaces only in b.txt: a.txt keeps the two remaining matches.
    await fileRow('b.txt').hover()
    await fileRow('b.txt').getByRole('button', { name: 'Substituir no arquivo' }).click()
    await expect.poll(() => read(repo, 'b.txt')).toBe('bar b\n')
    expect(read(repo, 'a.txt')).toBe('bar 1\nfoo 2 foo 3\n')
    await expect(fileRows()).toHaveCount(1)
    await expect(matchRows()).toHaveCount(2)
  })
})

test.describe('search', () => {
  test('view.search with text selected in the editor fills the query', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'identificador\n', 'b.txt': 'outro identificador aqui\n' })
    await open(launch, repo)
    await openFile('a.txt')
    await page
      .locator('.cm-line')
      .first()
      .dblclick({ position: { x: 8, y: 5 } })
    await sendCommand('view.search')
    await expect(queryInput()).toHaveValue('identificador')
    await expect(summary()).toHaveText('2 resultado(s) em 2 arquivo(s)')
  })

  test('F4 / Shift+F4 walk the matches, open the file and mark the active row', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'foo 1\nmeio\nfoo 2\nfoo 3\n' })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    await expect(matchRows()).toHaveCount(3)
    await expect(page.locator('.search-match.selected')).toHaveCount(0)

    await sendCommand('search.nextResult')
    await expect(matchRows().nth(0)).toHaveClass(/\bselected\b/)
    await expect(tab('a.txt')).toBeVisible()
    await sendCommand('search.nextResult')
    await expect(matchRows().nth(1)).toHaveClass(/\bselected\b/)
    await expect(page.locator('.search-match.selected')).toHaveCount(1)
    await sendCommand('search.previousResult')
    await expect(matchRows().nth(0)).toHaveClass(/\bselected\b/)
    // Wraps around: previous of the first = last.
    await sendCommand('search.previousResult')
    await expect(matchRows().nth(2)).toHaveClass(/\bselected\b/)
    await sendCommand('search.nextResult')
    await expect(matchRows().nth(0)).toHaveClass(/\bselected\b/)
  })

  test('results are keyboard navigable: arrows, ←/→ collapse and Enter opens the match', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo({ 'a.txt': 'foo 1\nfoo 2\n', 'b.txt': 'foo b\n' })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    const items = page.getByRole('tree', { name: 'Resultados da busca' }).getByRole('treeitem')
    await expect(items).toHaveCount(5)
    await expect(items.first()).toHaveAttribute('tabindex', '0')
    await expect(items.nth(1)).toHaveAttribute('tabindex', '-1')

    await items.first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('End')
    await expect(items.nth(4)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(items.first()).toBeFocused()

    await page.keyboard.press('ArrowLeft')
    await expect(items.first()).toHaveAttribute('aria-expanded', 'false')
    await expect(items).toHaveCount(3)
    await page.keyboard.press('ArrowRight')
    await expect(items.first()).toHaveAttribute('aria-expanded', 'true')
    await expect(items).toHaveCount(5)

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(tab('a.txt')).toBeVisible()
    await expect(matchRows().nth(1)).toHaveClass(/\bselected\b/)
  })

  test('the "files to include" field limits the results (*.ts)', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.ts': 'foo\n', 'b.js': 'foo\n', 'src/c.ts': 'foo\n', 'd.md': 'foo\n' })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    await expect(fileRows()).toHaveCount(4)

    await openFilters()
    await includeInput().fill('*.ts')
    await expect(summary()).toHaveText('2 resultado(s) em 2 arquivo(s)')
    await expect(fileRows()).toHaveCount(2)
    await expect(fileRow('a.ts')).toBeVisible()
    await expect(fileRow('c.ts')).toBeVisible()
  })

  test('search.exclude from .walph/settings.json and node_modules stay out of the results', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo({
      '.walph/settings.json': '{ "search.exclude": { "generated": true } }\n',
      'a.txt': 'foo\n',
      'generated/g.txt': 'foo gerado\n',
      'node_modules/n.txt': 'foo dependência\n'
    })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    await expect(summary()).toHaveText('1 resultado(s) em 1 arquivo(s)')
    await expect(fileRow('a.txt')).toBeVisible()
  })

  test('clearing results empties the query and the list', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'foo\nfoo\n' })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    await expect(fileRow('a.txt')).toBeVisible()
    await sendCommand('search.clearResults')
    await expect(queryInput()).toHaveValue('')
    await expect(fileRows()).toHaveCount(0)
  })

  test('collapse all / expand all hide and show the matches', async ({ launch, makeRepo }) => {
    const repo = makeRepo({ 'a.txt': 'foo\nfoo\n', 'b.txt': 'foo\n' })
    await open(launch, repo)
    await openSearch()
    await search('foo')
    await expect(matchRows()).toHaveCount(3)
    await sendCommand('search.collapseAll')
    await expect(matchRows()).toHaveCount(0)
    await expect(fileRows()).toHaveCount(2)
    await sendCommand('search.expandAll')
    await expect(matchRows()).toHaveCount(3)
  })

  test('typing fast leaves no orphan rg processes', async ({ launch, makeRepo }) => {
    test.skip(process.platform === 'win32', 'uses ps')
    const files: Record<string, string> = {}
    for (let i = 0; i < 400; i++) files[`d${i % 10}/f${i}.txt`] = `lorem ipsum dolor ${i}\n`
    const repo = makeRepo(files)
    await open(launch, repo)
    await openSearch()

    // One character every ~270 ms (just above the 250 ms debounce): each key starts a search and cancels the last.
    await queryInput().pressSequentially('lorem ipsum', { delay: 270 })
    await expect(summary()).toContainText(/resultado/)
    await expect(summary()).toHaveText('400 resultado(s) em 400 arquivo(s)')

    const pid = app!.process().pid!
    await expect.poll(() => rgDescendants(pid), { timeout: 5000 }).toEqual([])

    // Leaving with the search in progress also leaves no rg behind.
    await queryInput().fill('dolor')
    await queryInput().fill('')
    await expect.poll(() => rgDescendants(pid), { timeout: 5000 }).toEqual([])
    expect(existsSync(repo)).toBe(true)
  })
})
