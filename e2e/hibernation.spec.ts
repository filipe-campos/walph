import { expect, test } from './fixtures'
import { pageOfRoot, waitActivePage, waitPageOfRoot, type WalphGlobals } from './helpers'

// Hibernation: with `workspaces.maxLiveViews: 2`, activating the 3rd workspace unloads the least recent view (back
// to dormant, still in the bar) and reactivating it reloads the folder.

test('the live view limit hibernates the least recent one and reactivating reloads it', async ({
  launch,
  makeRepo
}) => {
  const roots = ['a', 'b', 'c'].map((n) => makeRepo({ [`${n}.txt`]: n }, `proj-${n}`))
  const { app } = await launch({ settings: { 'workspaces.maxLiveViews': 2 }, folders: [roots[0]] })
  const first = await waitPageOfRoot(app, roots[0])
  const add = (root: string): Promise<boolean> =>
    first.evaluate((r) => (globalThis as unknown as WalphGlobals).api.workspaces.add(r), root)
  await add(roots[1])
  await waitPageOfRoot(app, roots[1])
  await add(roots[2])
  await waitPageOfRoot(app, roots[2])

  // a (the oldest) hibernates; b and c stay alive.
  await expect.poll(async () => (await pageOfRoot(app, roots[0])) === null).toBe(true)
  expect(await pageOfRoot(app, roots[1])).not.toBeNull()
  const active = await waitActivePage(app)
  await expect(active.locator('.workspace-bar .workspace-tab')).toHaveCount(3)
  await expect(active.locator('.workspace-bar .workspace-tab[data-status="dormant"]')).toHaveCount(1)

  // Reactivating the hibernated one reloads the folder (and hibernates the next least recent).
  await active.locator('.workspace-bar .workspace-tab[data-status="dormant"]').click()
  await waitPageOfRoot(app, roots[0])
  await expect.poll(async () => (await pageOfRoot(app, roots[1])) === null).toBe(true)
})
