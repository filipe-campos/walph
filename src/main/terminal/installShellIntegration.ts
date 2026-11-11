import { app } from 'electron'
import { join } from 'node:path'
import { writeFileAtomic } from '../fs/atomicWrite'
import { createLog } from '../log'
import { shellIntegrationFiles } from './shellIntegration'

const log = createLog('shellIntegration')

let installed: Promise<string | null> | null = null

/**
 * Writes the scripts once per process (the content changes between versions); `null` on failure: the shell opens
 * without them.
 */
export function installShellIntegration(): Promise<string | null> {
  installed ??= (async () => {
    const dir = join(app.getPath('userData'), 'shell-integration')
    try {
      await Promise.all(
        Object.entries(shellIntegrationFiles()).map(([rel, content]) =>
          writeFileAtomic(join(dir, rel), content, { mkdirp: true })
        )
      )
      return dir
    } catch (err) {
      log.warn('failed to write shell integration scripts', err)
      return null
    }
  })()
  return installed
}
