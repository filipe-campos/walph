import type { ReactNode } from 'react'

/** Splits `text` into segments, wrapping in <mark> the letters whose index (plus `offset`) is in `matches`. */
export function highlight(text: string, matches: ReadonlySet<number>, offset: number): ReactNode {
  const out: ReactNode[] = []
  let buffer = ''
  let marked = false
  const flush = (): void => {
    if (!buffer) return
    out.push(marked ? <mark key={out.length}>{buffer}</mark> : buffer)
    buffer = ''
  }
  // Walks by code point (the fuzzy UTF-16 indices point to the start): an emoji is never split between segments.
  let i = 0
  for (const ch of text) {
    const isMatch = matches.has(i + offset)
    if (isMatch !== marked) {
      flush()
      marked = isMatch
    }
    buffer += ch
    i += ch.length
  }
  flush()
  return out
}

/**
 * "Name + folder" label: the name highlighted (`offset` = position of the name in the matched text) and the
 * folder/context beside it.
 * `dir` may be a list of secondary texts; only with `highlightDir` (a single text) is it highlighted, from 0.
 */
export function pathLabel(
  name: string,
  dir: string | readonly (string | undefined)[] | undefined,
  matches: ReadonlySet<number>,
  offset: number,
  highlightDir = true
): ReactNode {
  const dirs = (typeof dir === 'string' ? [dir] : (dir ?? [])).filter((d): d is string => !!d)
  return (
    <>
      <span className="palette-file-name">{highlight(name, matches, offset)}</span>
      {dirs.map((d, i) => (
        <span key={i} className="palette-category palette-file-dir">
          {highlightDir ? highlight(d, matches, 0) : d}
        </span>
      ))}
    </>
  )
}
