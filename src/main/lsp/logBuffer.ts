import type { LspLogEntry, LspLogLevel } from '@shared/types'

/** Lines of the "Output" panel kept per window. */
const LOG_LIMIT = 2000

export class LogBuffer {
  private readonly lines: LspLogEntry[] = []

  push(server: string, level: LspLogLevel, message: string): LspLogEntry {
    const entry: LspLogEntry = { time: Date.now(), server, level, message }
    this.lines.push(entry)
    if (this.lines.length > LOG_LIMIT) this.lines.splice(0, this.lines.length - LOG_LIMIT)
    return entry
  }

  snapshot(): LspLogEntry[] {
    return [...this.lines]
  }
}
