import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand as sendAppCommand } from './helpers'

let tmpBase: string
let repoDir: string
let app: ElectronApplication
let page: Page

function write(rel: string, content: string): void {
  const abs = join(repoDir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

// Native menu shortcuts do not fire from synthetic keys: send the command through main, like the menu does.
const sendCommand = (id: string): Promise<void> => sendAppCommand(app, page, id)

const overlay = (): ReturnType<Page['locator']> => page.locator('.palette')
const input = (): ReturnType<Page['locator']> => page.getByRole('combobox')
const options = (): ReturnType<Page['locator']> => page.getByRole('option')
const cursor = (): ReturnType<Page['locator']> => page.locator('.status-right .status-item', { hasText: /^Ln / })

async function openQuickOpen(): Promise<void> {
  await sendCommand('workbench.quickOpen')
  await expect(overlay()).toBeVisible()
  await expect(input()).toBeFocused()
}

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  repoDir = makeRepo(tmpBase, 'projeto-quick-open', {
    'src/main/index.ts': 'export const main = 1\n',
    'src/renderer/index.html': '<html></html>\n',
    'src/renderer/src/store.ts':
      Array.from({ length: 60 }, (_, i) => `export const linha${i + 1} = ${i + 1}`).join('\n') + '\n',
    '.gitignore': 'dist/\n',
    'dist/ignored.js': 'ignorado\n',
    '.env.example': 'A=1\n'
  })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repoDir] }))
  await expect(page.locator('.tree .tree-row .tree-label', { hasText: /^src$/ })).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe.configure({ mode: 'serial' })

test.describe('quick open', () => {
  test('"idx" ranks main index.ts and index.html, without ignored files', async () => {
    await openQuickOpen()
    await input().fill('idx')
    await expect(options().first()).toContainText('index.ts')
    await expect(options().first()).toContainText('src/main')
    await expect(options().nth(1)).toContainText('index.html')
    await expect(options().first()).toHaveAttribute('aria-selected', 'true')

    await input().fill('ignored')
    await expect(page.locator('.palette-empty')).toHaveText('Nenhum arquivo encontrado')
    await expect(page.getByRole('option', { name: /ignored\.js/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('finds hidden files', async () => {
    await openQuickOpen()
    await input().fill('env.exa')
    await expect(options().first()).toContainText('.env.example')
    await page.keyboard.press('Escape')
    await expect(overlay()).toHaveCount(0)
  })

  test('"store.ts:30" opens the file with the cursor on line 30', async () => {
    await openQuickOpen()
    await input().fill('store.ts:30')
    await expect(options().first()).toContainText('store.ts')
    await expect(options().first()).toContainText('linha 30')
    await page.keyboard.press('Enter')
    await expect(overlay()).toHaveCount(0)
    await expect(page.locator('.cm-content')).toContainText('linha30')
    await expect(cursor()).toHaveText('Ln 30, Col 1')
  })

  test('an empty query shows the open file first, marked as open', async () => {
    await openQuickOpen()
    await expect(options().first()).toContainText('store.ts')
    await expect(options().first()).toContainText('aberto')
    await page.keyboard.press('Escape')
  })

  test('the ">" prefix switches to commands', async () => {
    await openQuickOpen()
    await input().fill('>term')
    await expect(page.getByRole('option', { name: /Terminal: Alternar Terminal/ })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('editor.goToLine with ":12:3" moves the cursor to line 12 column 3', async () => {
    await sendCommand('editor.goToLine')
    await expect(overlay()).toBeVisible()
    await expect(input()).toHaveValue(':')
    await input().fill(':12:3')
    await expect(options().first()).toContainText('Ir para a linha 12, coluna 3')
    await page.keyboard.press('Enter')
    await expect(overlay()).toHaveCount(0)
    await expect(cursor()).toHaveText('Ln 12, Col 3')
  })

  test('a file created on disk shows up in Quick Open after the watcher', async () => {
    write('src/main/new-file-xyz.ts', 'export {}\n')
    await expect
      .poll(
        async () => {
          await sendCommand('workbench.quickOpen')
          await expect(overlay()).toBeVisible()
          await input().fill('new-file-xyz')
          const found = await page.getByRole('option', { name: /new-file-xyz\.ts/ }).count()
          await page.keyboard.press('Escape')
          await expect(overlay()).toHaveCount(0)
          return found
        },
        { timeout: 15_000 }
      )
      .toBe(1)
  })

  test('Esc closes Quick Open and returns focus to the editor', async () => {
    const content = page.locator('.cm-editor .cm-content')
    await content.click()
    await expect(content).toBeFocused()
    await openQuickOpen()
    await page.keyboard.press('Escape')
    await expect(overlay()).toHaveCount(0)
    await expect(page.locator('.cm-editor :focus')).toHaveCount(1)
  })
})
