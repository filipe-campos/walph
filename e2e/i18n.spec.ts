import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { sendCommand } from './helpers'

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

const FILES = { 'a.txt': 'a\n' }

const htmlLang = (page: Page): Promise<string> =>
  page.evaluate(
    () => (globalThis as unknown as { document: { documentElement: { lang: string } } }).document.documentElement.lang
  )

const menuLabels = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(({ Menu }) => (Menu.getApplicationMenu()?.items ?? []).map((item) => item.label))

const activityItem = (page: Page, name: string) => page.locator('.activity-bar').getByRole('button', { name })

test.describe('interface language', () => {
  test('workbench.language "en" translates the interface, the native menu and the main errors', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo(FILES)
    const { app, page } = await launch({ folders: [repo], settings: { 'workbench.language': 'en' } })
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()

    await expect.poll(() => htmlLang(page)).toBe('en')
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Files')
    await expect(page.locator('.activity-bar')).toHaveAttribute('aria-label', 'Views')
    await expect(activityItem(page, 'Source Control')).toBeVisible()
    await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Help']))

    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(page.locator('.palette-item .palette-label', { hasText: /^View: Toggle Sidebar$/ })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.locator('.sidebar-title').getByRole('button', { name: 'New File', exact: true }).click()
    await page.locator('.tree-row.editing input').fill('a.txt')
    await page.keyboard.press('Enter')
    await expect(page.locator('.toast-error', { hasText: 'Already exists: a.txt' })).toBeVisible()
  })

  test('workbench.language "es" translates the interface, the native menu and the main errors', async ({
    launch,
    makeRepo
  }) => {
    const repo = makeRepo(FILES)
    const { app, page } = await launch({ folders: [repo], settings: { 'workbench.language': 'es' } })
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()

    await expect.poll(() => htmlLang(page)).toBe('es')
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Archivos')
    await expect(page.locator('.activity-bar')).toHaveAttribute('aria-label', 'Vistas')
    await expect(activityItem(page, 'Control de código fuente')).toBeVisible()
    await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining(['Archivo', 'Editar', 'Ver', 'Ayuda']))

    await sendCommand(app, page, 'workbench.showCommandPalette')
    await expect(
      page.locator('.palette-item .palette-label', { hasText: /^Ver: Alternar barra lateral$/ })
    ).toBeVisible()
    await page.keyboard.press('Escape')

    await page.locator('.sidebar-title').getByRole('button', { name: 'Nuevo archivo', exact: true }).click()
    await page.locator('.tree-row.editing input').fill('a.txt')
    await page.keyboard.press('Enter')
    await expect(page.locator('.toast-error', { hasText: 'Ya existe: a.txt' })).toBeVisible()
  })

  test('editing settings.json switches the language live; removing the key restores the system one', async ({
    launch,
    makeRepo,
    userDataDir
  }) => {
    const repo = makeRepo(FILES)
    const { app, page } = await launch({ folders: [repo] })
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Arquivos')
    await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining(['Arquivo', 'Editar']))
    await page.evaluate(() => {
      ;(globalThis as unknown as { __semRecarga: boolean }).__semRecarga = true
    })

    const settingsPath = join(userDataDir, 'settings.json')
    writeFileSync(settingsPath, JSON.stringify({ 'workbench.language': 'en' }))
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Files')
    await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining(['File', 'Edit']))

    writeFileSync(settingsPath, JSON.stringify({ 'workbench.language': 'es' }))
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Archivos')
    await expect.poll(() => htmlLang(page)).toBe('es')

    writeFileSync(settingsPath, '{}')
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Arquivos')
    await expect.poll(() => htmlLang(page)).toBe('pt-BR')
    await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining(['Arquivo', 'Editar']))
    expect(await page.evaluate(() => (globalThis as unknown as { __semRecarga?: boolean }).__semRecarga)).toBe(true)
  })

  test('the language picker of the settings modal writes settings.json and translates the interface', async ({
    launch,
    makeRepo,
    userDataDir
  }) => {
    const repo = makeRepo(FILES)
    const { app, page } = await launch({ folders: [repo] })
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()

    await sendCommand(app, page, 'workbench.openSettings')
    const modal = page.getByTestId('settings-modal')
    await expect(modal).toBeVisible()
    await modal.locator('[data-section="appearance"]').click()
    await page.getByTestId('setting-workbench.language').click()
    await page.getByRole('option', { name: 'English' }).click()

    await expect.poll(() => readText(join(userDataDir, 'settings.json'))).toContain('"workbench.language": "en"')
    await expect(page.locator('.activity-bar')).toHaveAttribute('aria-label', 'Views')
    await expect(modal.locator('[data-setting-key="workbench.language"]')).toContainText('Interface language')
  })

  test('"system" follows the system language', async ({ launch, makeRepo }) => {
    const repo = makeRepo(FILES)
    const { page } = await launch({
      folders: [repo],
      settings: { 'workbench.language': 'system' },
      env: { WALPH_LOCALE: 'es' }
    })

    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Archivos')
    await expect.poll(() => htmlLang(page)).toBe('es')
  })

  test('an invalid workbench.language value warns and falls back to the system language', async ({
    launch,
    makeRepo,
    userDataDir
  }) => {
    const repo = makeRepo(FILES)
    const { page } = await launch({ folders: [repo], settings: { 'workbench.language': 'en' } })
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Files')

    writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ 'workbench.language': 'klingon' }))

    await expect(page.locator('.toast-error', { hasText: 'workbench.language' })).toBeVisible()
    await expect(page.locator('.tree[role="tree"]')).toHaveAttribute('aria-label', 'Arquivos')
  })
})
