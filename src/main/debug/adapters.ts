// Which adapter serves a launch.json `type`: `debug.adapters` (user-only) wins over the built-in defaults.
import type { DebugAdapterSetting } from '@shared/settings'

/** Types sharing the same adapter: the original `type` is kept in `launch` (js-debug tells `node` from `pwa-node`). */
const ALIASES: Record<string, string> = {
  'pwa-node': 'node',
  'node-terminal': 'node',
  debugpy: 'python',
  'pwa-chrome': 'chrome',
  'pwa-msedge': 'msedge'
}

/**
 * Defaults that need no download: debugpy ships with the VS Code Python extension and with `pip install debugpy`.
 * js-debug has no default command (the `dapDebugServer.js` path is the user's, see the `debugger` skill).
 */
function builtinAdapters(platform: string): Record<string, DebugAdapterSetting> {
  return { python: { command: platform === 'win32' ? 'python' : 'python3', args: ['-m', 'debugpy.adapter'] } }
}

export interface ResolvedAdapter {
  /** Key that served it (`node` for a `pwa-node`). */
  id: string
  command: string
  args: string[]
  transport: 'stdio' | 'tcp'
  env: Record<string, string | null>
  builtin: boolean
}

export function resolveAdapter(
  type: string,
  setting: Record<string, DebugAdapterSetting> | undefined,
  platform: string = process.platform
): ResolvedAdapter | null {
  const own = setting ?? {}
  const builtin = builtinAdapters(platform)
  const alias = ALIASES[type]
  const keys = alias ? [type, alias] : [type]
  const pick = (table: Record<string, DebugAdapterSetting>): [string, DebugAdapterSetting] | null => {
    for (const key of keys) {
      const entry = Object.hasOwn(table, key) ? table[key] : undefined
      if (entry) return [key, entry]
    }
    return null
  }
  const found = pick(own) ?? pick(builtin)
  if (found) {
    const [id, entry] = found
    return {
      id,
      command: entry.command,
      args: entry.args ?? [],
      transport: entry.transport ?? 'stdio',
      env: entry.env ?? {},
      builtin: !Object.hasOwn(own, id)
    }
  }
  return null
}

/** Replaces `${port}` in the arguments (`tcp` transport). */
export function withPort(args: readonly string[], port: number): string[] {
  return args.map((a) => a.replaceAll('${port}', String(port)))
}
