import { readlink, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

export interface LinkFs {
  realpath(path: string): Promise<string>
  readlink(path: string): Promise<string>
}

const nodeFs: LinkFs = { realpath, readlink }

/**
 * If `path` is a symlink (dotfiles with stow/chezmoi), returns the absolute path of the real file; otherwise `null`.
 * A symlink in a folder ABOVE the file (`/tmp` → `/private/tmp`) does not count: only the file itself. A broken link
 * (target not existing yet) returns the `readlink` target, to watch its folder and detect when the file appears.
 */
export async function resolveLinkTarget(path: string, fs: LinkFs = nodeFs): Promise<string | null> {
  const absolute = resolve(path)
  try {
    const real = await fs.realpath(absolute)
    const dirReal = await fs.realpath(dirname(absolute))
    return real === join(dirReal, basename(absolute)) ? null : real
  } catch {
    // Missing file (or link): if it is a broken link, `readlink` shows where it points.
    try {
      return resolve(dirname(absolute), await fs.readlink(absolute))
    } catch {
      return null
    }
  }
}
