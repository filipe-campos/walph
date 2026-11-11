import type { DockerPort } from '@shared/types'

const PROTOCOLS = new Set(['tcp', 'udp', 'sctp'])
const MAX_RANGE = 64

/** `8000-8002` → [8000, 8001, 8002]; `80` → [80]; invalid → []. A huge range is cut (never freezes the list). */
function expandRange(text: string): number[] {
  const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(text.trim())
  if (!m) return []
  const from = Number(m[1])
  const to = m[2] === undefined ? from : Number(m[2])
  if (to < from || to > 65535) return []
  const out: number[] = []
  for (let p = from; p <= to && out.length < MAX_RANGE; p++) out.push(p)
  return out
}

function parseProtocol(text: string | undefined): DockerPort['protocol'] | null {
  const p = (text ?? 'tcp').toLowerCase()
  return PROTOCOLS.has(p) ? (p as DockerPort['protocol']) : null
}

/**
 * One `Ports` entry of `docker ps`: `0.0.0.0:8080->80/tcp`, `:::8080->80/tcp`, `[::]:443->443/tcp`, `5432/tcp`,
 * ranges `0.0.0.0:8000-8002->8000-8002/tcp`. A range becomes several ports.
 */
export function parsePortEntry(entry: string): DockerPort[] {
  const text = entry.trim()
  if (text === '') return []
  const arrow = text.indexOf('->')
  const left = arrow === -1 ? null : text.slice(0, arrow)
  const right = arrow === -1 ? text : text.slice(arrow + 2)
  const [containerText, protoText] = right.split('/')
  const protocol = parseProtocol(protoText)
  const containerPorts = expandRange(containerText ?? '')
  if (!protocol || containerPorts.length === 0) return []
  if (left === null)
    return containerPorts.map((containerPort) => ({ hostIp: null, hostPort: null, containerPort, protocol }))
  const colon = left.lastIndexOf(':')
  const hostPortText = colon === -1 ? left : left.slice(colon + 1)
  let hostIp: string | null = colon === -1 ? '' : left.slice(0, colon)
  if (hostIp.startsWith('[') && hostIp.endsWith(']')) hostIp = hostIp.slice(1, -1)
  if (hostIp === '') hostIp = '0.0.0.0'
  const hostPorts = expandRange(hostPortText)
  const lastHostPort = hostPorts[hostPorts.length - 1]
  if (lastHostPort === undefined) return []
  return containerPorts.map((containerPort, i) => ({
    hostIp,
    hostPort: hostPorts[i] ?? lastHostPort,
    containerPort,
    protocol
  }))
}

const isV6 = (ip: string | null): boolean => ip !== null && ip.includes(':')

/** Removes the IPv6 mirror of a mapping already published on IPv4 (same host/container port and protocol). */
export function dedupePorts(ports: DockerPort[]): DockerPort[] {
  const byKey = new Map<string, DockerPort>()
  for (const port of ports) {
    const key = `${port.hostPort ?? ''}|${port.containerPort}|${port.protocol}`
    const prev = byKey.get(key)
    if (!prev || (isV6(prev.hostIp) && !isV6(port.hostIp))) byKey.set(key, port)
  }
  return [...byKey.values()]
}
