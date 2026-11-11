import { stripAnsi } from '@shared/controlChars'
import type { DockerStatsSample } from '@shared/types'
import { createLineSplitter } from '../util/lineSplitter'

export const CPU_HISTORY = 30

// Continuous `docker stats` clears the screen between frames: `ESC[2J ESC[H`.
const CLEAR = '\x1b[2J'

const UNIT: Record<string, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4
}

/** `12.5MiB`, `1.2GB`, `0B`, `--` → bytes (0 if unreadable). */
export function parseBytes(text: string): number {
  const m = /^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(text)
  if (!m) return 0
  const unit = UNIT[(m[2] ?? '').toLowerCase() || 'b']
  const value = Number(m[1])
  return unit !== undefined && Number.isFinite(value) ? Math.round(value * unit) : 0
}

/** `0.52%` → 0.52; `--` → 0. */
export function parsePercent(text: string): number {
  const value = Number.parseFloat(text)
  return Number.isFinite(value) ? value : 0
}

/** Sample from one stats JSON line (no history); `null` if the line is not a container. */
export function parseStatsLine(line: string): Omit<DockerStatsSample, 'cpuHistory'> | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const str = (key: string): string => (typeof o[key] === 'string' ? o[key] : '')
  const id = (str('ID') || str('Container')).slice(0, 12)
  if (!/^[0-9a-f]{12}$/.test(id)) return null
  const [usage = '', limit = ''] = str('MemUsage').split('/')
  return {
    id,
    cpuPercent: parsePercent(str('CPUPerc')),
    memUsage: parseBytes(usage),
    memLimit: parseBytes(limit),
    memPercent: parsePercent(str('MemPerc'))
  }
}

type Raw = Omit<DockerStatsSample, 'cpuHistory'>

/**
 * Splits the continuous `docker stats` output into frames (one per update). A frame ends when the next one starts
 * (clear-screen sequence) or when `flush()` is called (main calls it after a moment without data, so as not to
 * wait for the next frame).
 */
export class StatsFrameParser {
  private readonly lines = createLineSplitter()
  private current: Raw[] = []

  /** Frames completed by this chunk. */
  feed(chunk: string): Raw[][] {
    const frames: Raw[][] = []
    for (const line of this.lines.feed(chunk)) this.line(line, frames)
    return frames
  }

  private line(line: string, frames: Raw[][]): void {
    let text = line
    const at = text.lastIndexOf(CLEAR)
    if (at !== -1) {
      // Everything before the clear-screen still belongs to the current frame.
      const before = stripAnsi(text.slice(0, at)).trim()
      if (before !== '') this.push(before)
      if (this.current.length > 0) frames.push(this.current)
      this.current = []
      text = text.slice(at + CLEAR.length)
    }
    const clean = stripAnsi(text).trim()
    if (clean !== '') this.push(clean)
  }

  private push(text: string): void {
    const sample = parseStatsLine(text)
    if (sample) this.current.push(sample)
  }

  /** Delivers the frame in progress (complete lines already received), if any. */
  flush(): Raw[] | null {
    if (this.current.length === 0) return null
    const frame = this.current
    this.current = []
    return frame
  }
}

/** CPU history per container of ONE subscription; containers that disappear from the frame lose their history. */
export class CpuHistory {
  private readonly history = new Map<string, number[]>()

  apply(frame: Raw[]): DockerStatsSample[] {
    const seen = new Set<string>()
    const out = frame.map((sample) => {
      seen.add(sample.id)
      const list = this.history.get(sample.id) ?? []
      list.push(sample.cpuPercent)
      if (list.length > CPU_HISTORY) list.splice(0, list.length - CPU_HISTORY)
      this.history.set(sample.id, list)
      return { ...sample, cpuHistory: [...list] }
    })
    for (const id of this.history.keys()) if (!seen.has(id)) this.history.delete(id)
    return out
  }
}
