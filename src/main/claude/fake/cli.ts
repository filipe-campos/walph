import type { FakeCallLog } from './callLog'

/** State of the fake's MCP servers, shared by every conversation of the script. */
export interface FakeMcpState {
  servers: Array<Record<string, unknown>>
  /** Login state of the fake (`claude auth logout` turns it off). */
  auth: { loggedIn: boolean; account: Record<string, unknown> | null }
}

/** Fake `claude auth status/logout`. */
function runFakeAuth(mcp: FakeMcpState, log: FakeCallLog, args: string[], cwd: string): Promise<string> {
  log({ type: 'authCli', args, cwd })
  if (args[1] === 'status') {
    const { loggedIn, account } = mcp.auth
    return Promise.resolve(
      JSON.stringify(loggedIn ? { loggedIn, authMethod: 'claude.ai', ...account } : { loggedIn, authMethod: 'none' })
    )
  }
  if (args[1] === 'logout') {
    mcp.auth = { loggedIn: false, account: null }
    return Promise.resolve('Successfully logged out\n')
  }
  return Promise.reject(new Error('error: invalid command'))
}

/** Fake `claude mcp add-json/remove`: changes the state and logs; errors like the CLI's. */
export function runFakeCli(mcp: FakeMcpState, log: FakeCallLog, args: string[], cwd: string): Promise<string> {
  if (args[0] === 'auth') return runFakeAuth(mcp, log, args, cwd)
  log({ type: 'mcpCli', args, cwd })
  const sep = args.indexOf('--')
  const scope = args[args.indexOf('-s') + 1]
  const rest = sep >= 0 ? args.slice(sep + 1) : []
  const [name, json] = rest
  if (args[0] !== 'mcp' || !name) return Promise.reject(new Error('error: invalid command'))
  if (args[1] === 'add-json') {
    if (mcp.servers.some((s) => s.name === name && s.scope === scope))
      return Promise.reject(new Error(`MCP server ${name} already exists in ${scope} config`))
    let config: unknown
    try {
      config = JSON.parse(json ?? '')
    } catch {
      return Promise.reject(new Error('Invalid JSON'))
    }
    mcp.servers.push({ name, status: 'connected', scope, source: scope, config, tools: [] })
    return Promise.resolve(`Added MCP server ${name} to ${scope} config\n`)
  }
  if (args[1] === 'remove') {
    const at = mcp.servers.findIndex((s) => s.name === name && s.scope === scope)
    if (at < 0) return Promise.reject(new Error(`No MCP server named "${name}" in ${scope} scope`))
    mcp.servers.splice(at, 1)
    return Promise.resolve(`Removed MCP server ${name} from ${scope} config\n`)
  }
  return Promise.reject(new Error('error: invalid command'))
}
