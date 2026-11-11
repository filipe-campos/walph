// MCP servers of the Claude panel (`/mcp`). Pure logic: normalizes the (untrusted) CLI list to the contract,
// validates the "Add server" form and builds the arguments of `claude mcp add-json/remove`.
// Secrets: only the KEYS of `env`/`headers` leave main; URLs and arguments have their credentials masked.

import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { ClaudeMcpScope, ClaudeMcpServer, ClaudeMcpStatus, ClaudeMcpTool } from '@shared/types'
import { UserError } from '../errors'

const MAX_SERVERS = 100
const MAX_TOOLS = 500
const MAX_NAME = 200
const MAX_TEXT = 2000
const MAX_COMMAND = 1000
const MAX_ARGS = 100
const MAX_ARG = 1000
const MAX_URL = 2000
const MAX_KEYS = 100
const MAX_KEY = 200
const MAX_INPUT_ENTRIES = 50
const MAX_INPUT_VALUE = 4000
const MAX_CALLBACK_URL = 4000

/** Walph's own MCP server (the IDE tools): never touched. */
export const WALPH_SERVER = 'walph'

const STATUSES: readonly string[] = ['connected', 'failed', 'needs-auth', 'pending', 'disabled']
const EDITABLE_SCOPES: readonly string[] = ['local', 'project', 'user']
const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const HEADER_KEY_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/
const SENSITIVE = 'token|secret|key|password|passwd|auth|credential|bearer'
/** `--api-key=abc`, `API_TOKEN=abc` */
const SECRET_ASSIGN_RE = new RegExp(`^(-{0,2}[\\w.-]*(?:${SENSITIVE})[\\w.-]*)=(.+)$`, 'i')
/** `--api-key` (the value is the next argument) */
const SECRET_FLAG_RE = new RegExp(`^-{1,2}[\\w-]*(?:${SENSITIVE})[\\w-]*$`, 'i')
/** Path segment that looks like a secret: long, only alphanumeric/-_ and mixing letters and digits. */
const SECRET_SEGMENT_RE = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_-]{20,}$/

const cap = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' ? (v.length > max ? v.slice(0, max) : v) : undefined

const isMcpScope = (v: unknown): v is ClaudeMcpScope => typeof v === 'string' && EDITABLE_SCOPES.includes(v)

/** The URL user and password go away; query values and path segments that look like secrets become `***`. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '***')
    url.pathname = url.pathname
      .split('/')
      .map((seg) => (SECRET_SEGMENT_RE.test(seg) ? '***' : seg))
      .join('/')
    return url.toString().replace(/%2A%2A%2A/g, '***')
  } catch {
    return raw.replace(/\/\/[^/@]*@/, '//')
  }
}

/** Free text (errors, CLI output): URLs, `Authorization:`/`Bearer` and secret `key=value` masked. */
export function redactText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>`)\]]+/gi, (u) => redactUrl(u))
    .replace(/(authorization\s*[:=]\s*)\S+(?:\s+\S+)?/gi, '$1***')
    .replace(/\bbearer\s+\S+/gi, 'Bearer ***')
    .replace(new RegExp(`((?:${SENSITIVE})[\\w.-]*=)[^\\s&"']+`, 'gi'), '$1***')
}

/** A single argument: `--token=abc`, `API_KEY=abc`, `Authorization: …`, `Bearer …`, URLs. */
export function redactArg(arg: string): string {
  const m = SECRET_ASSIGN_RE.exec(arg)
  if (m) return `${m[1]}=***`
  return redactText(arg)
}

/** Argument list: the value after a sensitive flag (`--api-key sk-…`) is masked too. */
export function redactArgs(args: string[]): string[] {
  const out: string[] = []
  let maskNext = false
  for (const arg of args) {
    if (maskNext) {
      out.push('***')
      maskNext = false
    } else if (SECRET_FLAG_RE.test(arg)) {
      out.push(arg)
      maskNext = true
    } else out.push(redactArg(arg))
  }
  return out
}

function keysOf(v: unknown): string[] | undefined {
  if (!isRecord(v)) return undefined
  return Object.keys(v)
    .filter((k) => k.length <= MAX_KEY)
    .slice(0, MAX_KEYS)
}

function normalizeConfig(raw: unknown): ClaudeMcpServer['config'] | undefined {
  if (!isRecord(raw)) return undefined
  const type = typeof raw.type === 'string' ? raw.type : typeof raw.command === 'string' ? 'stdio' : ''
  if (type === 'stdio') {
    const command = cap(raw.command, MAX_COMMAND)
    const args = Array.isArray(raw.args)
      ? redactArgs(
          raw.args
            .filter((a): a is string => typeof a === 'string')
            .slice(0, MAX_ARGS)
            .map((a) => (a.length > MAX_ARG ? a.slice(0, MAX_ARG) : a))
        )
      : undefined
    const envKeys = keysOf(raw.env)
    return {
      transport: 'stdio',
      ...(command !== undefined ? { command } : {}),
      ...(args && args.length > 0 ? { args } : {}),
      ...(envKeys && envKeys.length > 0 ? { envKeys } : {})
    }
  }
  if (type === 'http' || type === 'sse' || type === 'ws' || type === 'claudeai-proxy') {
    const url = cap(raw.url, MAX_URL)
    const headerKeys = keysOf(raw.headers)
    return {
      transport: type,
      ...(url !== undefined ? { url: redactUrl(url) } : {}),
      ...(headerKeys && headerKeys.length > 0 ? { headerKeys } : {})
    }
  }
  if (type === 'sdk') return { transport: 'sdk' }
  return { transport: 'unknown' }
}

function normalizeTool(raw: unknown): ClaudeMcpTool | null {
  if (!isRecord(raw)) return null
  const name = cap(raw.name, MAX_NAME)
  if (!name) return null
  const annotations = isRecord(raw.annotations) ? raw.annotations : {}
  return {
    name,
    description: cap(raw.description, MAX_TEXT) ?? '',
    readOnly: annotations.readOnly === true,
    destructive: annotations.destructive === true
  }
}

/** `mcpServerStatus()` output (untrusted) → contract list. Malformed entries are dropped. */
export function normalizeMcpStatus(raw: unknown): ClaudeMcpServer[] {
  if (!Array.isArray(raw)) return []
  const out: ClaudeMcpServer[] = []
  for (const item of raw.slice(0, MAX_SERVERS)) {
    if (!isRecord(item)) continue
    const name = cap(item.name, MAX_NAME)
    if (!name) continue
    let status: ClaudeMcpStatus =
      typeof item.status === 'string' && STATUSES.includes(item.status) ? (item.status as ClaudeMcpStatus) : 'failed'
    // `source` is the reliable origin (the SDK documents it so); `scope` covers old CLIs that do not send it.

    const scope = cap(item.source, 64) || cap(item.scope, 64) || 'unknown'
    const rawError = cap(item.error, MAX_TEXT)
    const error = rawError ? redactText(rawError) : undefined
    // A connection that timed out stays `pending` with the error message: for the user it is a failure.
    if (status === 'pending' && error) status = 'failed'
    const info = isRecord(item.serverInfo) ? item.serverInfo : null
    const serverInfo =
      info && typeof info.name === 'string' && typeof info.version === 'string'
        ? { name: info.name.slice(0, MAX_NAME), version: info.version.slice(0, MAX_NAME) }
        : undefined
    const config = normalizeConfig(item.config)
    const tools = Array.isArray(item.tools)
      ? item.tools
          .slice(0, MAX_TOOLS)
          .map(normalizeTool)
          .filter((t): t is ClaudeMcpTool => t !== null)
      : []
    out.push({
      name,
      status,
      scope,
      editable: EDITABLE_SCOPES.includes(scope) && name !== WALPH_SERVER,
      ...(error ? { error } : {}),
      ...(serverInfo ? { serverInfo } : {}),
      ...(config ? { config } : {}),
      tools
    })
  }
  return out
}

/**
 * The real CLI (0.3.302) lists, after `reloadPlugins`, a newly added server with `scope: 'dynamic'` and
 * `source: 'dynamic'` (measured with `claude mcp add-json -s project`); without an origin, it becomes 'unknown'. Only
 * those two are replaced by the remembered scope: `plugin`, `claudeai`, `sdk`, `managed`… never.
 */
const UNSCOPED = ['unknown', 'dynamic']

/**
 * The conversation's memory of what Walph changed: the live CLI sometimes lists a newly added server without
 * scope/origin and keeps listing a removed one until the next session.
 */
export function applyMcpMemory(
  list: ClaudeMcpServer[],
  added: ReadonlyMap<string, ClaudeMcpScope>,
  removed: ReadonlySet<string>
): ClaudeMcpServer[] {
  return list
    .map((s) => {
      const scope = added.get(s.name)
      return scope && UNSCOPED.includes(s.scope) && s.name !== WALPH_SERVER ? { ...s, scope, editable: true } : s
    })
    .filter((s) => !removed.has(mcpKey(s.name, s.scope)))
}

export const mcpKey = (name: string, scope: string): string => `${scope}\0${name}`

// ---- "Add server" form ----

export interface ValidMcpServer {
  name: string
  scope: ClaudeMcpScope
  /** Config in the `claude mcp add-json` format. */
  config: Record<string, unknown>
  /** Secret values (env/headers) to strip from error messages. */
  secrets: string[]
}

const bad = (what: string): never => {
  throw new UserError(t().claudeHost.mcp.invalidServer(what))
}

function pairs(v: unknown, label: string, keyRe: RegExp): Record<string, string> {
  if (v === undefined || v === null) return {}
  const m = t().claudeHost.mcp
  if (!isRecord(v)) return bad(m.notPairs(label))
  const entries = Object.entries(v)
  if (entries.length > MAX_INPUT_ENTRIES) return bad(m.tooManyItems(label, MAX_INPUT_ENTRIES))
  const out: Record<string, string> = {}
  for (const [key, value] of entries) {
    if (key.length > MAX_KEY || !keyRe.test(key)) return bad(m.invalidKey(label, key.slice(0, 40)))
    if (typeof value !== 'string' || value.length > MAX_INPUT_VALUE || /[\r\n\0]/.test(value))
      return bad(m.invalidValue(label, key))
    out[key] = value
  }
  return out
}

/** Validates the form (it comes from the renderer). */
export function validateMcpServerInput(input: unknown): ValidMcpServer {
  const m = t().claudeHost.mcp
  if (!isRecord(input)) return bad(m.missingForm)
  const name = input.name
  if (typeof name !== 'string' || !NAME_RE.test(name)) return bad(m.badName)
  if (name.toLowerCase() === WALPH_SERVER) return bad(m.reservedName)
  if (!isMcpScope(input.scope)) return bad(m.unknownScope)
  const transport: unknown = input.transport
  if (transport !== 'stdio' && transport !== 'http' && transport !== 'sse') return bad(m.unknownTransport)

  let config: Record<string, unknown>
  let secrets: string[]
  if (transport === 'stdio') {
    const command = input.command
    if (
      typeof command !== 'string' ||
      command.trim() === '' ||
      command.length > MAX_COMMAND ||
      /[\r\n\0]/.test(command)
    )
      return bad(m.missingCommand)
    const rawArgs = input.args ?? []
    if (
      !Array.isArray(rawArgs) ||
      rawArgs.length > MAX_ARGS ||
      rawArgs.some((a) => typeof a !== 'string' || a.length > MAX_ARG || a.includes('\0'))
    )
      return bad(m.invalidArgs)
    const env = pairs(input.env, m.envLabel, ENV_KEY_RE)
    config = { type: 'stdio', command: command.trim(), args: rawArgs as string[], env }
    secrets = Object.values(env)
  } else {
    const raw = input.url
    if (typeof raw !== 'string' || raw.length > MAX_URL) return bad(m.missingUrl)
    let url: URL
    try {
      url = new URL(raw.trim())
    } catch {
      return bad(m.invalidUrl)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return bad(m.badProtocol)
    const headers = pairs(input.headers, m.headersLabel, HEADER_KEY_RE)
    config = { type: transport, url: url.toString(), headers }
    secrets = Object.values(headers)
  }
  // Also the JSON-escaped form: the CLI may echo the received JSON in an error.
  const masked = secrets.filter((s) => s.length >= 4)
  const escaped = masked.map((s) => JSON.stringify(s).slice(1, -1)).filter((e) => !masked.includes(e))
  return { name, scope: input.scope, config, secrets: [...masked, ...escaped] }
}

/**
 * Arguments of `claude mcp add-json` (name and JSON after `--`). CLI limitation: env/headers (secrets) travel
 * in argv and are visible in `ps` to the same user while it runs; there is no way to pass them through stdin.
 */
export function mcpAddArgs(server: ValidMcpServer): string[] {
  return ['mcp', 'add-json', '-s', server.scope, '--', server.name, JSON.stringify(server.config)]
}

/** Arguments of `claude mcp remove`. */
export function mcpRemoveArgs(name: string, scope: ClaudeMcpScope): string[] {
  return ['mcp', 'remove', '-s', scope, '--', name]
}

/** Name from the renderer for an action on a server (the conversation still checks it against the last list). */
export function parseServerName(v: unknown): string {
  if (typeof v !== 'string' || v === '' || v.length > MAX_NAME)
    throw new UserError(t().claudeHost.mcp.invalidServerShort)
  return v
}

/** `enabled` of `claude:mcpToggle`. */
export function parseMcpEnabled(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new UserError(t().claudeHost.request.invalid(t().claudeHost.request.parts.toggle))
  return v
}

/** Editable scope of `claude:mcpRemove`. */
export function parseMcpScope(v: unknown): ClaudeMcpScope {
  if (!isMcpScope(v)) throw new UserError(t().claudeHost.mcp.invalidScope)
  return v
}

/** CLI error message: one line, without the form's secret values. */
export function cleanCliError(text: string, secrets: string[]): string {
  let out = text.trim().split(/\r?\n/).find(Boolean) ?? ''
  for (const secret of secrets) out = out.split(secret).join('***')
  out = redactText(out)
  return out.length > 300 ? `${out.slice(0, 300)}…` : out
}

/** `mcpAuthenticate` response (untyped in the SDK): only an `http(s)` URL is accepted to open in the browser. */
export function parseAuthResponse(raw: unknown): { authUrl?: string; callbackExpected: boolean } {
  const r = isRecord(raw) ? raw : {}
  let authUrl: string | undefined
  if (typeof r.authUrl === 'string' && r.authUrl.length <= 8192) {
    try {
      const url = new URL(r.authUrl)
      if (url.protocol === 'http:' || url.protocol === 'https:') authUrl = url.toString()
    } catch {
      // malformed URL: nothing to open
    }
  }
  return { ...(authUrl ? { authUrl } : {}), callbackExpected: r.callbackExpected === true }
}

/** OAuth login callback URL pasted by the user: `http(s)` text of up to `MAX_CALLBACK_URL` characters. */
export function parseCallbackUrl(v: unknown): string {
  const invalid = (): never => {
    throw new UserError(t().claudeHost.mcp.invalidCallbackUrl)
  }
  if (typeof v !== 'string' || v.length > MAX_CALLBACK_URL) return invalid()
  let url: URL
  try {
    url = new URL(v.trim())
  } catch {
    return invalid()
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : invalid()
}
