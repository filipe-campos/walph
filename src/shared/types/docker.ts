/** Container state as `docker ps` reports it (`State`). */
export type DockerContainerState = 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'dead' | 'removing'

/** Container health check; `null` = no health check defined. */
export type DockerHealth = 'healthy' | 'unhealthy' | 'starting' | null

export interface DockerPort {
  /** IP published on the host (`0.0.0.0`, `::`, `127.0.0.1`…); `null` = port only exposed, not published. */
  hostIp: string | null
  /** Host port; `null` = not published. */
  hostPort: number | null
  containerPort: number
  protocol: 'tcp' | 'udp' | 'sctp'
}

export interface DockerContainer {
  /** Short id (12 hex), the one that goes into the API calls. */
  id: string
  name: string
  image: string
  state: DockerContainerState
  /** `docker ps` text (`Up 2 hours (healthy)`, `Exited (1) 3 minutes ago`). */
  status: string
  health: DockerHealth
  /** Published/exposed ports, without repeating IPv4/IPv6 of the same port. */
  ports: DockerPort[]
  /** Running time already formatted (`2 hours`), `null` if it is not running. */
  uptime: string | null
  /** Compose project (`com.docker.compose.project`); `null` = standalone container. */
  project: string | null
  /** Compose service (`com.docker.compose.service`). */
  service: string | null
  /** `com.docker.compose.project.working_dir`. */
  workingDir: string | null
}

export interface DockerList {
  containers: DockerContainer[]
  /**
   * Compose file at the root of this view's folder (`compose.yaml`, `compose.yml`, `docker-compose.yml`,
   * `docker-compose.yaml`), for the header's "Compose up" button; `null` = no folder or no file.
   */
  workspaceComposeFile: string | null
}

/** Docker available: context, server version and resources of the daemon machine. */
export interface DockerInfoOk {
  ok: true
  /** Current context (`docker context show`, e.g. `desktop-linux`); `null` if it could not be read. */
  context: string | null
  /** Server version (`ServerVersion`). */
  version: string
  /** Total daemon memory, in bytes. */
  memTotal: number
  cpus: number
}

/** Docker unavailable. `message` is translated (`t()`), ready for the screen. */
export interface DockerInfoError {
  ok: false
  reason: 'notInstalled' | 'daemonDown' | 'outputTooLarge' | 'error'
  message: string
}

export type DockerInfo = DockerInfoOk | DockerInfoError

export interface DockerStatsSample {
  /** Short id (12 hex). */
  id: string
  cpuPercent: number
  /** Memory in use, bytes. */
  memUsage: number
  /** Memory limit, bytes (0 = unknown). */
  memLimit: number
  memPercent: number
  /** Latest CPU % values (oldest first, up to 30), for the sparkline. */
  cpuHistory: number[]
}

export type DockerLogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface DockerLogLine {
  /** ISO 8601 from `--timestamps`; `null` if the line came without it. */
  time: string | null
  text: string
  level: DockerLogLevel
  stream: 'stdout' | 'stderr'
}

/** Batch of `docker:logs` lines. `seq` is the one returned by `followLogs`: batches of another `seq` are stale. */
export interface DockerLogsBatch {
  seq: number
  lines: DockerLogLine[]
}

/** End of a logs follow (`docker:logsEnd`): the process exited (container stopped) or failed (translated `error`). */
export interface DockerLogsEnd {
  seq: number
  error: string | null
}

export interface DockerMount {
  type: string
  source: string
  destination: string
  readOnly: boolean
}

export interface DockerHealthDetail {
  status: Exclude<DockerHealth, null>
  failingStreak: number
  /** Output of the last check (truncated). */
  lastOutput: string | null
}

export interface DockerInspect {
  id: string
  name: string
  image: string
  /** Entrypoint + Cmd together, as text. */
  command: string
  /** ISO 8601. */
  created: string
  state: DockerContainerState
  restartCount: number
  exitCode: number | null
  networks: string[]
  mounts: DockerMount[]
  ports: DockerPort[]
  /** Number of environment variables (the values never leave main). */
  envCount: number
  health: DockerHealthDetail | null
}

export type DockerContainerAction = 'start' | 'stop' | 'restart'

export type DockerComposeAction = 'up' | 'restart' | 'stop'

/**
 * The machine's Docker, through the `docker.path` executable (empty = `docker` from the login shell PATH). The
 * continuous processes (`stats`, `logs -f`) are owned by the view and die on stop, reload, close and in `will-quit`.
 * Ids come from `list()` (validated in main: 12–64 hex or a name seen in this view's last `list()`).
 */
export interface DockerApi {
  /**
   * Context, version and resources; never throws: missing Docker/stopped daemon becomes `ok: false` with a translated
   * message (`t()`).
   */
  info(): Promise<DockerInfo>
  /**
   * `docker ps -a` of all containers (throws a translated message (`t()`) if Docker does not answer). Main shares ONE
   * `docker ps` among all views: the result is valid for up to 3 s for the open screen and up to 25 s with
   * `background: true` (badge polling, which tolerates older data). Actions (start/stop/compose…) invalidate the
   * cache.
   */
  list(options?: { background?: boolean }): Promise<DockerList>
  /**
   * Turns on continuous `docker stats` for this view (idempotent); the samples arrive through `onStats`. Only while
   * the Containers screen is open.
   */
  startStats(): void
  /** Turns off this view's `docker stats` (idempotent). */
  stopStats(): void
  /** Samples of all running containers, one batch per `docker stats` update (`docker:stats`). */
  onStats(cb: (samples: DockerStatsSample[]) => void): () => void
  /**
   * Follows the logs (`docker logs -f --timestamps --tail 500`) of a container, replacing this view's previous follow
   * (only one per view). Returns the `seq` that marks this follow's batches.
   */
  followLogs(id: string): Promise<number>
  /** Stops this view's logs follow (idempotent). */
  stopLogs(): void
  /** `docker:logs`. */
  onLogs(cb: (batch: DockerLogsBatch) => void): () => void
  /** `docker:logsEnd`. */
  onLogsEnd(cb: (end: DockerLogsEnd) => void): () => void
  /** `docker start|stop|restart -- <id>`; resolves when the command ends (throws a translated message (`t()`)). */
  action(id: string, action: DockerContainerAction): Promise<void>
  /**
   * Action on a compose project: main finds the `working_dir` and the compose files from the labels of the project's
   * containers (never from the renderer), checks they exist and runs `docker compose --project-directory … -f … -p
   * <project> up -d | restart | stop`. Throws a translated message (`t()`).
   */
  composeAction(project: string, action: DockerComposeAction): Promise<void>
  /** `docker compose -f <workspaceComposeFile> up -d` in this view's folder (header's "Compose up" button). */
  composeUpWorkspace(): Promise<void>
  inspect(id: string): Promise<DockerInspect>
  /**
   * Prompt ready for "Investigate with Claude": request in pt-BR + the last log lines and the inspect (without the
   * variable values) as delimited and truncated context blocks (Docker output is untrusted).
   */
  investigationPrompt(id: string): Promise<string>
}
