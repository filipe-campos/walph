import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { sendCommand, type WalphGlobals } from './helpers'

const lines = Array.from({ length: 300 }, (_, i) => `const value${i + 1} = ${i + 1}`).join('\n') + '\n'

async function open(page: Page): Promise<void> {
  await expect(page.locator('.tree .tree-row').first()).toBeVisible()
  await page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: /^a\.ts$/ }) }).dblclick()
  await expect(page.locator('.cm-content')).toBeVisible()
}

/** Painted pixels (alpha > 0) of the canvas. */
interface CanvasLike {
  width: number
  height: number
  getContext(id: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }
}
const painted = (page: Page, selector: string): Promise<number> =>
  page.locator(selector).evaluate((el) => {
    const canvas = el as unknown as CanvasLike
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let n = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++
    return n
  })

test('the minimap shows up, draws the code and can be turned off by the setting', async ({ launch, makeRepo }) => {
  const { page } = await launch({ folders: [makeRepo({ 'a.ts': lines })] })
  await open(page)
  const minimap = page.locator('.cm-minimap')
  await expect(minimap).toBeVisible()
  await expect(page.locator('.cm-minimap-slider')).toBeVisible()
  await expect.poll(() => painted(page, '.cm-minimap-canvas')).toBeGreaterThan(100)

  await page.evaluate(() =>
    (globalThis as unknown as WalphGlobals).api.settings.setValue('user', 'editor.minimap', false)
  )
  await expect(minimap).toHaveCount(0)

  await page.evaluate(() =>
    (globalThis as unknown as WalphGlobals).api.settings.setValue('user', 'editor.minimap', true)
  )
  await expect(minimap).toBeVisible()
})

test('clicking the minimap scrolls the editor', async ({ launch, makeRepo }) => {
  const { page } = await launch({ folders: [makeRepo({ 'a.ts': lines })] })
  await open(page)
  const scroller = page.locator('.cm-scroller')
  await expect(page.locator('.cm-minimap')).toBeVisible()
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0)
  // The minimap only has the editor height after the first draw (rAF) with the final layout; clicking before that
  // (on Linux/Xvfb the layout settles more slowly) would hit a stale ~45 px rectangle.
  await expect
    .poll(async () => {
      const [mini, edit] = [await page.locator('.cm-minimap').boundingBox(), await scroller.boundingBox()]
      return mini && edit && edit.height > 300 && Math.abs(mini.height - edit.height) < 2
    })
    .toBe(true)
  await expect.poll(() => painted(page, '.cm-minimap-canvas')).toBeGreaterThan(100)
  const box = (await page.locator('.cm-minimap').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4)
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
})

test('the scrollbar ruler shows the git mark after editing', async ({ launch, makeRepo }) => {
  const { app, page } = await launch({ folders: [makeRepo({ 'a.ts': lines })] })
  await open(page)
  const ruler = page.locator('.cm-overview-ruler')
  await expect(ruler).toBeVisible()
  expect(await painted(page, '.cm-overview-ruler')).toBe(0)

  await sendCommand(app, page, 'editor.goToLine')
  await expect(page.getByRole('combobox')).toBeFocused()
  await page.keyboard.type('150')
  await page.keyboard.press('Enter')
  await page.locator('.cm-content').click()
  await page.keyboard.type('X')

  await expect(page.locator('.cm-git-gutter .cm-gutterElement.cm-git-modified').first()).toBeVisible()
  await expect.poll(() => painted(page, '.cm-overview-ruler')).toBeGreaterThan(0)
  // Git stripe in the minimap too.
  await expect.poll(() => painted(page, '.cm-minimap-canvas')).toBeGreaterThan(100)
})
