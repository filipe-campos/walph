import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { exitApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand } from './helpers'

let tmpBase: string
let app: ElectronApplication
let page: Page

const README = [
  '# Titulo do README',
  '',
  'Texto com [outro](outro.md) e [site](https://exemplo.com).',
  '',
  '<script>window.__xss = 1</script>',
  '<img src="x" onerror="window.__xss = 2">',
  '',
  '```ts',
  'const a = 1',
  '```',
  ''
].join('\n')

const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const groups = (): Locator => page.locator('.editor-group')
const group = (i: number): Locator => groups().nth(i)
const content = (i: number): Locator => group(i).locator('.cm-content')
const tab = (i: number, name: string): Locator =>
  group(i)
    .locator('.tab-bar .tab')
    .filter({ has: page.locator('.tab-label', { hasText: name }) })

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  const repo = makeRepo(tmpBase, 'projeto', {
    'a.txt': 'alfa\nbeta\n',
    'b.txt': 'segundo arquivo\n',
    'README.md': README
  })
  writeFileSync(join(repo, 'outro.md'), '# Outro\n')
  writeFileSync(join(repo, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022' } }))
  writeFileSync(join(repo, 'lsp.ts'), 'export const alpha: number = 1\n')
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repo] }))
  await expect(treeRow('a.txt')).toBeVisible()
})

test.afterAll(async () => {
  await exitApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test.describe('split editor', () => {
  test('splitting shows the file on both sides; typing on one side shows on the other and undo applies to both', async () => {
    await treeRow('a.txt').dblclick()
    await expect(groups()).toHaveCount(1)
    await sendCommand(app, page, 'editor.splitRight')
    await expect(groups()).toHaveCount(2)
    await expect(content(0)).toContainText('alfa')
    await expect(content(1)).toContainText('alfa')
    await expect(group(1)).toHaveClass(/\bactive\b/)

    // Focus went to the right group: typing goes into it and is mirrored on the left.
    await content(1).click()
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.type('XY')
    await expect(content(0)).toContainText('XYalfa')
    await expect(content(1)).toContainText('XYalfa')
    // A single dirty state, a single document.
    await expect(tab(0, 'a.txt')).toHaveClass(/\bdirty\b/)

    await page.keyboard.press('ControlOrMeta+z')
    await expect(content(0)).not.toContainText('XYalfa')
    await expect(content(1)).not.toContainText('XYalfa')
    await expect(content(0)).toContainText('alfa')
  })

  test('typing on the left also reaches the right', async () => {
    await content(0).click()
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.type('Q')
    await expect(content(1)).toContainText('Qalfa')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(content(1)).not.toContainText('Qalfa')
  })

  test('opening a file goes to the active group and each group has its own tabs', async () => {
    await treeRow('b.txt').dblclick()
    await expect(tab(0, 'b.txt')).toHaveCount(1)
    await expect(tab(1, 'b.txt')).toHaveCount(0)
    await expect(content(0)).toContainText('segundo arquivo')
    await expect(content(1)).toContainText('alfa')
  })

  test('closing the last tab of a group closes the group', async () => {
    await tab(1, 'a.txt').hover()
    await tab(1, 'a.txt').locator('.tab-close').click()
    await expect(groups()).toHaveCount(1)
    await expect(tab(0, 'a.txt')).toHaveCount(1)
    await expect(tab(0, 'b.txt')).toHaveCount(1)
  })

  test('dragging a tab to the other group and closing the group', async () => {
    await sendCommand(app, page, 'editor.splitRight')
    await expect(groups()).toHaveCount(2)
    // Copy of the active tab (b.txt) on the right; drags a.txt from the left over there.
    await tab(0, 'a.txt').dragTo(group(1).locator('.tab-bar'))
    await expect(tab(1, 'a.txt')).toHaveCount(1)
    await expect(tab(0, 'a.txt')).toHaveCount(0)

    await sendCommand(app, page, 'editor.closeGroup')
    await expect(groups()).toHaveCount(1)
  })
})

test.describe('Markdown preview', () => {
  test('opens to the side, follows the buffer, sanitizes and follows links', async () => {
    await treeRow('README.md').dblclick()
    await sendCommand(app, page, 'editor.markdownPreview')
    await expect(groups()).toHaveCount(2)
    const preview = page.locator('.markdown-preview')
    await expect(preview.locator('h1')).toHaveText('Titulo do README')
    await expect(tab(1, 'Preview README.md')).toHaveCount(1)
    // Untrusted HTML: no script, no iframe, no handler.
    await expect(preview.locator('script, iframe')).toHaveCount(0)
    expect(await page.evaluate(() => (globalThis as unknown as { __xss?: number }).__xss)).toBeUndefined()
    await expect(preview.locator('pre code span').first()).toBeVisible()

    // Focus stays on the file: typing updates the preview (without saving).
    await content(0).click()
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.type('NOVO ')
    // The text goes before the `#`: the heading is no longer a heading, but the preview shows the buffer.
    await expect(preview).toContainText('NOVO # Titulo do README')

    // A second call only focuses the existing preview.
    await sendCommand(app, page, 'editor.markdownPreview')
    await expect(groups()).toHaveCount(2)
    await expect(tab(1, 'Preview README.md')).toHaveCount(1)
    await expect(group(1)).toHaveClass(/\bactive\b/)

    // A relative link opens the file in the editor (left group).
    await preview.getByText('outro', { exact: true }).click()
    await expect(tab(0, 'outro.md')).toHaveCount(1)
  })

  test('the session restores both groups', async () => {
    await expect(groups()).toHaveCount(2)
    // Closing the page writes the session synchronously; the restore reads the file.
    await page.reload()
    await expect(groups()).toHaveCount(2)
    await expect(tab(1, 'Preview README.md')).toHaveCount(1)
    await expect(page.locator('.markdown-preview h1')).toContainText('Titulo do README')
  })
})

test.describe('LSP in both groups', () => {
  test('diagnostics, completion and Go to Definition work in the split group', async () => {
    test.setTimeout(120_000)
    // Starts from a single group: closes the preview the previous tests left open.
    await tab(1, 'Preview README.md').hover()
    await tab(1, 'Preview README.md').locator('.tab-close').click()
    await expect(groups()).toHaveCount(1)
    await treeRow('lsp.ts').dblclick()
    await expect(page.locator('.status-bar button[title^="TypeScript"]')).toHaveAttribute('title', /pronto/, {
      timeout: 60_000
    })
    await sendCommand(app, page, 'editor.splitRight')
    await expect(groups()).toHaveCount(2)

    // Types in the right group (the mirror copy): the error shows underlined on both sides.
    await content(1).click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.insertText("const bad: number = 'a'\n")
    await expect(group(0).locator('.cm-lintRange-error').first()).toBeVisible({ timeout: 20_000 })
    await expect(group(1).locator('.cm-lintRange-error').first()).toBeVisible()

    // Completion in the mirror.
    await page.keyboard.insertText('alpha.toF')
    await page.keyboard.press('Control+Space')
    await expect(group(1).locator('.cm-tooltip-autocomplete')).toContainText('toFixed', { timeout: 15_000 })
    await page.keyboard.press('Escape')

    // F12 from the right group jumps to the declaration (line 1).
    await page.keyboard.insertText('\nconst z = alpha')
    await sendCommand(app, page, 'editor.goToDefinition')
    await expect(page.locator('.status-bar')).toContainText(/Ln 1,/, { timeout: 15_000 })
  })
})

test.describe('group grid', () => {
  test('splitting right and down stacks the groups, mirrors the edit and comes back with the session', async () => {
    await sendCommand(app, page, 'editor.joinAllGroups')
    await expect(groups()).toHaveCount(1)
    await treeRow('a.txt').dblclick()
    await sendCommand(app, page, 'editor.splitRight')
    await sendCommand(app, page, 'editor.splitDown')
    await expect(groups()).toHaveCount(3)
    await expect(group(2)).toHaveClass(/\bactive\b/)

    // The 2nd and the 3rd share the right column: same left, the 3rd below the 2nd.
    const [left, top, bottom] = await Promise.all([0, 1, 2].map((i) => group(i).boundingBox()))
    expect(top!.x).toBeGreaterThan(left!.x)
    expect(Math.abs(bottom!.x - top!.x)).toBeLessThan(2)
    expect(bottom!.y).toBeGreaterThan(top!.y)

    // Three views of the same tab: typing in the bottom one reaches the other two and undo applies to all.
    await content(2).click()
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.type('ZZ')
    for (const i of [0, 1]) await expect(content(i)).toContainText('ZZalfa')
    await page.keyboard.press('ControlOrMeta+z')
    for (const i of [0, 1, 2]) await expect(content(i)).not.toContainText('ZZalfa')

    await sendCommand(app, page, 'editor.focusAboveGroup')
    await expect(group(1)).toHaveClass(/\bactive\b/)

    await page.reload()
    await expect(groups()).toHaveCount(3)
    const restored = await Promise.all([1, 2].map((i) => group(i).boundingBox()))
    expect(restored[1]!.y).toBeGreaterThan(restored[0]!.y)
  })

  test('comparing the active file with the saved one opens the diff, which follows the buffer and swaps sides', async () => {
    await sendCommand(app, page, 'editor.joinAllGroups')
    await expect(groups()).toHaveCount(1)
    await treeRow('b.txt').dblclick()
    await content(0).click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('nao salvo')
    await sendCommand(app, page, 'editor.compareWithSaved')
    const diff = page.locator('.diff-editor')
    await expect(diff.locator('.diff-header')).toContainText('b.txt (salvo) ↔ b.txt')
    await expect(diff.locator('.cm-merge-b')).toContainText('nao salvo')
    await expect(diff.locator('.cm-merge-a')).not.toContainText('nao salvo')

    await diff.getByRole('button', { name: 'Inverter os Lados da Comparação' }).click()
    await expect(diff.locator('.diff-header')).toContainText('b.txt ↔ b.txt (salvo)')
    await expect(diff.locator('.cm-merge-a')).toContainText('nao salvo')
  })
})
