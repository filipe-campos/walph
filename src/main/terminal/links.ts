import type { WebContents } from 'electron'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { getSenderRoot } from '../window/windows'
import { linkCandidates } from './linkCandidates'
import { expandHome, respellUnderRoot } from './linkPath'
import type { Terminal } from './registry'
import { shellCwd } from './shellCwd'

/** lsof//proc return real paths; tabs use the spelling of the window folder (macOS: /tmp ↔ /private/tmp). */
async function inWindowSpelling(path: string, root: string | null): Promise<string> {
  if (!root) return path
  const realRoot = await realpath(root).catch(() => root)
  return respellUnderRoot(path, realRoot, root)
}

const isFile = (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isFile(),
    () => false
  )

/** Existing file that a path clicked in the terminal points to, or `null`. */
export async function resolveLinkFile(sender: WebContents, t: Terminal, rawPath: string): Promise<string | null> {
  const root = getSenderRoot(sender)
  try {
    const expanded = expandHome(rawPath)
    const bases = isAbsolute(expanded) ? [] : [await shellCwd(t), ...(root ? [root] : []), t.initialCwd]
    for (const target of linkCandidates(expanded, bases)) {
      if (await isFile(target)) return await inWindowSpelling(target, root)
    }
    return null
  } catch {
    return null
  }
}

/** Current shell directory, uncached: requested right after an Enter (`cd`) and hover may have cached the old one. */
export async function currentCwd(sender: WebContents, t: Terminal): Promise<string> {
  return inWindowSpelling(await shellCwd(t, true), getSenderRoot(sender))
}
