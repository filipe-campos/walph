import { stripAnsi } from '@shared/controlChars'
import type { DockerLogLevel, DockerLogLine } from '@shared/types'

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))(?:\s(.*))?$/s
const MAX_LINE = 4000

/** Heuristic based on the line text; stderr alone does not imply an error (many programs log everything to it). */
export function detectLevel(text: string): DockerLogLevel {
  if (/\b(error|err|fatal|panic|exception|critical|crit)\b/i.test(text)) return 'error'
  if (/\b(warn|warning)\b/i.test(text)) return 'warn'
  if (/\b(debug|trace)\b/i.test(text)) return 'debug'
  return 'info'
}

/** One line of `docker logs --timestamps` (`2026-10-17T12:00:00.123456789Z text`). */
export function parseLogLine(raw: string, stream: DockerLogLine['stream']): DockerLogLine {
  const line = raw.replace(/\r$/, '')
  const m = TIMESTAMP.exec(line)
  let time: string | null = null
  let body = line
  if (m) {
    time = m[1] ?? null
    body = m[2] ?? ''
  }
  let text = stripAnsi(body)
  if (text.length > MAX_LINE) text = `${text.slice(0, MAX_LINE)}…`
  return { time, text, level: detectLevel(text), stream }
}
