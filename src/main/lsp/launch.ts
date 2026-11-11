import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { t } from '@shared/i18n'
import { unpackedPath } from '../util/unpackedPath'
import type { ResolvedServer } from './serverConfig'
import { UserError } from '../errors'

export interface Launch {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
}

/**
 * The project's `tsserver.js` (`node_modules/typescript` in the folder or in an ancestor, for monorepos), or `null`.
 * Only used with `useWorkspaceTypeScript`: the file comes from the repository and running it is running its code.
 */
export function findWorkspaceTsserver(root: string, exists: (p: string) => boolean = existsSync): string | null {
  let dir = root
  for (;;) {
    const candidate = join(dir, 'node_modules', 'typescript', 'lib', 'tsserver.js')
    if (exists(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Message for a custom server that failed to start; on Windows it explains `.cmd`/`.bat`. */
export function spawnErrorMessage(command: string, err: unknown, platform: string = process.platform): string {
  const detail = err instanceof Error ? err.message : String(err)
  const { errors } = t().lsp
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(command)) return errors.spawnWindowsScript(command, detail)
  if (platform === 'win32' && /EINVAL/.test(detail)) return errors.spawnWindowsInvalid(command, detail)
  return errors.spawn(command, detail)
}

function resolveFile(specifier: string): string | null {
  try {
    return unpackedPath(createRequire(import.meta.url).resolve(specifier))
  } catch {
    return null
  }
}

/** How to start the server. Built-in: the typescript-language-server CLI run by Electron itself as Node. */
export function buildLaunch(server: ResolvedServer, base: NodeJS.ProcessEnv = process.env): Launch {
  const env = { ...base }
  if (server.command) {
    // A custom server cannot inherit Electron's Node mode (it would make an Electron app run as plain Node).
    delete env.ELECTRON_RUN_AS_NODE
    return { command: server.command, args: server.args, env }
  }
  const cli = resolveFile('typescript-language-server/lib/cli.mjs')
  if (!cli) throw new UserError(t().lsp.errors.bundledMissing)
  env.ELECTRON_RUN_AS_NODE = '1'
  return { command: process.execPath, args: [cli, '--stdio', ...server.args], env }
}

/**
 * Built-in server `initializationOptions` (`tsserver.path`); custom servers receive nothing. By default ALWAYS the
 * bundled tsserver (`tsserver-bundled`, alias of `typescript@6`: the app's `typescript` is the compiler without
 * tsserver and TS 7 has no tsserver.js); the project's one only with `useWorkspaceTypeScript`, falling back to bundled.
 */
export function initializationOptions(server: ResolvedServer, root: string): Record<string, unknown> | undefined {
  if (!server.builtin) return undefined
  const bundled = resolveFile('tsserver-bundled/lib/tsserver.js')
  const path = (server.useWorkspaceTypeScript ? findWorkspaceTsserver(root) : null) ?? bundled
  // F2 on an imported usage must rename the symbol in every file, not create a local alias (`import { a as b }`).
  // tsserver inlay hints all come off: we turn on the least noisy ones (parameter names only for literals).
  const preferences = {
    providePrefixAndSuffixTextForRename: false,
    includeInlayParameterNameHints: 'literals',
    includeInlayParameterNameHintsWhenArgumentMatchesName: false,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true
  }
  return path ? { tsserver: { path }, preferences } : { preferences }
}

/**
 * Built-in server `workspace/didChangeConfiguration`: typescript-language-server only offers the references and
 * implementations code lenses when they are turned on here (`editor.codeLens` decides in the renderer if they show).
 */
export function workspaceSettings(server: ResolvedServer): Record<string, unknown> | undefined {
  if (!server.builtin) return undefined
  const lenses = { referencesCodeLens: { enabled: true }, implementationsCodeLens: { enabled: true } }
  return { typescript: lenses, javascript: lenses }
}
