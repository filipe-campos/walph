import { t } from '@shared/i18n'
import type { UptimeUnit } from '@shared/i18n/messages/containers'
import type { DockerContainer, DockerContainerState, DockerHealth } from '@shared/types'
import { dedupePorts, parsePortEntry } from './ports'

/** `ps` container + what only main uses (compose files from the labels). */
export interface PsContainer extends DockerContainer {
  /** `com.docker.compose.project.config_files` (host paths). */
  configFiles: string[]
}

const STATES = new Set<DockerContainerState>([
  'running',
  'exited',
  'paused',
  'restarting',
  'created',
  'dead',
  'removing'
])
// Key starts with a letter/digit: a compose path with `=` (`/b/x=y.yml`) continues the previous value.
const LABEL_START = /^[A-Za-z0-9][\w.\-/]*=/

/**
 * `Labels` of `docker ps --format json` is `k=v,k2=v2`. A value can have a comma (`config_files=/a.yml,/b.yml`): a
 * piece without `key=` continues the previous value.
 */
export function parseLabels(text: string): Record<string, string> {
  const labels: Record<string, string> = {}
  let key: string | null = null
  for (const piece of text.split(',')) {
    if (LABEL_START.test(piece)) {
      const eq = piece.indexOf('=')
      key = piece.slice(0, eq)
      labels[key] = piece.slice(eq + 1)
    } else if (key !== null) {
      labels[key] += `,${piece}`
    }
  }
  return labels
}

const UNITS = new Set<string>(['second', 'minute', 'hour', 'day', 'week', 'month', 'year'])
const isUnit = (unit: string): unit is UptimeUnit => UNITS.has(unit)

/** `Up 2 hours (healthy)` → `2 horas`; `Up About an hour` → `cerca de 1 hora`; without `Up` → `null`. */
export function parseUptime(status: string): string | null {
  const m = /^Up\s+(.*?)(?:\s*\(.*\))?\s*$/i.exec(status.trim())
  if (!m) return null
  const text = (m[1] ?? '').toLowerCase()
  const uptime = t().containers.uptime
  const less = /^less than a (\w+)$/.exec(text)
  const lessUnit = less?.[1]
  if (lessUnit !== undefined && isUnit(lessUnit)) return uptime.lessThanOne(lessUnit)
  const about = /^about an? (\w+)$/.exec(text)
  const aboutUnit = about?.[1]
  if (aboutUnit !== undefined && isUnit(aboutUnit)) return uptime.aboutOne(aboutUnit)
  const n = /^(\d+) (\w+?)s?$/.exec(text)
  const countUnit = n?.[2]
  if (countUnit !== undefined && isUnit(countUnit)) return uptime.count(Number(n?.[1]), countUnit)
  return null
}

export function parseHealth(status: string): DockerHealth {
  const m = /\((healthy|unhealthy|health: starting)\)/i.exec(status)
  if (!m) return null
  const value = (m[1] ?? '').toLowerCase()
  return value === 'healthy' ? 'healthy' : value === 'unhealthy' ? 'unhealthy' : 'starting'
}

const orNull = (value: string | undefined): string | null => (value === undefined || value === '' ? null : value)

function parseLine(line: string): PsContainer | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const str = (key: string): string => (typeof o[key] === 'string' ? o[key] : '')
  const id = str('ID').slice(0, 12)
  if (!/^[0-9a-f]{12}$/.test(id)) return null
  const name = (str('Names').split(',')[0] ?? '').trim().replace(/^\//, '')
  const stateText = str('State').toLowerCase() as DockerContainerState
  const state: DockerContainerState = STATES.has(stateText) ? stateText : 'exited'
  const status = str('Status')
  const labels = parseLabels(str('Labels'))
  const configFiles = (labels['com.docker.compose.project.config_files'] ?? '').split(',').filter((f) => f !== '')
  return {
    id,
    name: name || id,
    image: str('Image'),
    state,
    status,
    health: parseHealth(status),
    ports: dedupePorts(
      str('Ports')
        .split(', ')
        .flatMap((p) => parsePortEntry(p))
    ),
    uptime: state === 'running' ? parseUptime(status) : null,
    project: orNull(labels['com.docker.compose.project']),
    service: orNull(labels['com.docker.compose.service']),
    workingDir: orNull(labels['com.docker.compose.project.working_dir']),
    configFiles
  }
}

/** Output of `docker ps -a --format '{{json .}}'` (one JSON line per container). Malformed lines are ignored. */
export function parsePs(stdout: string): PsContainer[] {
  const out: PsContainer[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const c = parseLine(trimmed)
    if (c) out.push(c)
  }
  return out
}
