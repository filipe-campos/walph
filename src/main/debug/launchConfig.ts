// `.vscode/launch.json` (JSONC, VS Code format): reading the configurations, per-OS overrides and substitution of the
// common variables. Pure (the text and the context arrive ready).
import { basename, dirname, extname, relative, sep } from 'node:path'
import { isNonEmptyString, isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { DebugConfigSummary } from '@shared/types'
import { UserError } from '../errors'
import { parseJsonc } from '../settings/parseJsonc'

/** A configuration as the adapter receives it in `launch`/`attach` (the VS Code fields, already merged per OS). */
export type LaunchConfig = Record<string, unknown> & { name: string; type: string; request: 'launch' | 'attach' }

export type LaunchFile =
  { configurations: Record<string, unknown>[]; error: null } | { configurations: []; error: string }

/** Reads the `launch.json` text. Entries that are not objects are ignored (they do not invalidate the rest). */
export function parseLaunchFile(text: string): LaunchFile {
  const parsed = parseJsonc(text)
  if ('error' in parsed) return { configurations: [], error: t().debug.errors.launchJsonInvalid(parsed.error) }
  if (parsed.value === undefined) return { configurations: [], error: null }
  const { value } = parsed
  if (!isRecord(value) || (value.configurations !== undefined && !Array.isArray(value.configurations)))
    return { configurations: [], error: t().debug.errors.launchJsonInvalid(t().debug.errors.launchJsonShape) }
  const list = Array.isArray(value.configurations) ? value.configurations : []
  return { configurations: list.filter(isRecord), error: null }
}

const PLATFORM_KEYS: Record<string, string> = { win32: 'windows', darwin: 'osx', linux: 'linux' }

/** Applies the OS override (`windows`/`osx`/`linux`) and removes the three keys. */
export function forPlatform(config: Record<string, unknown>, platform: string): Record<string, unknown> {
  const own = config[PLATFORM_KEYS[platform] ?? '']
  const merged: Record<string, unknown> = { ...config, ...(isRecord(own) ? own : {}) }
  delete merged.windows
  delete merged.osx
  delete merged.linux
  return merged
}

/** Validates the minimum to start (`name`, `type`, `request`); `null` if something is missing. */
export function asLaunchConfig(config: Record<string, unknown>): LaunchConfig | null {
  const { name, type, request } = config
  if (!isNonEmptyString(name) || !isNonEmptyString(type) || (request !== 'launch' && request !== 'attach')) return null
  return { ...config, name, type, request }
}

export function summarize(configs: readonly Record<string, unknown>[], platform: string): DebugConfigSummary[] {
  const out: DebugConfigSummary[] = []
  const seen = new Set<string>()
  for (const raw of configs) {
    const config = asLaunchConfig(forPlatform(raw, platform))
    // Repeated names: only the first is reachable by name (as in VS Code).
    if (!config || seen.has(config.name)) continue
    seen.add(config.name)
    out.push({ name: config.name, type: config.type, request: config.request, builtin: false })
  }
  return out
}

/** Configurations offered when the folder has no `launch.json` (or it has none). */
export function builtinConfigs(): LaunchConfig[] {
  const names = t().debug.builtinConfig
  return [
    {
      name: names.pythonFile,
      type: 'python',
      request: 'launch',
      program: '${file}',
      console: 'integratedTerminal',
      justMyCode: true
    },
    {
      name: names.nodeFile,
      type: 'pwa-node',
      request: 'launch',
      program: '${file}',
      console: 'integratedTerminal',
      skipFiles: ['<node_internals>/**']
    }
  ]
}

/** Text of the `launch.json` created by "Open Configurations" (the same default configurations, in JSON). */
export function launchFileTemplate(): string {
  return `${JSON.stringify({ version: '0.2.0', configurations: builtinConfigs() }, null, 2)}\n`
}

export interface SubstitutionContext {
  root: string
  /** Active file in the editor (absolute). */
  file: string | null
  line: number | null
  selectedText: string | null
  env: Record<string, string | undefined>
  home: string
}

function variableValue(name: string, ctx: SubstitutionContext): string {
  const { root, file } = ctx
  const needFile = (): string => {
    if (!file) throw new UserError(t().debug.errors.needsFile(name))
    return file
  }
  if (name.startsWith('env:')) return ctx.env[name.slice(4)] ?? ''
  // A single folder per window: `${workspaceFolder:name}` is always it.
  if (name.startsWith('workspaceFolder:')) return root
  switch (name) {
    case 'workspaceFolder':
    case 'workspaceRoot':
    case 'cwd':
    case 'fileWorkspaceFolder':
      return root
    case 'workspaceFolderBasename':
      return basename(root)
    case 'userHome':
      return ctx.home
    case 'pathSeparator':
    case '/':
      return sep
    case 'file':
      return needFile()
    case 'relativeFile':
      return relative(root, needFile())
    case 'relativeFileDirname':
      return relative(root, dirname(needFile())) || '.'
    case 'fileBasename':
      return basename(needFile())
    case 'fileBasenameNoExtension':
      return basename(needFile(), extname(needFile()))
    case 'fileExtname':
      return extname(needFile())
    case 'fileDirname':
      return dirname(needFile())
    case 'fileDirnameBasename':
      return basename(dirname(needFile()))
    case 'lineNumber':
      if (ctx.line === null) throw new UserError(t().debug.errors.needsFile(name))
      return String(ctx.line)
    case 'selectedText':
      return ctx.selectedText ?? ''
    default:
      // `${command:…}`, `${input:…}`, `${config:…}` and the rest need VS Code extensions or interaction.
      throw new UserError(t().debug.errors.unsupportedVariable(name))
  }
}

function substituteString(text: string, ctx: SubstitutionContext): string {
  return text.replace(/\$\{([^}]+)\}/g, (_all, name: string) => variableValue(name, ctx))
}

/** Replaces the variables in every string of the value (objects and lists in depth; keys do not change). */
export function substituteVariables<T>(value: T, ctx: SubstitutionContext): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return substituteString(v, ctx)
    if (Array.isArray(v)) return v.map(walk)
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, walk(inner)]))
    return v
  }
  return walk(value) as T
}
