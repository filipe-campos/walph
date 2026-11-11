import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { closeApp, expect, launchWith, makeTmpDir, removeDir, test } from './fixtures'
import { makeRepo, sendCommand } from './helpers'

let tmpBase: string
let app: ElectronApplication
let page: Page

const palette = (): ReturnType<Page['locator']> => page.locator('.palette')
const input = (): ReturnType<Page['locator']> => page.getByRole('combobox', { name: 'Paleta de comandos' })
const option = (name: string | RegExp): ReturnType<Page['locator']> => page.getByRole('option', { name })

test.beforeAll(async () => {
  tmpBase = makeTmpDir()
  const repoDir = makeRepo(tmpBase, 'projeto-paleta', { 'README.md': '# Paleta\n' })
  ;({ app, page } = await launchWith(tmpBase, join(tmpBase, 'userdata'), { folders: [repoDir] }))
  await expect(page.locator('.tree .tree-row .tree-label', { hasText: /^README\.md$/ })).toBeVisible()
})

test.afterAll(async () => {
  await closeApp(app)
  removeDir(tmpBase)
})

test.describe('command palette', () => {
  test('lists the Arquivo and Exibir commands with an empty query', async () => {
    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(palette()).toBeVisible()
    const nomes = [
      'Arquivo: Abrir Pasta neste Workspace…',
      'Arquivo: Abrir Pasta como Workspace…',
      'Arquivo: Fechar Workspace',
      'Arquivo: Salvar',
      'Arquivo: Fechar Aba',
      process.platform === 'darwin' ? 'Arquivo: Fechar Janela' : 'Arquivo: Sair',
      'Exibir: Paleta de Comandos…',
      'Exibir: Mostrar Explorador',
      'Exibir: Mostrar Busca',
      'Exibir: Mostrar Controle de Código (Git)',
      'Exibir: Alternar Barra Lateral',
      'Exibir: Zoom Padrão',
      'Exibir: Aumentar Zoom',
      'Exibir: Diminuir Zoom',
      'Exibir: Tela Cheia'
    ]
    for (const nome of nomes) {
      // Exact text: "Arquivo: Salvar" is also a prefix of "Arquivo: Salvar Todos".
      const exato = new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      await expect(page.locator('.palette-item .palette-label', { hasText: exato }), nome).toHaveCount(1)
    }
    await page.keyboard.press('Escape')
    await expect(palette()).toHaveCount(0)
  })

  test('opens with the field focused, filters by "term" and runs with Enter', async () => {
    await expect(page.locator('.panel-container')).toBeHidden()
    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(input()).toBeFocused()

    await input().fill('>term')
    const alvo = option(/Terminal: Alternar Terminal/)
    await expect(alvo).toBeVisible()
    await expect(alvo.locator('kbd.palette-kbd')).toHaveText(process.platform === 'darwin' ? '⌃`' : 'Ctrl+`')
    // The best result is first and already selected.
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('option').first()).toContainText('Terminal: Alternar Terminal')

    await page.keyboard.press('Enter')
    await expect(palette()).toHaveCount(0)
    await expect(page.locator('.panel-container')).toBeVisible()
  })

  test('shows the used command first when reopening with an empty query', async () => {
    await sendCommand(app, page, 'workbench.showCommandPalette')
    const primeiro = page.getByRole('option').first()
    await expect(primeiro).toContainText('Terminal: Alternar Terminal')
    await expect(primeiro).toContainText('usado recentemente')

    // Use another command: it becomes the first.
    await input().fill('>zoom padr')
    await page.keyboard.press('Enter')
    await expect(palette()).toHaveCount(0)

    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(page.getByRole('option').nth(0)).toContainText('Exibir: Zoom Padrão')
    await expect(page.getByRole('option').nth(1)).toContainText('Terminal: Alternar Terminal')
    await page.keyboard.press('Escape')
  })

  test('Esc closes the palette and returns focus to the editor', async () => {
    await page.locator('.tree .tree-row', { hasText: /^README\.md$/ }).click()
    const content = page.locator('.cm-editor .cm-content')
    await expect(content).toContainText('Paleta')
    await content.click()
    await expect(content).toBeFocused()

    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(input()).toBeFocused()
    await page.keyboard.press('Escape')

    await expect(palette()).toHaveCount(0)
    // activeElement inside .cm-editor
    await expect(page.locator('.cm-editor :focus')).toHaveCount(1)
  })

  test('closing with the palette shortcut (toggle) returns focus to the editor', async () => {
    const content = page.locator('.cm-editor .cm-content')
    await content.click()
    await expect(content).toBeFocused()

    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(input()).toBeFocused()
    await sendCommand(app, page, 'workbench.showCommandPalette')

    await expect(palette()).toHaveCount(0)
    await expect(page.locator('.cm-editor :focus')).toHaveCount(1)
  })

  test('Tab does not take focus out of the palette', async () => {
    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(input()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(input()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette()).toHaveCount(0)
  })

  test('clicking outside closes the palette', async () => {
    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(palette()).toBeVisible()
    await page.locator('.palette-backdrop').click({ position: { x: 2, y: 2 } })
    await expect(palette()).toHaveCount(0)
  })

  test('a query without results shows the empty message', async () => {
    await sendCommand(app, page, 'workbench.showCommandPalette')
    await input().fill('>zzzqqq')
    await expect(page.locator('.palette-empty')).toHaveText('Nenhum comando encontrado')
    await page.keyboard.press('Escape')
  })
})
