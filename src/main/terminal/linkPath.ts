import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { pathTail } from '@shared/pathCompare'

/**
 * Undoes the lsof escaping (`\xNN` per byte, `\\`, `\n`, `\t`, `\r`, `\b`, `\f`, `\v`, `\a`) and joins the bytes as
 * UTF-8. `null` if an invalid sequence is left or the result is not valid UTF-8. Control chars come out as `^X` without
 * a backslash, ambiguous with a literal `^`: they are kept as is (the link falls back to the other candidates).
 */
function decodeLsof(raw: string): string | null {
  const bytes: number[] = []
  const simple = new Map([
    ['n', 10],
    ['t', 9],
    ['r', 13],
    ['b', 8],
    ['f', 12],
    ['v', 11],
    ['a', 7],
    ['\\', 92]
  ])
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch !== '\\') {
      bytes.push(...Buffer.from(String.fromCodePoint(raw.codePointAt(i)!)))
      if (raw.codePointAt(i)! > 0xffff) i++
      continue
    }
    const next = raw[i + 1]
    if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 2, i + 4))) {
      bytes.push(parseInt(raw.slice(i + 2, i + 4), 16))
      i += 3
    } else {
      const code = next === undefined ? undefined : simple.get(next)
      if (code === undefined) return null
      bytes.push(code)
      i += 1
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return null
  }
}

/** Extracts the process directory from the output of `lsof -a -p <pid> -d cwd -Fn` (line `n<path>`, with escapes). */
export function parseLsofCwd(output: string): string | null {
  for (const line of output.split('\n')) {
    if (line.startsWith('n') && line.length > 1) return decodeLsof(line.slice(1).replace(/\r$/, ''))
  }
  return null
}

/** `~` and `~/x` become the home folder; `~user` is kept as is (relative, does not resolve). */
export function expandHome(path: string, home: string = homedir(), platform: string = process.platform): string {
  const sepChars = platform === 'win32' ? ['/', '\\'] : ['/']
  if (path === '~') return home
  if (path.startsWith('~') && sepChars.includes(path.charAt(1))) {
    return (platform === 'win32' ? win32 : posix).join(home, path.slice(2))
  }
  return path
}

/**
 * Rewrites `path` (REAL spelling, from lsof//proc or realpath) in the spelling of the window folder when it is inside
 * it (`/private/tmp/p/a.ts` → `/tmp/p/a.ts`). Outside the folder, returns the path as it came.
 */
export function respellUnderRoot(
  path: string,
  realRoot: string,
  root: string,
  platform: string = process.platform
): string {
  const tail = pathTail(realRoot, path, { platform, resolve: true })
  if (!tail) return path
  return (platform === 'win32' ? win32 : posix).join(root, ...tail)
}
