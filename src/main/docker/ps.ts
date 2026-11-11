import type { WebContents } from 'electron'
import type { DockerContainer } from '@shared/types'
import { parsePs, type PsContainer } from './parsePs'
import { run, specFor } from './run'
import { createSharedCache } from './sharedCache'
import { viewOf } from './viewState'

/** How old the container list may be: the open screen wants it almost fresh; the badge (30 s) accepts more. */
export const PS_MAX_AGE_MS = 3_000
export const PS_BACKGROUND_MAX_AGE_MS = 25_000

// One `docker ps -a` per executable for all views: N workspaces with the badge on do not become N processes.
const psCache = createSharedCache<PsContainer[]>()

export function invalidatePs(): void {
  psCache.invalidate()
}

export async function fetchPs(sender: WebContents, maxAgeMs = PS_MAX_AGE_MS): Promise<PsContainer[]> {
  const spec = await specFor(sender)
  const ps = await psCache.get(spec.file, maxAgeMs, async () =>
    parsePs((await run(sender, ['ps', '-a', '--format', '{{json .}}'], { shared: true })).stdout)
  )
  // `resolveContainerRef` validates against this view's last `ps`, also when the result came from the cache.
  viewOf(sender).ps = ps
  return ps
}

export function publicContainer({ configFiles: _configFiles, ...container }: PsContainer): DockerContainer {
  return container
}
