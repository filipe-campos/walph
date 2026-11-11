// Path comparison, a single implementation for main and renderer. Strings only (no `node:path`, which the renderer
// lacks) and parameterized by platform, so the tests cover Windows/macOS/Linux on any OS.

export interface PathKeyOptions {
  /**
   * Does not ignore case even on Windows/macOS (e.g. paths already resolved with `realpath`, which have the real
   * spelling). Default: `false`.
   */
  caseSensitive?: boolean
  /** On macOS unifies the Unicode form (NFC/NFD), like APFS. Default: `true`. Only applies on `darwin`. */
  nfc?: boolean
  /**
   * `resolve` (absolute, no trailing slash) instead of `normalize` (lexical, keeps relative and trailing slash).
   * Default: `true`.
   */
  resolve?: boolean
}

export interface IsInsideOptions extends PathKeyOptions {
  /** Excludes the root itself (`isInside(r, r)` becomes `false`). Default: `false`. */
  strict?: boolean
  platform?: string
}

interface ParsedPath {
  /** `''` (relative), `/`, `C:` (drive-relative), `C:\`, `\` or `\\server\share\`. */
  root: string
  absolute: boolean
  segments: string[]
  trailing: boolean
}

interface Host {
  process?: { platform?: string; cwd?: () => string }
}

const host = (globalThis as unknown as Host).process
const hostPlatform = (): string => host?.platform ?? 'linux'
const isWin = (platform: string): boolean => platform === 'win32'

function hostCwd(): string | null {
  try {
    return host?.cwd?.() ?? null
  } catch {
    return null
  }
}

function foldSegments(parts: readonly string[], absolute: boolean): string[] {
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part !== '..') out.push(part)
    else if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
    else if (!absolute) out.push('..')
  }
  return out
}

function parse(path: string, platform: string): ParsedPath {
  if (!isWin(platform)) {
    const absolute = path.startsWith('/')
    const segments = foldSegments(path.split('/'), absolute)
    return { root: absolute ? '/' : '', absolute, segments, trailing: path.endsWith('/') }
  }
  const p = path.replace(/\//g, '\\')
  let root = ''
  let rest = p
  const unc = /^\\\\([^\\]+)\\+([^\\]+)(?:\\|$)/.exec(p)
  if (unc) {
    root = `\\\\${unc[1]}\\${unc[2]}\\`
    rest = p.slice(unc[0].length)
  } else if (/^[A-Za-z]:/.test(p)) {
    root = p[2] === '\\' ? p.slice(0, 3) : p.slice(0, 2)
    rest = p.slice(root.length)
  } else if (p.startsWith('\\')) {
    root = '\\'
    rest = p.slice(1)
  }
  const absolute = root.endsWith('\\')
  return { root, absolute, segments: foldSegments(rest.split('\\'), absolute), trailing: p.endsWith('\\') }
}

/** Makes it absolute with the process cwd, when there is one (the renderer has none: the path is only normalized). */
function resolveParsed(parsed: ParsedPath, platform: string): ParsedPath {
  const result = { ...parsed, trailing: false }
  if (parsed.absolute && parsed.root !== '\\') return result
  const cwd = hostCwd()
  if (cwd === null) return result
  const base = parse(cwd, platform)
  if (!base.absolute) return result
  if (parsed.absolute) return { ...result, root: base.root }
  return {
    ...result,
    root: base.root,
    absolute: true,
    segments: foldSegments([...base.segments, ...parsed.segments], true)
  }
}

function format(parsed: ParsedPath, platform: string): string {
  const sep = isWin(platform) ? '\\' : '/'
  const body = parsed.segments.join(sep)
  if (body === '') return parsed.absolute ? parsed.root : `${parsed.root}.${parsed.trailing ? sep : ''}`
  return parsed.root + body + (parsed.trailing ? sep : '')
}

/**
 * Comparison key of a path. By default: absolute, no trailing slash and, where the file system usually ignores case
 * (Windows and macOS, the APFS default), case-insensitive; on macOS it also unifies NFC/NFD.
 * The key of `session/sessionFile.ts` (session file name) comes from here: changing the default orphans saved sessions.
 */
export function pathKey(path: string, platform: string = hostPlatform(), options: PathKeyOptions = {}): string {
  const { caseSensitive = false, nfc = true, resolve = true } = options
  const parsed = parse(path, platform)
  let key = format(resolve ? resolveParsed(parsed, platform) : parsed, platform)
  if (nfc && platform === 'darwin') key = key.normalize('NFC')
  if (!caseSensitive && (isWin(platform) || platform === 'darwin')) key = key.toLowerCase()
  return key
}

export function samePath(
  a: string,
  b: string,
  platform: string = hostPlatform(),
  options: PathKeyOptions = {}
): boolean {
  return pathKey(a, platform, options) === pathKey(b, platform, options)
}

/**
 * Segments of `path` after `root`, in the spelling of `path`; `null` if it is outside (same options as `isInside`).
 * Cuts by segments, never by the length of `root`: NFC and case change the length, not the number of segments.
 */
export function pathTail(root: string, path: string, options: IsInsideOptions = {}): string[] | null {
  if (!isInside(root, path, options)) return null
  const platform = options.platform ?? hostPlatform()
  const segments = (p: string): string[] => {
    const parsed = parse(p, platform)
    return (options.resolve ? resolveParsed(parsed, platform) : parsed).segments
  }
  return segments(path).slice(segments(root).length)
}

/**
 * `true` if `path` is inside `root` (or is `root` itself, unless `strict`). The check is LEXICAL: it does not resolve
 * symlinks, so a link inside the folder that points outside counts as inside; whoever needs that passes paths already
 * resolved with `realpath`. Compares by segments (`/a/b` does not contain `/a/bc`) and rejects another drive on
 * Windows. Unlike `pathKey`, the default here is `resolve: false` (only normalizes).
 */
export function isInside(root: string, path: string, options: IsInsideOptions = {}): boolean {
  const { strict = false, platform = hostPlatform(), nfc = true, resolve = false, caseSensitive = false } = options
  const key = { nfc, resolve, caseSensitive }
  const a = parse(pathKey(root, platform, key), platform)
  const b = parse(pathKey(path, platform, key), platform)
  if (a.root !== b.root || a.segments.length > b.segments.length) return false
  if (!a.segments.every((segment, i) => segment === b.segments[i])) return false
  // Relative paths only keep `..` at the start: `../..` is not inside `..`.
  if (b.segments.slice(a.segments.length).includes('..')) return false
  return !strict || b.segments.length > a.segments.length
}

/**
 * Stable order, the same on every system: compares segment by segment (the separator never enters the comparison, so
 * `\` and `/` sort the same) and, within a segment, by code unit, without locale.
 */
export function comparePaths(a: string, b: string, platform: string = hostPlatform()): number {
  const sa = parse(a, platform).segments
  const sb = parse(b, platform).segments
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    const x = sa[i] ?? ''
    const y = sb[i] ?? ''
    if (x !== y) return x < y ? -1 : 1
  }
  return sa.length - sb.length
}
