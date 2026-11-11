import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { DockerContainerState, DockerHealthDetail, DockerInspect, DockerMount, DockerPort } from '@shared/types'
import { maskCommandArgs } from './maskSecrets'
import { dedupePorts } from './ports'
import { UserError } from '../errors'

const STATES = new Set<DockerContainerState>([
  'running',
  'exited',
  'paused',
  'restarting',
  'created',
  'dead',
  'removing'
])
const MAX_HEALTH_OUTPUT = 500

type Obj = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const quote = (arg: string): string => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : JSON.stringify(arg))

function parsePorts(v: unknown): DockerPort[] {
  if (!isRecord(v)) return []
  const out: DockerPort[] = []
  for (const [key, bindings] of Object.entries(v)) {
    const m = /^(\d+)\/(tcp|udp|sctp)$/.exec(key)
    if (!m) continue
    const containerPort = Number(m[1])
    const protocol = m[2] as DockerPort['protocol']
    const list = Array.isArray(bindings) ? bindings.filter(isRecord) : []
    if (list.length === 0) out.push({ hostIp: null, hostPort: null, containerPort, protocol })
    for (const b of list) {
      const hostPort = Number(str(b.HostPort))
      if (!Number.isInteger(hostPort) || hostPort <= 0) continue
      out.push({ hostIp: str(b.HostIp) || '0.0.0.0', hostPort, containerPort, protocol })
    }
  }
  return dedupePorts(out).sort((a, b) => a.containerPort - b.containerPort || (a.hostPort ?? 0) - (b.hostPort ?? 0))
}

function parseHealth(state: Obj): DockerHealthDetail | null {
  const h = state.Health
  if (!isRecord(h)) return null
  const status = str(h.Status)
  if (status !== 'healthy' && status !== 'unhealthy' && status !== 'starting') return null
  const log = Array.isArray(h.Log) ? h.Log.filter(isRecord) : []
  const last = str(log.at(-1)?.Output).trim()
  return {
    status,
    failingStreak: typeof h.FailingStreak === 'number' ? h.FailingStreak : 0,
    lastOutput: last === '' ? null : last.slice(0, MAX_HEALTH_OUTPUT)
  }
}

/**
 * `docker inspect -- <id>` (JSON array with one object) → summary. Environment variables are only counted: the values
 * (passwords, tokens) never leave main.
 */
export function parseInspect(stdout: string): DockerInspect {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    throw new UserError(t().containers.errors.unexpectedInspect)
  }
  const o: unknown = Array.isArray(raw) ? raw[0] : raw
  if (!isRecord(o)) throw new UserError(t().containers.errors.containerNotFound)
  const config = isRecord(o.Config) ? o.Config : {}
  const state = isRecord(o.State) ? o.State : {}
  const net = isRecord(o.NetworkSettings) ? o.NetworkSettings : {}
  const entrypoint = strList(config.Entrypoint)
  const cmd = strList(config.Cmd)
  const parts = entrypoint.length + cmd.length > 0 ? [...entrypoint, ...cmd] : [str(o.Path), ...strList(o.Args)]
  const stateText = str(state.Status) as DockerContainerState
  const mounts: DockerMount[] = (Array.isArray(o.Mounts) ? o.Mounts.filter(isRecord) : []).map((m) => ({
    type: str(m.Type),
    source: str(m.Source) || str(m.Name),
    destination: str(m.Destination),
    readOnly: m.RW === false
  }))
  const running = state.Running === true
  const exitCode = typeof state.ExitCode === 'number' && !running ? state.ExitCode : null
  return {
    id: str(o.Id).slice(0, 12),
    name: str(o.Name).replace(/^\//, ''),
    image: str(config.Image),
    command: maskCommandArgs(parts.filter((p) => p !== ''))
      .map(quote)
      .join(' '),
    created: str(o.Created),
    state: STATES.has(stateText) ? stateText : 'exited',
    restartCount: typeof o.RestartCount === 'number' ? o.RestartCount : 0,
    exitCode,
    networks: isRecord(net.Networks) ? Object.keys(net.Networks) : [],
    mounts,
    ports: parsePorts(net.Ports),
    envCount: strList(config.Env).length,
    health: parseHealth(state)
  }
}
