// Pure logic of the MCP server manager (`/mcp`): grouping, labels and form reading.
import type {
  ClaudeMcpScope,
  ClaudeMcpServer,
  ClaudeMcpServerInput,
  ClaudeMcpStatus,
  ClaudeMcpTransport
} from '@shared/types'
import { compareText, t } from '@shared/i18n'

type McpGroupKey = 'project' | 'local' | 'user' | 'claudeai' | 'plugin' | 'other'

export interface McpGroup {
  key: McpGroupKey
  label: string
  servers: ClaudeMcpServer[]
}

const GROUPS: readonly McpGroupKey[] = ['project', 'local', 'user', 'claudeai', 'plugin', 'other']

function groupKeyOf(scope: string): McpGroupKey {
  return scope === 'project' || scope === 'local' || scope === 'user' || scope === 'claudeai' || scope === 'plugin'
    ? scope
    : 'other'
}

/** Groups by origin in the fixed order of `GROUPS`, names in alphabetical order; empty groups disappear. */
export function groupServers(servers: readonly ClaudeMcpServer[]): McpGroup[] {
  const labels = t().claude.mcp.groups
  return GROUPS.map((key) => ({
    key,
    label: labels[key],
    servers: servers.filter((s) => groupKeyOf(s.scope) === key).sort((a, b) => compareText(a.name, b.name))
  })).filter((g) => g.servers.length > 0)
}

export function statusLabel(status: ClaudeMcpStatus): string {
  const labels = t().claude.mcp.status
  switch (status) {
    case 'connected':
      return labels.connected
    case 'failed':
      return labels.failed
    case 'needs-auth':
      return labels.needsAuth
    case 'pending':
      return labels.pending
    case 'disabled':
      return labels.disabled
    default:
      return labels.unknown
  }
}

/** Design system `StatusDot` status for each server state. */
export function statusDot(status: ClaudeMcpStatus): 'idle' | 'running' | 'done' | 'attention' | 'error' {
  switch (status) {
    case 'connected':
      return 'done'
    case 'failed':
      return 'error'
    case 'needs-auth':
      return 'attention'
    case 'pending':
      return 'running'
    default:
      return 'idle'
  }
}

/** "3 ferramentas" / "1 ferramenta"; empty when not connected. */
export function toolCountLabel(server: ClaudeMcpServer): string {
  if (server.status !== 'connected') return ''
  return t().claude.mcp.toolCount(server.tools.length)
}

/** The internal `walph` (SDK) is read-only: toggling it would break the editor integration. */
export function canToggle(server: ClaudeMcpServer): boolean {
  return server.scope !== 'sdk' && server.name !== 'walph'
}

/** "Sair" only makes sense where there is a stored OAuth: http/sse and the claude.ai connectors. */
export function canLogout(server: ClaudeMcpServer): boolean {
  if (server.status !== 'connected') return false
  const transport = server.config?.transport
  return server.scope === 'claudeai' || transport === 'http' || transport === 'sse'
}

/** There is work in progress: the modal polls until the status settles. */
export function needsPolling(servers: readonly ClaudeMcpServer[], authenticating: boolean): boolean {
  return authenticating || servers.some((s) => s.status === 'pending')
}

/** UI state key of a server: the same name may exist in different scopes. */
export function serverKey(s: Pick<ClaudeMcpServer, 'scope' | 'name'>): string {
  return `${s.scope}:${s.name}`
}

/** Single line of the redacted config: `command arg1 arg2` or the URL. */
export function configSummary(server: ClaudeMcpServer): string {
  const c = server.config
  if (!c) return ''
  if (c.url) return c.url
  if (c.command) return [c.command, ...(c.args ?? [])].join(' ')
  return ''
}

// ---------- Form ----------

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const HEADER_KEY = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * `KEY=value` lines (the value may contain `=`). Empty lines and `#comment` are ignored; a repeated key keeps the last.
 * `kind` picks the key rule: environment variable or HTTP header name.
 */
export function parseKeyValueLines(text: string, kind: 'env' | 'header'): ParseResult<Record<string, string>> {
  const out: Record<string, string> = {}
  const rule = kind === 'env' ? ENV_KEY : HEADER_KEY
  const lines = text.split(/\r?\n/)
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) return { ok: false, error: t().claude.mcp.errors.pairFormat(i + 1) }
    const key = line.slice(0, eq).trim()
    if (!rule.test(key)) return { ok: false, error: t().claude.mcp.errors.pairName(i + 1, key) }
    out[key] = line.slice(eq + 1).trim()
  }
  return { ok: true, value: out }
}

/**
 * Splits the arguments like a simple shell: spaces separate, single/double quotes group and `\` escapes the next
 * character (outside single quotes). Unclosed quotes → `null`. Never runs anything: it only builds the array.
 */
export function splitArgs(text: string): string[] | null {
  const args: string[] = []
  let cur = ''
  let has = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === '\\' && quote === '"' && i + 1 < text.length) cur += text.charAt(++i)
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (ch === '\\' && i + 1 < text.length) {
      cur += text.charAt(++i)
      has = true
    } else if (/\s/.test(ch)) {
      if (has || cur) args.push(cur)
      cur = ''
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (quote) return null
  if (has || cur) args.push(cur)
  return args
}

const MCP_NAME = /^[A-Za-z0-9_-]{1,64}$/

export interface McpFormValues {
  name: string
  transport: ClaudeMcpTransport
  /** stdio: command + arguments in a single field. */
  commandLine: string
  url: string
  /** `KEY=value` per line; each transport keeps its own text (switching transport does not erase the other). */
  env: string
  headers: string
  scope: ClaudeMcpScope
}

export type McpFormField = 'name' | 'commandLine' | 'url' | 'pairs'

/** Light client-side validation (main does the real validation): returns the input or the error per field. */
export function buildServerInput(
  form: McpFormValues
): { ok: true; input: ClaudeMcpServerInput } | { ok: false; errors: Partial<Record<McpFormField, string>> } {
  const errors: Partial<Record<McpFormField, string>> = {}
  const m = t().claude.mcp.errors
  const name = form.name.trim()
  if (!MCP_NAME.test(name)) errors.name = m.name

  const pairs = parseKeyValueLines(
    form.transport === 'stdio' ? form.env : form.headers,
    form.transport === 'stdio' ? 'env' : 'header'
  )
  if (!pairs.ok) errors.pairs = pairs.error

  if (form.transport === 'stdio') {
    const parts = splitArgs(form.commandLine)
    if (!parts) errors.commandLine = m.unclosedQuotes
    else if (parts.length === 0) errors.commandLine = m.commandRequired
    if (Object.keys(errors).length > 0 || !parts || !pairs.ok) return { ok: false, errors }
    const [command, ...args] = parts as [string, ...string[]]
    const env = pairs.value
    return {
      ok: true,
      input: {
        name,
        scope: form.scope,
        transport: 'stdio',
        command,
        args,
        ...(Object.keys(env).length > 0 ? { env } : {})
      }
    }
  }

  const url = form.url.trim()
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.url = m.urlScheme
  } catch {
    errors.url = url ? m.urlInvalid : m.urlRequired
  }
  if (Object.keys(errors).length > 0 || !pairs.ok) return { ok: false, errors }
  const headers = pairs.value
  return {
    ok: true,
    input: {
      name,
      scope: form.scope,
      transport: form.transport,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {})
    }
  }
}
