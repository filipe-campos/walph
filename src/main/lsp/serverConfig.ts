import { extname } from 'node:path'
import type { LspServerSetting } from '@shared/settings'

const BUILTIN_ID = 'typescript'

/** Extension (lowercase, with dot) → `languageId` of the built-in server's `didOpen`. */
const BUILTIN_LANGUAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact'
}

export interface ResolvedServer {
  id: string
  /** Display name. */
  name: string
  /** `true` = built-in `typescript-language-server` (no `command` in the config). */
  builtin: boolean
  /** Only on a custom server. */
  command: string | null
  args: string[]
  /** Lowercase, with dot. */
  extensions: string[]
  languageId: string | null
  /** Only on the built-in one: use the project's tsserver (opt-in, runs code from the repository). */
  useWorkspaceTypeScript: boolean
}

function normalizeExtension(ext: string): string {
  return ext.toLowerCase()
}

/**
 * Active servers from `lsp.servers`. Priority order for a file: custom servers (in config order) and the built-in
 * one last. The built-in one exists even without an entry; a `typescript` entry only changes what it defines.
 */
export function resolveServers(setting: Record<string, LspServerSetting> | undefined): ResolvedServer[] {
  const entries = setting ?? {}
  const servers: ResolvedServer[] = []
  for (const [id, entry] of Object.entries(entries)) {
    if (id === BUILTIN_ID || entry.enabled === false) continue
    if (!entry.command || !entry.extensions?.length) continue
    servers.push({
      id,
      name: id,
      builtin: false,
      command: entry.command,
      args: entry.args ?? [],
      extensions: entry.extensions.map(normalizeExtension),
      languageId: entry.languageId ?? id,
      useWorkspaceTypeScript: false
    })
  }
  const own = entries[BUILTIN_ID]
  if (own?.enabled !== false) {
    // `command` on `typescript` replaces the executable: it becomes a custom server named TypeScript.
    servers.push({
      id: BUILTIN_ID,
      name: 'TypeScript',
      builtin: !own?.command,
      command: own?.command ?? null,
      args: own?.args ?? [],
      extensions: (own?.extensions ?? Object.keys(BUILTIN_LANGUAGES)).map(normalizeExtension),
      languageId: own?.languageId ?? null,
      useWorkspaceTypeScript: own?.useWorkspaceTypeScript === true
    })
  }
  return servers
}

/** Server that handles the file (by extension), or `undefined`. */
export function serverForPath(servers: readonly ResolvedServer[], path: string): ResolvedServer | undefined {
  const ext = normalizeExtension(extname(path))
  return ext ? servers.find((s) => s.extensions.includes(ext)) : undefined
}

export function languageIdFor(server: ResolvedServer, path: string): string {
  if (server.languageId) return server.languageId
  return BUILTIN_LANGUAGES[normalizeExtension(extname(path))] ?? 'typescript'
}

/** Changes when the server needs a restart (command, arguments, extensions or languageId). */
export function configSignature(server: ResolvedServer): string {
  return JSON.stringify([
    server.builtin,
    server.command,
    server.args,
    server.extensions,
    server.languageId,
    server.useWorkspaceTypeScript
  ])
}
