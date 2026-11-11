import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, PLAIN_EDITOR_SETTINGS, removeDir, test } from './fixtures'
import { makeRepo, sendCommand as sendAppCommand } from './helpers'

let tmpBase: string
let repoDir: string
let app: ElectronApplication
let page: Page

const LIB =
  'export function computeTotal(a: number, b: number): number {\n  return a + b\n}\n\nexport const marker = 1\n'
const MAIN = "import { computeTotal } from './lib'\n\nconst total = computeTotal(1, 2)\nconsole.log(total)\n"
const OTHER = "import { computeTotal } from './lib'\n\nexport const other = computeTotal(3, 4)\n"
const SCRATCH = "const config = { host: 'x', port: 1 }\n"

// Native menu shortcuts do not fire from synthetic keys: send the command through main, like the menu does.
const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const tab = (name: string): Locator => page.locator('.tab-bar .tab', { hasText: name })
const serverButton = (): Locator => page.locator('.status-bar button[title^="TypeScript"]')
const editorText = (): Promise<string> => page.locator('.cm-content').innerText()
const lineOf = async (): Promise<number> => {
  const text = (await page.locator('.status-bar').innerText()).match(/Ln (\d+)/)
  return text ? Number(text[1]) : -1
}

async function openFile(name: string): Promise<void> {
  await treeRow(name).dblclick()
  await expect(tab(name)).toBeVisible()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(serverButton()).toHaveAttribute('title', /pronto/, { timeout: 60_000 })
}

/** Puts the cursor at (line, column), 1-based, using only the keyboard. */
async function placeCursor(line: number, column: number): Promise<void> {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+Home')
  for (let i = 1; i < line; i++) await page.keyboard.press('ArrowDown')
  for (let i = 1; i < column; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(lineOf).toBe(line)
}

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repoDir = makeRepo(tmpBase, 'projeto-lsp-features', {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler' }
    }),
    'lib.ts': LIB,
    'main.ts': MAIN,
    'other.ts': OTHER,
    'scratch.ts': SCRATCH
  })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), {
    folders: [repoDir],
    settings: PLAIN_EDITOR_SETTINGS
  }))
  await expect(treeRow('main.ts')).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

test.describe('LSP: completions', () => {
  test('object members show up and accepting inserts the chosen text', async () => {
    await openFile('scratch.ts')
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.insertText('config.')

    const list = page.locator('.cm-tooltip-autocomplete')
    await expect(list).toBeVisible({ timeout: 30_000 })
    await expect(list).toContainText('host')
    await expect(list).toContainText('port')

    // Filter by the prefix and accept with Enter.
    await page.keyboard.insertText('po')
    await expect(list).toContainText('port')
    await expect(list).not.toContainText('host')
    await page.keyboard.press('Enter')
    await expect(list).toHaveCount(0)

    await expect.poll(editorText).toContain('config.port')
    expect(await editorText()).not.toContain('config.poport')
    await sendCommand('editor.save')
    await expect(tab('scratch.ts')).not.toHaveClass(/dirty/)
    await expect
      .poll(() => readFileSync(join(repoDir, 'scratch.ts'), 'utf8'), { timeout: 10_000 })
      .toBe(SCRATCH + 'config.port')
  })
})

test.describe('LSP: navigation', () => {
  test('go to definition opens the source file at the right line and navigating back returns', async () => {
    await openFile('main.ts')
    // Line 3: `const total = computeTotal(1, 2)`; column 16 is inside `computeTotal`.
    await placeCursor(3, 16)
    await sendCommand('editor.goToDefinition')

    await expect(tab('lib.ts')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.cm-content')).toContainText('export const marker')
    // `export function computeTotal` is on line 1.
    await expect.poll(lineOf).toBe(1)

    await sendCommand('workbench.navigateBack')
    await expect(page.locator('.cm-content')).toContainText('console.log(total)')
    await expect.poll(lineOf).toBe(3)
  })

  test('go to references lists the usages in the References panel', async () => {
    await placeCursor(3, 16)
    await sendCommand('editor.goToReferences')
    const rows = page.locator('.references [data-row]')
    // Definition + import + usage in main.ts and other.ts: at least the two files grouped.
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(4)
    const text = await page.locator('.references').innerText()
    expect(text).toContain('main.ts')
    expect(text).toContain('lib.ts')
    expect(text).toContain('other.ts')
  })

  test('@ in Quick Open lists the document symbols', async () => {
    await openFile('lib.ts')
    await sendCommand('workbench.quickOpen')
    const input = page.locator('.palette-input')
    await expect(input).toBeVisible()
    await input.fill('@')
    const items = page.locator('.palette-item')
    await expect(items.filter({ hasText: 'computeTotal' })).toHaveCount(1, { timeout: 20_000 })
    await expect(items.filter({ hasText: 'marker' })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
  })
})

test.describe('LSP: rename', () => {
  test('renames the function in open tabs (dirty) and in a closed file (written to disk)', async () => {
    // lib.ts and main.ts stay open; other.ts was never opened. The rename starts from the imported usage in main.ts:
    // with `providePrefixAndSuffixTextForRename: false` tsserver renames the declaration and every usage, without a
    // local alias.
    await openFile('lib.ts')
    await expect(tab('other.ts')).toHaveCount(0)
    await openFile('main.ts')
    await placeCursor(3, 16)
    await sendCommand('editor.rename')
    const input = page.locator('.lsp-rename-input')
    await expect(input).toBeVisible({ timeout: 30_000 })
    await expect(input).toHaveValue('computeTotal')
    await input.fill('sumValues')
    await input.press('Enter')

    // The closed file is written directly.
    await expect
      .poll(() => readFileSync(join(repoDir, 'other.ts'), 'utf8'), { timeout: 30_000 })
      .toBe("import { sumValues } from './lib'\n\nexport const other = sumValues(3, 4)\n")
    await expect(tab('other.ts')).toHaveCount(0)

    // The open ones become dirty with the new text, and their disk content does not change until saved.
    await expect(tab('main.ts')).toHaveClass(/dirty/)
    await expect(tab('lib.ts')).toHaveClass(/dirty/)
    await expect.poll(editorText).toContain('const total = sumValues(1, 2)')
    expect(readFileSync(join(repoDir, 'main.ts'), 'utf8')).toBe(MAIN)
    expect(readFileSync(join(repoDir, 'lib.ts'), 'utf8')).toBe(LIB)

    expect(await editorText()).toContain("import { sumValues } from './lib'")
    expect(await editorText()).not.toContain('computeTotal')
    await treeRow('lib.ts').dblclick()
    await expect.poll(editorText).toContain('export function sumValues(a: number, b: number): number')

    // Saving writes the renamed text.
    await sendCommand('editor.save')
    await expect
      .poll(() => readFileSync(join(repoDir, 'lib.ts'), 'utf8'))
      .toBe(LIB.replace('computeTotal', 'sumValues'))
  })
})
