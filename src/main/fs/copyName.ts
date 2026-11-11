const COPY_SUFFIX = / copy(?: \d+)?$/

/**
 * First free name for a copy of `name`: "name copy.ext", "name copy 2.ext", "name copy 3.ext"… Folders and
 * hidden files (".env" → ".env copy") have no separate extension. Copying a copy does not chain suffixes.
 */
export function nextCopyName(name: string, isTaken: (candidate: string) => boolean, isDirectory = false): string {
  const dot = isDirectory ? -1 : name.lastIndexOf('.')
  const hasExt = dot > 0
  const stem = (hasExt ? name.slice(0, dot) : name).replace(COPY_SUFFIX, '')
  const ext = hasExt ? name.slice(dot) : ''
  for (let n = 1; ; n++) {
    const candidate = `${stem} copy${n === 1 ? '' : ` ${n}`}${ext}`
    if (!isTaken(candidate)) return candidate
  }
}
