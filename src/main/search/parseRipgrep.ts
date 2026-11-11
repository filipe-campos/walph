import { join } from 'node:path'
import type { SearchMatch } from '@shared/types'

interface RgEvent {
  type: string
  data: {
    path: { text?: string; bytes?: string }
    lines: { text?: string }
    line_number: number
    submatches: { start: number; end: number }[]
  }
}

export interface ParsedRgMatch {
  /** Absolute path (root + rg relative path). */
  path: string
  matches: SearchMatch[]
}

/** ripgrep returns UTF-8 byte offsets; the editor needs character offsets (UTF-16). */
export function byteToCharOffset(text: string, byteOffset: number): number {
  return Buffer.from(text, 'utf8').subarray(0, byteOffset).toString('utf8').length
}

/** Converts one `rg --json` line; `null` if it is not a `match` event or the JSON is invalid. */
export function parseRgLine(line: string, root: string): ParsedRgMatch | null {
  let msg: RgEvent | null
  try {
    msg = JSON.parse(line) as RgEvent | null
  } catch {
    return null
  }
  if (msg?.type !== 'match') return null
  // A file name that is not UTF-8 comes as `path.bytes` (base64): we ignore it instead of breaking main.
  const rel = msg.data.path.text
  if (typeof rel !== 'string') return null

  const raw = msg.data.lines.text ?? ''
  const text = raw.replace(/\r?\n$/, '')
  const matches = msg.data.submatches.map((sub): SearchMatch => {
    const column = byteToCharOffset(raw, sub.start)
    return {
      line: msg.data.line_number,
      column,
      length: byteToCharOffset(raw, sub.end) - column,
      text
    }
  })
  return { path: join(root, rel), matches }
}
