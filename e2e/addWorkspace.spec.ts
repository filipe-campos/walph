import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { expect, test as base } from './fixtures'

// "Abrir pasta como workspace" modal: recents filterable with ↑/↓/Enter and the native dialog in the footer (stubbed
// in main).

const test = base.extend<{
  launchWithRecents: () => Promise<{ app: ElectronApplication; page: Page; b: string; c: string }>
}>({
  launchWithRecents: async ({ launch, makeRepo, userDataDir }, use) => {
    await use(async () => {
      const a = makeRepo({ 'a.txt': 'a' }, 'proj-a')
      const b = makeRepo({ 'b.txt': 'b' }, 'proj-b')
      const c = makeRepo({ 'c.txt': 'c' }, 'proj-c')
      const now = Date.now()
      writeFileSync(
        join(userDataDir, 'recent.json'),
        JSON.stringify({
          folders: [
            { path: b, lastOpened: now, branch: null },
            { path: c, lastOpened: now - 1000, branch: null }
          ]
        })
      )
      const { app, page } = await launch({ folders: [a] })
      await expect(page.locator('.workspace-bar .workspace-tab')).toHaveCount(1)
      return { app, page, b, c }
    })
  }
})

test('the + opens the modal, filters, navigates with arrows and adds the workspace with Enter', async ({
  launchWithRecents
}) => {
  const { page } = await launchWithRecents()
  await page.locator('.workspace-add').click()
  const modal = page.getByTestId('add-workspace-modal')
  await expect(modal).toBeVisible()
  // The already open folder (proj-a) joins the recents once main writes the list (~200 ms after opening): wait for
  // the 3 so the order is deterministic (a, b, c) instead of depending on how fast the test clicks "+".
  await expect(modal.locator('li.recent-item')).toHaveCount(3)
  await expect(modal.locator('li.recent-item').first()).toContainText('proj-a')
  await expect(modal.locator('.add-workspace-input')).toBeFocused()

  await modal.locator('.add-workspace-input').fill('zzz')
  await expect(modal.locator('.add-workspace-empty')).toBeVisible()
  await modal.locator('.add-workspace-input').fill('proj')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(modal.locator('li.recent-item.highlighted')).toContainText('proj-c')
  await page.keyboard.press('Enter')

  await expect(modal).toHaveCount(0)
  await expect(page.locator('.workspace-bar .workspace-tab')).toHaveCount(2)
})

test('"Abrir Pasta…" calls the native dialog and closes the modal; Esc also closes it', async ({
  launchWithRecents
}) => {
  const { app, page, b } = await launchWithRecents()
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({
        canceled: false,
        filePaths: [picked]
      })
  }, b)
  await page.locator('.workspace-add').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('add-workspace-modal')).toHaveCount(0)

  await page.locator('.workspace-add').click()
  await page.locator('[data-action="add-workspace-browse"]').click()
  await expect(page.getByTestId('add-workspace-modal')).toHaveCount(0)
  await expect(page.locator('.workspace-bar .workspace-tab')).toHaveCount(2)
})
