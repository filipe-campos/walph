import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { sendCommand, type WalphGlobals } from './helpers'

const filler = (n: number, label: string): string[] => Array.from({ length: n }, (_, i) => `${label} ${i + 1}`)
const guide = [
  '# Guide',
  '',
  '## Intro',
  '',
  ...filler(40, 'intro'),
  '',
  '## Usage',
  '',
  ...filler(150, 'usage'),
  ''
].join('\n')

async function open(page: Page): Promise<void> {
  await expect(page.locator('.tree .tree-row').first()).toBeVisible()
  await page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: /^guide\.md$/ }) }).dblclick()
  await expect(page.locator('.cm-content')).toBeVisible()
}

const setSetting = (page: Page, key: string, value: unknown): Promise<void> =>
  page.evaluate(
    ([k, v]) => (globalThis as unknown as WalphGlobals).api.settings.setValue('user', k as never, v as never),
    [key, value] as const
  )

test('Outline, breadcrumbs and sticky scroll follow the headings of a Markdown file without a server', async ({
  launch,
  makeRepo
}) => {
  test.setTimeout(120_000)
  const { app, page } = await launch({ folders: [makeRepo({ 'guide.md': guide, 'notes.txt': 'x\n' })] })
  await open(page)

  const crumbs = page.locator('.breadcrumbs .breadcrumb-item')
  await expect(crumbs.first()).toHaveText('guide.md')

  // The Outline comes from the Lezer tree: headings nested by level.
  const outline = page.locator('.outline-tree')
  await expect(outline.locator('.outline-row')).toHaveText(['Guide', 'Intro', 'Usage'])

  await outline.locator('.outline-row', { hasText: 'Usage' }).click()
  await expect(crumbs).toHaveText(['guide.md', 'Guide', 'Usage'])
  await expect(outline.locator('.outline-row.active')).toHaveText('Usage')

  // Scrolling into the section, the enclosing headings stick to the top.
  await page.locator('.cm-scroller').evaluate((el) => (el.scrollTop += 800))
  await expect(page.locator('.cm-sticky-text')).toHaveText(['# Guide', '## Usage'])

  await setSetting(page, 'editor.stickyScroll.enabled', false)
  await expect(page.locator('.cm-sticky-scroll')).toHaveCount(0)

  // Focusing the breadcrumbs opens the menu of the last segment (the sibling symbols); Esc goes back to the segment,
  // then to the text.
  await sendCommand(app, page, 'editor.focusBreadcrumbs')
  const menu = page.locator('.breadcrumb-menu')
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Intro', 'Usage'])
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(crumbs.last()).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(crumbs.nth(1)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.cm-content')).toBeFocused()

  // The menu of a file lists the siblings in the folder.
  await crumbs.first().click()
  await expect(menu.getByRole('menuitemradio')).toHaveText(['guide.md', 'notes.txt'])
  await page.keyboard.press('Escape')

  await setSetting(page, 'breadcrumbs.enabled', false)
  await expect(page.locator('.breadcrumbs')).toHaveCount(0)
})
