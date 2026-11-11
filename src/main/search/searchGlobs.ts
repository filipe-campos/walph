// Converts the "files to include/exclude" fields and `files.exclude`/`search.exclude` into ripgrep `--glob=`.
// In rg the LAST matching glob wins; that is why includes come before and excludes (with `!`) after.

/** `\` is only a separator on Windows; on POSIX it is a glob escape and cannot become `/`. */
function slashes(glob: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? glob.replaceAll('\\', '/') : glob
}

/** Splits the field by commas, without splitting inside `{a,b}`; trimmed and without empty items. */
export function splitGlobList(field: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of field) {
    if (char === '{') depth++
    else if (char === '}' && depth > 0) depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/**
 * One item of the user field becomes the rg globs that match the item and, if it is a folder, its content. `./x` or
 * `/x` anchors at the root; without `/` it applies at any level; with `/` in the middle it is relative to the root.
 */
export function expandUserGlob(item: string, platform: NodeJS.Platform = process.platform): string[] {
  let glob = slashes(item.trim(), platform)
  const anchored = glob.startsWith('./') || glob.startsWith('/')
  glob = glob
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (!glob) return []
  if (glob.endsWith('/**')) return [anchored ? `/${glob}` : glob]
  if (anchored) return [`/${glob}`, `/${glob}/**`]
  if (!glob.includes('/')) return [glob, `**/${glob}/**`]
  return [glob, `${glob}/**`]
}

/** `files.exclude`/`search.exclude` glob (VS Code semantics): relative to the root, `**\/x` at any level. */
export function expandSettingsGlob(glob: string, platform: NodeJS.Platform = process.platform): string | null {
  const clean = slashes(glob.trim(), platform)
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '')
  if (!clean) return null
  if (clean.startsWith('**/')) return clean
  return `/${clean.replace(/^\/+/, '')}`
}

export interface GlobInput {
  include?: string
  exclude?: string
  /** Active globs of `files.exclude` ∪ `search.exclude`. */
  settingsExcludes?: string[]
  platform?: NodeJS.Platform
}

/** `--glob=<g>` arguments in the right order (includes, settings excludes, user excludes). */
export function buildGlobArgs({
  include = '',
  exclude = '',
  settingsExcludes = [],
  platform = process.platform
}: GlobInput): string[] {
  const globs: string[] = []
  for (const item of splitGlobList(include)) globs.push(...expandUserGlob(item, platform))
  for (const g of settingsExcludes) {
    const expanded = expandSettingsGlob(g, platform)
    if (expanded) globs.push(`!${expanded}`)
  }
  for (const item of splitGlobList(exclude)) globs.push(...expandUserGlob(item, platform).map((g) => `!${g}`))
  return globs.map((g) => `--glob=${g}`)
}
