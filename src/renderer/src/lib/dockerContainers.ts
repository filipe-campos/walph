// Pure logic of the Containers screen: group, filter, summarize and format. No React or store.
import type {
  DockerContainer,
  DockerInfo,
  DockerInspect,
  DockerList,
  DockerLogLine,
  DockerPort,
  DockerStatsSample
} from '@shared/types'
import { compareText, formatDate, formatNumber, t } from '@shared/i18n'

export type ContainerFilter = 'all' | 'running' | 'stopped'
export type DockerDetailTab = 'logs' | 'details'

/** Log followed on screen: `offset` = lines already dropped by the cap (stable key of the lines). */
export interface DockerLogsView {
  id: string
  /** `null` = the follow has not returned the `seq` yet. */
  seq: number | null
  lines: DockerLogLine[]
  offset: number
  ended: boolean
  error: string | null
}

interface DockerInspectView {
  id: string
  data: DockerInspect | null
  error: string | null
}

/** Docker state in the store (not persisted). `busy`: container ids, `project:<name>` or `workspace`. */
export interface DockerState {
  info: DockerInfo | null
  list: DockerList | null
  stats: Record<string, DockerStatsSample>
  loading: boolean
  /** `list()` error with Docker still answering `info()`. */
  listError: string | null
  busy: Record<string, true>
  selectedId: string | null
  detailTab: DockerDetailTab
  logs: DockerLogsView | null
  inspect: DockerInspectView | null
}

export function initialDockerState(): DockerState {
  return {
    info: null,
    list: null,
    stats: {},
    loading: false,
    listError: null,
    busy: {},
    selectedId: null,
    detailTab: 'logs',
    logs: null,
    inspect: null
  }
}

/** Cap of log lines in memory. */
const LOG_LINE_CAP = 2000

/** Container with a problem: `unhealthy` health or restarting in a loop. */
export function isProblem(c: DockerContainer): boolean {
  return c.health === 'unhealthy' || c.state === 'restarting'
}

function isRunning(c: DockerContainer): boolean {
  return c.state === 'running'
}

/** The "Running" filter includes those restarting (else a container with a problem would vanish from the list). */
function matchesFilter(c: DockerContainer, filter: ContainerFilter): boolean {
  if (filter === 'all') return true
  const live = c.state === 'running' || c.state === 'restarting'
  return filter === 'running' ? live : !live
}

/** Search by name, image, service, project or port (host or container). */
export function matchesQuery(c: DockerContainer, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)) return true
  if (c.service?.toLowerCase().includes(q) || c.project?.toLowerCase().includes(q)) return true
  return c.ports.some((p) => String(p.hostPort ?? '').includes(q) || String(p.containerPort).includes(q))
}

export interface ContainerGroup {
  /** `project:<name>` or `standalone`. */
  key: string
  project: string | null
  label: string
  workingDir: string | null
  /** Visible containers (after the filter and the search). */
  containers: DockerContainer[]
  /** Totals of the whole project (the "3/4 running" does not change with the filter). */
  total: number
  running: number
  /** Some container of the project lives inside the workspace folder. */
  inWorkspace: boolean
}

function lower(path: string, platform: string): string {
  return platform === 'darwin' || platform === 'win32' ? path.replace(/\\/g, '/').toLowerCase() : path
}

/** `dir` is the workspace folder or is inside it (case-insensitive where the OS ignores case). */
export function isInWorkspace(dir: string | null, root: string | null, platform: string): boolean {
  if (!dir || !root) return false
  const d = lower(dir, platform).replace(/\/+$/, '')
  const r = lower(root, platform).replace(/\/+$/, '')
  return d === r || d.startsWith(r + '/')
}

const byLabel = (a: DockerContainer, b: DockerContainer): number =>
  compareText(a.service ?? a.name, b.service ?? b.name) || compareText(a.name, b.name)

/**
 * Groups by compose project. Order: workspace projects, other projects (alphabetical) and, last, the standalone ones.
 * Groups without any visible row disappear.
 */
export function groupContainers(
  containers: DockerContainer[],
  options: { query: string; filter: ContainerFilter; root: string | null; platform: string; standaloneLabel: string }
): ContainerGroup[] {
  const byKey = new Map<string, DockerContainer[]>()
  for (const c of containers) {
    const key = c.project ? `project:${c.project}` : 'standalone'
    const list = byKey.get(key)
    if (list) list.push(c)
    else byKey.set(key, [c])
  }
  const groups: ContainerGroup[] = []
  for (const [key, all] of byKey) {
    const visible = all.filter((c) => matchesFilter(c, options.filter) && matchesQuery(c, options.query))
    if (visible.length === 0) continue
    const project = all[0]?.project ?? null
    const workingDir = all.find((c) => c.workingDir)?.workingDir ?? null
    groups.push({
      key,
      project,
      label: project ?? options.standaloneLabel,
      workingDir,
      containers: visible.sort(byLabel),
      total: all.length,
      running: all.filter(isRunning).length,
      inWorkspace: !!project && all.some((c) => isInWorkspace(c.workingDir, options.root, options.platform))
    })
  }
  const rank = (g: ContainerGroup): number => (g.project === null ? 2 : g.inWorkspace ? 0 : 1)
  return groups.sort((a, b) => rank(a) - rank(b) || compareText(a.label, b.label))
}

export interface ContainersSummary {
  total: number
  running: number
  stopped: number
  problems: number
  cpu: number
  memUsage: number
}

export function summarize(containers: DockerContainer[], stats: Record<string, DockerStatsSample>): ContainersSummary {
  let running = 0
  let problems = 0
  let cpu = 0
  let memUsage = 0
  for (const c of containers) {
    if (isRunning(c)) running++
    if (isProblem(c)) problems++
    const s = stats[c.id]
    if (s && isRunning(c)) {
      cpu += s.cpuPercent
      memUsage += s.memUsage
    }
  }
  return { total: containers.length, running, stopped: containers.length - running, problems, cpu, memUsage }
}

export function countProblems(list: DockerList | null): number {
  return list ? list.containers.filter(isProblem).length : 0
}

// ---------- Visible state ----------

export type StatusTone = 'ok' | 'warn' | 'danger' | 'idle'

/** State text (the status is never color alone) and the visual tone. */
export function statusOf(c: DockerContainer): { label: string; tone: StatusTone } {
  const labels = t().containers.status
  if (c.health === 'unhealthy') return { label: labels.unhealthy, tone: 'danger' }
  switch (c.state) {
    case 'running':
      if (c.health === 'starting') return { label: labels.starting, tone: 'warn' }
      if (c.health === 'healthy') return { label: labels.healthy, tone: 'ok' }
      return { label: labels.running, tone: 'ok' }
    case 'restarting':
      return { label: labels.restarting, tone: 'danger' }
    case 'paused':
      return { label: labels.paused, tone: 'warn' }
    case 'exited':
      return { label: labels.exited, tone: 'idle' }
    case 'created':
      return { label: labels.created, tone: 'idle' }
    case 'dead':
      return { label: labels.dead, tone: 'danger' }
    case 'removing':
      return { label: labels.removing, tone: 'warn' }
  }
}

// ---------- Ports ----------

// Container ports that do not speak HTTP, even inside the "web" ranges (databases, queues, brokers).
const NON_HTTP_PORTS = new Set([3306, 3307, 5432, 5433, 5672, 5671, 5671, 9042, 9092, 9094, 4222, 3389])

/**
 * The container usually serves HTTP on this port (80/443 and the dev ranges 3xxx–5xxx and 8xxx–9xxx), except
 * databases/queues.
 */
export function isLikelyHttpPort(containerPort: number): boolean {
  if (NON_HTTP_PORTS.has(containerPort)) return false
  if (containerPort === 80 || containerPort === 443) return true
  return (containerPort >= 3000 && containerPort <= 5999) || (containerPort >= 8000 && containerPort <= 9999)
}

/** TCP port published on the host that is probably web: becomes an `http://localhost:<port>` link. */
export function webPorts(ports: DockerPort[]): { port: number; url: string }[] {
  const seen = new Set<number>()
  const out: { port: number; url: string }[] = []
  for (const p of ports) {
    if (p.protocol !== 'tcp' || p.hostPort === null || seen.has(p.hostPort) || !isLikelyHttpPort(p.containerPort))
      continue
    seen.add(p.hostPort)
    out.push({ port: p.hostPort, url: `http://localhost:${p.hostPort}` })
  }
  return out
}

/** `8080:80` (published), `80` (only exposed); UDP/SCTP carry the protocol. */
export function portLabel(p: DockerPort): string {
  const base = p.hostPort === null ? String(p.containerPort) : `${p.hostPort}:${p.containerPort}`
  return p.protocol === 'tcp' ? base : `${base}/${p.protocol}`
}

/** Problem description in the current language (the docker `status` always comes in English). */
export function problemDescription(c: DockerContainer): string {
  const messages = t().containers
  if (c.state === 'restarting') return messages.problem.restartLoop
  const base = c.health === 'unhealthy' ? messages.status.unhealthy : statusOf(c).label
  return c.uptime ? messages.problem.withUptime(base, c.uptime) : base
}

// ---------- Formatting ----------

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0%'
  const text =
    value >= 10
      ? formatNumber(Math.round(value), { useGrouping: false })
      : formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${text}%`
}

/** Points of a `<polyline>` (`w`×`h`); an empty or single-point history becomes a flat line at the bottom. */
export function sparklinePoints(history: number[], w: number, h: number): string {
  if (history.length === 0) return `0,${h} ${w},${h}`
  const max = Math.max(5, ...history)
  const step = history.length > 1 ? w / (history.length - 1) : 0
  const pad = 1
  return history
    .map((v, i) => {
      const x = history.length > 1 ? i * step : w
      const y = h - pad - (Math.min(v, max) / max) * (h - pad * 2)
      return `${+x.toFixed(1)},${+y.toFixed(1)}`
    })
    .join(' ')
}

/** Memory bar: 0–100, rounded. */
export function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0
}

// ---------- Logs ----------

/** Adds a batch to the log, respecting the cap (`offset` counts the dropped lines). */
export function appendLogLines(view: DockerLogsView, lines: DockerLogLine[], cap = LOG_LINE_CAP): DockerLogsView {
  if (lines.length === 0) return view
  const joined = view.lines.length + lines.length > cap ? [...view.lines, ...lines] : null
  if (!joined) return { ...view, lines: [...view.lines, ...lines] }
  const drop = joined.length - cap
  return { ...view, lines: joined.slice(drop), offset: view.offset + drop }
}

/** `HH:MM:SS` in the local time zone; without a time (or invalid) returns empty. */
export function formatLogTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

export function formatCreated(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return formatDate(date, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  })
}
