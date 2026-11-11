import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, test as base } from './fixtures'
import { sendCommand } from './helpers'

// Claude Code panel without talking to the real Claude: `claude.executable` points to a path that does not
// exist, so opening the panel (which tries to start a conversation) fails with a pt-BR notice, no network or cost.

let tmpBase: string
let repo: string
let count = 0
let app: ElectronApplication

const sidebar = (page: Page): Locator => page.locator('aside.claude-sidebar')
const handle = (page: Page): Locator => page.locator('.resizer-x:has(+ aside.claude-sidebar)')
const notices = (page: Page): Locator => page.locator('.toasts .toast-error')
const width = async (page: Page): Promise<number> => Math.round((await sidebar(page).boundingBox())!.width)

const test = base.extend<{ launchRepo: () => Promise<Page> }>({
  launchRepo: async ({ launch, tmp, makeRepo }, use) => {
    tmpBase = tmp
    // New folder and user-data-dir per test: the session stores the panel visibility and width, and windows.json
    // would reopen the folders of the previous tests.
    repo = makeRepo({ 'a.txt': 'a\n' }, `projeto-claude-${count++}`)
    await use(async () => {
      const launched = await launch({
        folders: [repo],
        settings: { 'claude.executable': join(tmpBase, 'nao-existe', 'claude'), 'terminal.gpuAcceleration': 'off' }
      })
      app = launched.app
      return launched.page
    })
  }
})

test.describe('Claude Code panel', () => {
  test.describe.configure({ mode: 'serial' })

  test('starts closed and claude.toggleSidebar opens and closes the secondary sidebar', async ({ launchRepo }) => {
    const page = await launchRepo()
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
    await expect(sidebar(page)).toBeHidden()
    await expect(handle(page)).toHaveCount(0)

    await sendCommand(app, page, 'claude.toggleSidebar')
    await expect(sidebar(page)).toBeVisible()
    await expect(sidebar(page).locator('.claude-panel')).toBeVisible()
    await expect(handle(page)).toBeVisible()

    await sendCommand(app, page, 'claude.toggleSidebar')
    await expect(sidebar(page)).toBeHidden()
    await expect(handle(page)).toHaveCount(0)
  })

  test('without the Claude executable, opening the panel shows a pt-BR notice and the app stays alive', async ({
    launchRepo
  }) => {
    const page = await launchRepo()
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
    await sendCommand(app, page, 'claude.toggleSidebar')

    await expect(notices(page).first()).toContainText('Claude:')
    await expect(notices(page).first()).toContainText('Executável do Claude Code não encontrado')
    // No conversation: the panel offers to open another one instead of breaking.
    await expect(sidebar(page).locator('.claude-empty')).toContainText('Nenhuma conversa aberta.')
    await expect(sidebar(page).locator('.claude-empty').getByRole('button', { name: 'Nova conversa' })).toBeVisible()

    // No unhandled errors in the renderer; the rest of the IDE keeps responding.
    await sendCommand(app, page, 'view.search')
    await expect(page.locator('.sidebar-slot:not([hidden])')).toBeVisible()
    expect(app.windows().length).toBe(1)
    // The sidebar view is saved in the session: restore the explorer for the next tests.
    await sendCommand(app, page, 'view.explorer')
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
  })

  test('claude.focus opens the panel and the Fechar painel button hides it', async ({ launchRepo }) => {
    const page = await launchRepo()
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
    await expect(sidebar(page)).toBeHidden()

    await sendCommand(app, page, 'claude.focus')
    await expect(sidebar(page)).toBeVisible()
    // "Fechar painel" lives in the ⋯ menu of the panel bar.
    await sidebar(page)
      .getByRole('button', { name: /^Mais ações da sessão/ })
      .click()
    await sidebar(page).getByRole('menuitem', { name: 'Fechar painel' }).click()
    await expect(sidebar(page)).toBeHidden()
  })

  test('the handle resizes the panel within the limits (300 to 900 px)', async ({ launchRepo }) => {
    const page = await launchRepo()
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
    await sendCommand(app, page, 'claude.toggleSidebar')
    await expect(sidebar(page)).toBeVisible()
    const initial = await width(page)
    expect(initial).toBeGreaterThanOrEqual(300)

    const box = (await handle(page).boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 120, y, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => width(page)).toBe(initial + 120)

    // Dragging too far to the right stops at the minimum.
    const box2 = (await handle(page).boundingBox())!
    const x2 = box2.x + box2.width / 2
    await page.mouse.move(x2, y)
    await page.mouse.down()
    await page.mouse.move(x2 + 2000, y, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => width(page)).toBe(300)
  })

  test('visibility and width come back when reopening the same folder', async ({ launchRepo }) => {
    let page = await launchRepo()
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
    await sendCommand(app, page, 'claude.toggleSidebar')
    await expect(sidebar(page)).toBeVisible()
    const initial = await width(page)
    const box = (await handle(page).boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 77, y, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => width(page)).toBe(initial + 77)
    await app.close()

    page = await launchRepo()
    await expect(sidebar(page)).toBeVisible()
    await expect.poll(() => width(page)).toBe(initial + 77)

    // Closed in the previous session = stays closed.
    await sendCommand(app, page, 'claude.toggleSidebar')
    await expect(sidebar(page)).toBeHidden()
    await app.close()
    page = await launchRepo()
    await expect(page.locator('.tree .tree-row').first()).toBeVisible()
    await expect(sidebar(page)).toBeHidden()
  })
})
