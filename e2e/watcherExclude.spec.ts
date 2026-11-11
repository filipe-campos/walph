import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { flushWatcher, requestOpen, type WalphGlobals } from './helpers'

// `files.watcherExclude` from `.walph/settings.json` applies to the tree watcher as soon as the folder opens: main
// binds the workspace layer before starting the watcher (it does not depend on the renderer asking for the settings
// later).

const exclude = (glob: string): string => JSON.stringify({ 'files.watcherExclude': { [glob]: true } })

/** Records the paths of the watcher batches in `globalThis.__changed`. */
async function recordChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as unknown as WalphGlobals & { __changed: string[] }
    g.__changed = []
    g.api.workspace.onChange((change) => g.__changed.push(...change.files.map((f) => f.path)))
  })
}

const treeLabel = (page: Page, name: string): Locator =>
  page.locator('.tree .tree-row .tree-label', { hasText: new RegExp(`^${name.replace('.', '\\.')}$`) })

const changed = (page: Page): Promise<string[]> =>
  page.evaluate(() => (globalThis as unknown as { __changed: string[] }).__changed.slice())

test('the workspace watcherExclude applies right after opening, without inheriting the previous one', async ({
  launch,
  makeRepo
}) => {
  const first = makeRepo(
    { 'a.txt': 'a\n', '.walph/settings.json': exclude('**/skipme'), 'skipme/.keep': '', 'ignoreme/.keep': '' },
    'primeira'
  )
  const second = makeRepo(
    { 'b.txt': 'b\n', '.walph/settings.json': exclude('**/ignoreme'), 'skipme/.keep': '', 'ignoreme/.keep': '' },
    'segunda'
  )
  const { app, page } = await launch({ folders: [first] })
  await expect(treeLabel(page, 'a.txt')).toBeVisible()
  await recordChanges(page)

  await requestOpen(app, page, second)
  await expect(treeLabel(page, 'b.txt')).toBeVisible()

  // Right after opening: what the new folder layer excludes is gone; what only the previous one excluded is seen.
  writeFileSync(join(second, 'ignoreme', 'y.txt'), 'y\n')
  writeFileSync(join(second, 'skipme', 'x.txt'), 'x\n')
  await flushWatcher(page, second)

  const seen = await changed(page)
  expect(seen).toContain(join(second, 'skipme', 'x.txt'))
  expect(seen).not.toContain(join(second, 'ignoreme', 'y.txt'))
})
