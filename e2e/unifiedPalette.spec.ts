import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, test as base } from './fixtures'
import { activePage, sendCommand, spyContexts, waitPageOfRoot, webContentsIdOf, type WalphGlobals } from './helpers'
// Unified palette (⌘K): Workspaces, Commands and Files + "Perguntar ao Claude". Menu shortcuts do not fire from
// synthetic keys: `app:command` goes through main. Shortcuts with `when` (before-input-event) get real keys.
// `page.keyboard` (CDP) does not go through main's `before-input-event`, which resolves the `when` shortcuts: the keys go
// through `webContents.sendInputEvent`, which does. The Claude SDK is the fake one (`WALPH_FAKE_CLAUDE`).

const isMac = process.platform === 'darwin'
const QUERY = 'corrigir o teste de login'

let repoA: string
let repoB: string
let app: ElectronApplication

const palette = (page: Page): Locator => page.locator('.palette[aria-label="Paleta unificada"]')
const input = (page: Page): Locator => page.locator('.palette-input')
const groups = (page: Page): Promise<(string | null)[]> =>
  page.locator('.palette-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))
const wsRow = (page: Page, name: string): Locator =>
  page.locator('.palette-item', { has: page.locator('.palette-file-name', { hasText: new RegExp(`^${name}$`) }) })
const claudeTabs = (page: Page): Locator => page.locator('.claude-tab[role=tab]')
const userTexts = (page: Page): Promise<string[]> =>
  page.locator('.claude-pane:not([hidden]) .claude-user-text').allTextContents()

/** Real key for the page view (goes through `before-input-event`, like a user keystroke). */
async function pressKey(page: Page, keyCode: string, modifiers: ('control' | 'meta' | 'shift')[]): Promise<void> {
  const id = await webContentsIdOf(app, page)
  await app.evaluate(
    ({ webContents }, { id: wcId, keyCode: key, modifiers: mods }) => {
      const wc = webContents.fromId(wcId)!
      for (const type of ['keyDown', 'keyUp'] as const) wc.sendInputEvent({ type, keyCode: key, modifiers: mods })
    },
    { id, keyCode, modifiers }
  )
}

/** Adds workspace B and waits for its view; returns both pages (A and B). */
async function twoWorkspaces(pageA: Page): Promise<Page> {
  await pageA.evaluate((r) => (globalThis as unknown as WalphGlobals).api.workspaces.add(r), repoB)
  return waitPageOfRoot(app, repoB)
}

const test = base.extend<{ launchPalette: (folders: string[]) => Promise<Page> }>({
  launchPalette: async ({ launch, makeRepo }, use) => {
    repoA = makeRepo({ 'alfa.txt': 'alfa\n' }, 'proj-a')
    repoB = makeRepo({ 'beta.txt': 'beta\n' }, 'proj-b')
    await use(async (folders) => {
      const launched = await launch({
        folders,
        settings: { 'terminal.gpuAcceleration': 'off' },
        claudeScript: { turns: [] }
      })
      app = launched.app
      const { page } = launched
      await expect(page.locator('.workspace-bar')).toBeVisible()
      await expect(page.locator('.tree .tree-row').first()).toBeVisible()
      return page
    })
  }
})

test.describe('unified palette', () => {
  test('lists Workspaces, Commands and Files in that order, with status and "atual"; Enter activates the other workspace', async ({
    launchPalette
  }) => {
    const pageA = await launchPalette([repoA])
    const pageB = await twoWorkspaces(pageA)
    await expect.poll(async () => activePage(app)).toBe(pageB)

    await sendCommand(app, pageB, 'workbench.showUnifiedPalette')
    await expect(palette(pageB)).toBeVisible()
    // A query that matches workspace, command and file ("proj" matches the workspaces; "a" the other two).
    await input(pageB).fill('a')
    await expect.poll(() => groups(pageB)).toEqual(['Workspaces', 'Comandos', 'Arquivos'])

    await input(pageB).fill('proj')
    const rowA = wsRow(pageB, 'proj-a')
    const rowB = wsRow(pageB, 'proj-b')
    await expect(rowA).toBeVisible()
    await expect(rowB).toBeVisible()
    // Claude status dot in place of the icon; the view's workspace is the "atual" one.
    await expect(rowB.locator('.palette-status .status-dot')).toHaveCount(1)
    await expect(rowB).toContainText('atual')
    await expect(rowA).not.toContainText('atual')
    await expect(rowA.locator('.palette-status .status-dot')).toHaveCount(1)

    // Enter on the other: activates A (the visible view becomes A's).
    await rowA.hover()
    await expect(rowA).toHaveClass(/selected/)
    await pageB.keyboard.press('Enter')
    await expect.poll(async () => activePage(app)).toBe(pageA)
    await expect(pageA.locator('.workspace-tab.active .workspace-tab-name')).toHaveText('proj-a')
  })

  test('"Perguntar ao Claude" opens a new session with the query as the first message', async ({ launchPalette }) => {
    const page = await launchPalette([repoA])
    // A session already exists: the question must create ANOTHER one.
    await sendCommand(app, page, 'claude.focus')
    await expect(claudeTabs(page)).toHaveCount(1)

    await sendCommand(app, page, 'workbench.showUnifiedPalette')
    await input(page).fill(QUERY)
    const ask = page.locator('.palette-item.palette-ask')
    await expect(ask).toHaveCount(1)
    await expect(ask).toHaveText(`Perguntar ao Claude: “${QUERY}”`)
    // It is the last row of the list.
    expect(await page.locator('.palette-item').last().getAttribute('class')).toContain('palette-ask')

    await page.keyboard.press('ArrowUp') // from the first row it wraps to the last
    await expect(ask).toHaveClass(/selected/)
    await page.keyboard.press('Enter')
    await expect(palette(page)).toHaveCount(0)

    await expect(page.locator('aside.claude-sidebar')).toBeVisible()
    await expect(claudeTabs(page)).toHaveCount(2)
    await expect.poll(() => userTexts(page)).toEqual([QUERY])
  })

  test('the ">" prefix switches to the command palette and deleting it returns to the unified one', async ({
    launchPalette
  }) => {
    const page = await launchPalette([repoA])
    await sendCommand(app, page, 'workbench.showUnifiedPalette')
    await expect(palette(page)).toBeVisible()
    await input(page).fill('zoom')
    await expect.poll(() => groups(page)).toContain('Comandos')
    await input(page).fill('')

    await input(page).fill('>')
    await expect(page.locator('.palette[aria-label="Paleta de comandos"]')).toBeVisible()
    await expect(palette(page)).toHaveCount(0)
    await expect(page.locator('.palette-group')).toHaveCount(0)
    await expect(page.locator('.palette-ask')).toHaveCount(0)

    await input(page).fill('')
    await expect(palette(page)).toBeVisible()
    await expect(page.locator('.palette[aria-label="Paleta de comandos"]')).toHaveCount(0)

    // Also with text after the prefix: ">zoom" filters commands; deleting everything returns.
    await input(page).fill('>zoom')
    await expect(page.locator('.palette[aria-label="Paleta de comandos"]')).toBeVisible()
    await input(page).fill('')
    await expect(palette(page)).toBeVisible()
  })

  test('workspace items and "Perguntar ao Claude" do not go into the commands "usado recentemente"', async ({
    launchPalette
  }) => {
    const pageA = await launchPalette([repoA])
    const pageB = await twoWorkspaces(pageA)
    await expect.poll(async () => activePage(app)).toBe(pageB)

    // 1) Activates a workspace through the palette.
    await sendCommand(app, pageB, 'workbench.showUnifiedPalette')
    await input(pageB).fill('proj-a')
    await wsRow(pageB, 'proj-a').click()
    await expect.poll(async () => activePage(app)).toBe(pageA)

    // 2) Asks Claude.
    await sendCommand(app, pageA, 'workbench.showUnifiedPalette')
    await input(pageA).fill(QUERY)
    await pageA.locator('.palette-item.palette-ask').click()
    await expect.poll(() => userTexts(pageA)).toEqual([QUERY])

    // 3) The ">" palette has no "usado recentemente" (neither the two overlay commands nor the items above).
    await sendCommand(app, pageA, 'workbench.showCommandPalette')
    await expect(pageA.locator('.palette[aria-label="Paleta de comandos"]')).toBeVisible()
    await expect(pageA.locator('.palette-item').first()).toBeVisible()
    await expect(pageA.locator('.palette-recent')).toHaveCount(0)
    await expect(pageA.locator('.palette-item', { hasText: /Perguntar ao Claude|proj-a|proj-b/ })).toHaveCount(0)
    await pageA.keyboard.press('Escape')

    // Control: a regular command run from the palette becomes "usado recentemente" (the test sees the recent one).
    await sendCommand(app, pageA, 'workbench.showCommandPalette')
    await input(pageA).fill('>zoom padr')
    await pageA.keyboard.press('Enter')
    await sendCommand(app, pageA, 'workbench.showCommandPalette')
    await expect(pageA.locator('.palette-recent')).toHaveCount(1)
    await expect(pageA.locator('.palette-item').first()).toContainText('Zoom Padrão')
  })
})

test.describe('shortcuts with `when` (real keys)', () => {
  test('with focus on the Claude panel, Ctrl+Tab switches session and ⌘/Ctrl+W closes the session, not the editor tab', async ({
    launchPalette
  }) => {
    const page = await launchPalette([repoA])
    const waitContext = await spyContexts(app)
    await page.locator('.tree .tree-row', { hasText: /^alfa\.txt$/ }).dblclick()
    await expect(page.locator('.tab-bar .tab .tab-label')).toHaveText(['alfa.txt'])

    await sendCommand(app, page, 'claude.focus')
    await expect(claudeTabs(page)).toHaveCount(1)
    await sendCommand(app, page, 'claude.newConversation')
    await expect(claudeTabs(page)).toHaveCount(2)
    await expect(claudeTabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')

    // The `claudeFocus` context reaches main over IPC when focus changes (switching session returns focus to the field):
    // a human never presses the key before that, the synthetic key does.
    const claudeFocused = async (): Promise<void> => {
      await expect(page.locator('.claude-input:visible')).toBeFocused()
      await waitContext('claudeFocus', true)
    }
    await page.locator('.claude-input:visible').click()
    await claudeFocused()
    await pressKey(page, 'Tab', ['control'])
    await expect(claudeTabs(page).nth(0)).toHaveAttribute('aria-selected', 'true')
    await claudeFocused()
    await pressKey(page, 'Tab', ['control', 'shift'])
    await expect(claudeTabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')
    await claudeFocused()
    await pressKey(page, 'W', [isMac ? 'meta' : 'control'])
    await expect(claudeTabs(page)).toHaveCount(1)
    // The editor tab stays open.
    await expect(page.locator('.tab-bar .tab .tab-label')).toHaveText(['alfa.txt'])
  })

  test('with focus on the terminal, the split shortcut still splits', async ({ launchPalette }) => {
    const page = await launchPalette([repoA])
    await sendCommand(app, page, 'terminal.toggle')
    await expect(page.locator('.xterm')).toHaveCount(1)
    await expect
      .poll(async () => (await page.locator('.xterm-rows').first().innerText()).trim().length)
      .toBeGreaterThan(0)
    await page.locator('.xterm').first().click()

    if (isMac) await pressKey(page, '\\', ['meta'])
    else await pressKey(page, '5', ['control', 'shift'])
    await expect(page.locator('.xterm')).toHaveCount(2)
  })
})
