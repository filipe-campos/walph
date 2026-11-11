// Test-only helpers (real git and temporary folders with their real spelling). Do not import from product code.

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomicSync } from '../fs/atomicWrite'

let emptyConfig: string | null = null

/** Empty config file. `os.devNull` is `\\.\nul` on Windows and git cannot read that path. */
function emptyConfigFile(): string {
  if (emptyConfig) return emptyConfig
  const dir = mkdtempSync(join(tmpdir(), 'walph-gitcfg-'))
  const file = join(dir, 'config')
  writeFileAtomicSync(file, '')
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
  emptyConfig = file
  return file
}

/**
 * Variables that isolate git from `~/.gitconfig` and the system config (e.g. `commit.gpgsign` would ask for the key).
 */
export function isolatedGitConfigEnv(): Record<string, string> {
  return { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfigFile() }
}

/**
 * Temporary folder with its real spelling: `realpathSync.native` expands the Windows 8.3 name (`RUNNER~1`) that JS does
 * not.
 */
export function makeRealTempDir(prefix: string): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
}
