import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, test, type Launch } from './fixtures'
import { sendCommand, webContentsIdOf } from './helpers'

// Shortcuts of commands without a menu item go through main's `before-input-event`: `page.keyboard` (CDP) does not
// reach it, so the keys go through `webContents.sendInputEvent`. The commands delivered to the view are recorded in
// `__commands`.

const FILES = { 'a.txt': 'a\n' }

type Modifier = 'control' | 'alt' | 'shift' | 'meta'

async function spyCommands(app: ElectronApplication, page: Page): Promise<() => Promise<string[]>> {
  const id = await webContentsIdOf(app, page)
  await app.evaluate(({ webContents }, wcId) => {
    const wc = webContents.fromId(wcId)!
    const g = globalThis as unknown as { __commands: string[] }
    g.__commands = []
    const original = wc.send.bind(wc)
    wc.send = (channel: string, ...args: unknown[]) => {
      if (channel === 'app:command') g.__commands.push(String(args[0]))
      original(channel, ...args)
    }
  }, id)
  return () => app.evaluate(() => (globalThis as unknown as { __commands: string[] }).__commands)
}

async function pressKey(app: ElectronApplication, page: Page, keyCode: string, modifiers: Modifier[]): Promise<void> {
  const id = await webContentsIdOf(app, page)
  await app.evaluate(
    ({ webContents }, { id: wcId, keyCode: key, modifiers: mods }) => {
      const wc = webContents.fromId(wcId)!
      for (const type of ['keyDown', 'keyUp'] as const) wc.sendInputEvent({ type, keyCode: key, modifiers: mods })
    },
    { id, keyCode, modifiers }
  )
}

const writeKeybindings = (userDataDir: string, content: string): void =>
  writeFileSync(join(userDataDir, 'keybindings.json'), content)

const shortcutRow = (page: Page, command: string): Locator =>
  page.locator(`[data-testid="settings-shortcuts"] [data-command="${command}"]`)

async function openShortcuts(app: ElectronApplication, page: Page): Promise<void> {
  await sendCommand(app, page, 'workbench.openSettings')
  await page.getByTestId('settings-modal').locator('[data-section="shortcuts"]').click()
  await expect(page.getByTestId('settings-shortcuts')).toBeVisible()
}

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-modal')).toBeHidden()
}

/** First accelerator of the native menu item with this label (searches the submenus). */
const accelerator = (app: ElectronApplication, label: string): Promise<string | null> =>
  app.evaluate(({ Menu }, wanted) => {
    const find = (items: Electron.MenuItem[]): string | null => {
      for (const item of items) {
        if (item.label === wanted) return item.accelerator ? String(item.accelerator) : null
        const nested = item.submenu ? find(item.submenu.items) : null
        if (nested !== null) return nested
      }
      return null
    }
    return find(Menu.getApplicationMenu()?.items ?? [])
  }, label)

async function open(launch: Launch, repo: string): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launch({ folders: [repo] })
  await expect(launched.page.locator('.tree .tree-row').first()).toBeVisible()
  await expect(launched.page.locator('.status-bar button[title^="Mudar de branch…"]')).toBeVisible()
  return launched
}

test.describe('user keybindings.json', () => {
  test('a shortcut for a command without a menu, present at startup, runs the command', async ({
    launch,
    makeRepo,
    userDataDir
  }) => {
    const repo = makeRepo(FILES)
    writeKeybindings(userDataDir, '[\n  // history\n  { "key": "ctrl+alt+h", "command": "git.showHistory" }\n]\n')
    const { app, page } = await open(launch, repo)
    const commands = await spyCommands(app, page)
    await expect(page.locator('.commit-row')).toHaveCount(0)

    await pressKey(app, page, 'H', ['control', 'alt'])

    await expect.poll(commands).toEqual(['git.showHistory'])
    await expect(page.locator('.commit-row', { hasText: 'initial' })).toBeVisible()
  })

  test('editing the file applies at once: the shortcuts modal follows and the new key runs', async ({
    launch,
    makeRepo,
    userDataDir
  }) => {
    const repo = makeRepo(FILES)
    const { app, page } = await open(launch, repo)
    const commands = await spyCommands(app, page)
    const history = async (): Promise<number> => (await commands()).filter((c) => c === 'git.showHistory').length
    await openShortcuts(app, page)
    await expect(shortcutRow(page, 'git.showHistory')).toHaveCount(0)

    writeKeybindings(userDataDir, '[{ "key": "ctrl+alt+h", "command": "git.showHistory" }]')
    await expect(shortcutRow(page, 'git.showHistory').locator('kbd')).toHaveCount(1)
    await expect(shortcutRow(page, 'git.showHistory').locator('kbd')).toContainText('H')
    await closeModal(page)

    await pressKey(app, page, 'H', ['control', 'alt'])
    await expect.poll(history).toBe(1)

    writeKeybindings(userDataDir, '[{ "key": "ctrl+alt+j", "command": "git.showHistory" }]')
    await openShortcuts(app, page)
    await expect(shortcutRow(page, 'git.showHistory').locator('kbd')).toContainText('J')
    await closeModal(page)

    await pressKey(app, page, 'J', ['control', 'alt'])
    await expect.poll(history).toBe(2)
    // The old key no longer runs: the following J is the sentinel that H was already processed.
    await pressKey(app, page, 'H', ['control', 'alt'])
    await pressKey(app, page, 'J', ['control', 'alt'])
    await expect.poll(history).toBe(3)
    expect(await commands()).toEqual([
      'workbench.openSettings',
      'git.showHistory',
      'workbench.openSettings',
      'git.showHistory',
      'git.showHistory'
    ])
  })

  test('the same key on two commands goes to the last entry of the file', async ({ launch, makeRepo, userDataDir }) => {
    const repo = makeRepo(FILES)
    writeKeybindings(
      userDataDir,
      '[{ "key": "ctrl+alt+h", "command": "git.showHistory" }, { "key": "ctrl+alt+h", "command": "git.stashApply" }]'
    )
    const { app, page } = await open(launch, repo)
    const commands = await spyCommands(app, page)

    await pressKey(app, page, 'H', ['control', 'alt'])

    await expect.poll(commands).toEqual(['git.stashApply'])
    expect(await commands()).toEqual(['git.stashApply'])
  })

  test('a false "when" lets the key through; a true one runs', async ({ launch, makeRepo, userDataDir }) => {
    const repo = makeRepo(FILES)
    writeKeybindings(
      userDataDir,
      JSON.stringify([
        { key: 'ctrl+alt+h', command: 'git.showHistory', when: 'terminalFocus' },
        { key: 'ctrl+alt+j', command: 'view.search', when: '!terminalFocus' }
      ])
    )
    const { app, page } = await open(launch, repo)
    const commands = await spyCommands(app, page)

    await pressKey(app, page, 'H', ['control', 'alt'])
    await pressKey(app, page, 'J', ['control', 'alt'])

    await expect.poll(commands).toEqual(['view.search'])
    await expect(page.locator('.commit-row')).toHaveCount(0)
  })

  test('an invalid entry becomes a warning and the others still apply', async ({ launch, makeRepo, userDataDir }) => {
    const repo = makeRepo(FILES)
    writeKeybindings(
      userDataDir,
      JSON.stringify([
        { key: 'ctrl+alt+h', command: 'git.naoExiste' },
        { key: 'h', command: 'git.showHistory' },
        { key: 'ctrl+alt+j', command: 'git.showHistory' }
      ])
    )
    const { app, page } = await open(launch, repo)
    const commands = await spyCommands(app, page)

    const warnings = page.locator('.toast', { hasText: 'keybindings.json' })
    await expect(warnings.filter({ hasText: 'entrada 1: comando desconhecido "git.naoExiste"' })).toBeVisible()
    await expect(warnings.filter({ hasText: 'entrada 2' })).toContainText('precisa de Ctrl, Alt ou Cmd')

    await pressKey(app, page, 'J', ['control', 'alt'])
    await expect.poll(commands).toEqual(['git.showHistory'])
  })

  test('invalid JSON shows the error and keeps the shortcuts of the last valid version', async ({
    launch,
    makeRepo,
    userDataDir
  }) => {
    const repo = makeRepo(FILES)
    writeKeybindings(userDataDir, '[{ "key": "ctrl+alt+h", "command": "git.showHistory" }]')
    const { app, page } = await open(launch, repo)
    const commands = await spyCommands(app, page)

    writeKeybindings(userDataDir, '[{ "key": "ctrl+alt+h", "command": ')
    await expect(page.locator('.toast-error', { hasText: 'keybindings.json' })).toBeVisible()

    await pressKey(app, page, 'H', ['control', 'alt'])
    await expect.poll(commands).toEqual(['git.showHistory'])
  })

  test('in the native menu, changing and removing the shortcut of a command updates the accelerator', async ({
    launch,
    makeRepo,
    userDataDir
  }) => {
    const repo = makeRepo(FILES)
    const { app, page } = await open(launch, repo)
    const label = 'Alternar Barra Lateral'
    await expect.poll(() => accelerator(app, label)).toMatch(/B$/)
    const original = await accelerator(app, label)

    writeKeybindings(userDataDir, '[{ "key": "ctrl+alt+9", "command": "view.toggleSidebar" }]')
    await expect.poll(() => accelerator(app, label)).toBe('Ctrl+Alt+9')

    writeKeybindings(userDataDir, '[{ "key": "", "command": "-view.toggleSidebar" }]')
    await expect.poll(() => accelerator(app, label)).toBeNull()
    await openShortcuts(app, page)
    await expect(shortcutRow(page, 'view.toggleSidebar')).toHaveCount(0)
    await closeModal(page)

    writeKeybindings(userDataDir, '[]')
    await expect.poll(() => accelerator(app, label)).toBe(original)
  })
})
