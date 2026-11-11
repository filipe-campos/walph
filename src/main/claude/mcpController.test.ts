import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Query } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeCliRunner } from './cliRunner'
import { deferred } from '../testing/deferred'
import { FakeQuery } from './testing/fakeQuery'
import { McpController, type McpHost } from './mcpController'
import { validateMcpServerInput } from './mcp'

type Row = { name: string; status: string; scope?: string }

function fakeQuery(list: Row[]): FakeQuery {
  const q = new FakeQuery({ prompt: (async function* () {})(), options: {} }, [])
  q.mcpList = list
  return q
}

const AUTH_KEEP_AWAKE_MS = 5 * 60_000

interface Setup {
  ctl: McpController
  query: FakeQuery
  host: { [K in keyof McpHost]-?: Mock<NonNullable<McpHost[K]>> }
  runCli: ReturnType<typeof vi.fn<ClaudeCliRunner>>
}

function setup(list: Row[] = [{ name: 'docs', status: 'needs-auth', scope: 'project' }]): Setup {
  const query = fakeQuery(list)
  const runCli = vi.fn<ClaudeCliRunner>(() => Promise.resolve(''))
  const host = {
    ensureRun: vi.fn(() => Promise.resolve({ query: query as unknown as Query })),
    settleWake: vi.fn(() => Promise.resolve()),
    beginBusy: vi.fn(),
    endBusy: vi.fn(),
    refreshIdle: vi.fn(),
    notice: vi.fn(),
    prepareCli: vi.fn(() => Promise.resolve({ run: runCli, context: { cwd: '/p', env: {} } })),
    openExternal: vi.fn(() => Promise.resolve())
  }
  return { ctl: new McpController(host), query, host, runCli }
}

describe('McpController: serial queue', () => {
  it('an action only starts when the previous one finished, in call order', async () => {
    const { ctl, query } = setup()
    const gate = deferred<Row[]>()
    query.mcpServerStatus.mockReturnValueOnce(gate.promise)
    const first = ctl.status()
    const second = ctl.status()
    await vi.waitFor(() => expect(query.mcpServerStatus).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(query.mcpServerStatus).toHaveBeenCalledTimes(1)
    gate.resolve([{ name: 'docs', status: 'connected', scope: 'project' }])
    await first
    await second
    expect(query.mcpServerStatus).toHaveBeenCalledTimes(2)
  })

  it('the failure of an action does not block the queue', async () => {
    const { ctl, query } = setup()
    query.mcpServerStatus.mockRejectedValueOnce(new Error('crashed'))
    const failed = ctl.status()
    const next = ctl.status()
    await expect(failed).rejects.toThrow('crashed')
    await expect(next).resolves.toHaveLength(1)
  })

  it('mutation and listing do not cross: toggle finishes before the next requested listing', async () => {
    const { ctl, query } = setup([{ name: 'docs', status: 'connected', scope: 'project' }])
    await ctl.status()
    const gate = deferred()
    query.toggleMcpServer.mockReturnValueOnce(gate.promise)
    const toggled = ctl.toggle('docs', false)
    const listed = ctl.status()
    await vi.waitFor(() => expect(query.toggleMcpServer).toHaveBeenCalled())
    const callsDuring = query.mcpServerStatus.mock.calls.length
    await new Promise((r) => setTimeout(r, 20))
    expect(query.mcpServerStatus.mock.calls.length).toBe(callsDuring)
    gate.resolve()
    await toggled
    await listed
  })
})

describe('McpController: deadlines', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('listing times out at 15 s with the timeout text and gives back the busy state', async () => {
    const { ctl, query, host } = setup()
    query.mcpServerStatus.mockReturnValue(new Promise(() => {}))
    const p = ctl.status()
    const settled = expect(p).rejects.toThrow('não respondeu a tempo')
    await vi.advanceTimersByTimeAsync(14_999)
    expect(host.endBusy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await settled
    expect(host.beginBusy).toHaveBeenCalledTimes(1)
    expect(host.endBusy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['toggle', (ctl: McpController) => ctl.toggle('docs', true), (q: FakeQuery) => q.toggleMcpServer],
    ['reconnect', (ctl: McpController) => ctl.reconnect('docs'), (q: FakeQuery) => q.reconnectMcpServer]
  ])('%s waits 45 s, not 15 s', async (_name, act, method) => {
    const { ctl, query } = setup([{ name: 'docs', status: 'pending', scope: 'project' }])
    const listed = ctl.status()
    await vi.advanceTimersByTimeAsync(0)
    await listed
    method(query).mockReturnValue(new Promise<void>(() => {}))
    const p = act(ctl)
    const settled = expect(p).rejects.toThrow('não respondeu a tempo')
    await vi.advanceTimersByTimeAsync(44_999)
    let early = false
    void p.catch(() => (early = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(early).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await settled
  })

  it('clearing login uses the short deadline (15 s)', async () => {
    const { ctl, query } = setup()
    await ctl.status()
    query.mcpClearAuth.mockReturnValue(new Promise(() => {}))
    const p = ctl.clearAuth('docs')
    const settled = expect(p).rejects.toThrow('não respondeu a tempo')
    await vi.advanceTimersByTimeAsync(15_000)
    await settled
  })

  it('the deadline error carries the failed action as a prefix', async () => {
    const { ctl, query } = setup()
    query.mcpServerStatus.mockReturnValue(new Promise(() => {}))
    const p = ctl.status()
    const settled = expect(p).rejects.toThrow(/^Não foi possível .*: .* a tempo\.$/)
    await vi.advanceTimersByTimeAsync(15_000)
    await settled
  })
})

describe('McpController: busy and relaunch', () => {
  it('waits for the relaunch before asking for the live CLI, and begin/end stay paired on error', async () => {
    const { ctl, host, query } = setup()
    const order: string[] = []
    host.settleWake.mockImplementation(() => {
      order.push('settle')
      return Promise.resolve()
    })
    host.ensureRun.mockImplementation(() => {
      order.push('ensure')
      return Promise.resolve({ query: query as unknown as Query })
    })
    await ctl.status()
    expect(order).toEqual(['settle', 'ensure'])
    host.ensureRun.mockRejectedValueOnce(new Error('conversation closed'))
    await expect(ctl.status()).rejects.toThrow('conversation closed')
    expect(host.beginBusy).toHaveBeenCalledTimes(2)
    expect(host.endBusy).toHaveBeenCalledTimes(2)
  })

  it('a name outside the last list is rejected without touching the CLI', async () => {
    const { ctl, query } = setup()
    await expect(ctl.toggle('docs', true)).rejects.toThrow('não existe mais')
    await ctl.status()
    await expect(ctl.reconnect('ghost')).rejects.toThrow('não existe mais')
    await expect(ctl.authenticate('ghost')).rejects.toThrow('não existe mais')
    expect(query.toggleMcpServer).not.toHaveBeenCalled()
    expect(query.reconnectMcpServer).not.toHaveBeenCalled()
    expect(query.mcpAuthenticate).not.toHaveBeenCalled()
  })

  it('the internal walph server and the sdk-scoped one cannot be disabled', async () => {
    const s = setup([
      { name: 'walph', status: 'connected', scope: 'user' },
      { name: 'internal', status: 'connected', scope: 'sdk' }
    ])
    await s.ctl.status()
    await expect(s.ctl.toggle('walph', false)).rejects.toThrow('interno')
    await expect(s.ctl.toggle('internal', false)).rejects.toThrow('interno')
    expect(s.query.toggleMcpServer).not.toHaveBeenCalled()
  })

  it('CLI without the login method: translated error instead of TypeError', async () => {
    const { ctl, query } = setup()
    await ctl.status()
    delete (query as { mcpAuthenticate?: unknown }).mcpAuthenticate
    await expect(ctl.authenticate('docs')).rejects.toThrow(/Não foi possível/)
  })
})

describe('McpController: OAuth login and keep awake', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function listed(s: Setup): Promise<void> {
    const p = s.ctl.status()
    await vi.advanceTimersByTimeAsync(0)
    await p
  }

  it('an expected callback holds off sleep for 5 min, then releases and reevaluates idleness', async () => {
    const s = setup()
    await listed(s)
    const result = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await expect(result).resolves.toEqual({ authUrl: 'https://auth.example/x', awaitingCallback: true })
    expect(s.ctl.authPending).toBe(true)
    s.host.refreshIdle.mockClear()
    await vi.advanceTimersByTimeAsync(AUTH_KEEP_AWAKE_MS - 1)
    expect(s.ctl.authPending).toBe(true)
    expect(s.host.refreshIdle).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.ctl.authPending).toBe(false)
    expect(s.host.refreshIdle).toHaveBeenCalledTimes(1)
  })

  it('a new login restarts the 5 min deadline', async () => {
    const s = setup()
    await listed(s)
    const first = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await first
    await vi.advanceTimersByTimeAsync(AUTH_KEEP_AWAKE_MS - 1_000)
    const second = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await second
    await vi.advanceTimersByTimeAsync(AUTH_KEEP_AWAKE_MS - 1)
    expect(s.ctl.authPending).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.ctl.authPending).toBe(false)
  })

  it('without an expected callback it does not hold off sleep', async () => {
    const s = setup()
    s.query.mcpAuthenticate.mockResolvedValue({
      authUrl: 'https://auth.example/x',
      requiresUserAction: true,
      callbackExpected: false
    })
    await listed(s)
    const p = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await expect(p).resolves.toEqual({ authUrl: 'https://auth.example/x', awaitingCallback: false })
    expect(s.ctl.authPending).toBe(false)
  })

  it('listing with no server waiting for login releases sleep right away', async () => {
    const s = setup()
    await listed(s)
    const auth = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await auth
    expect(s.ctl.authPending).toBe(true)
    s.host.refreshIdle.mockClear()
    s.query.mcpList = [{ name: 'docs', status: 'connected', scope: 'project' }]
    await listed(s)
    expect(s.ctl.authPending).toBe(false)
    expect(s.host.refreshIdle).toHaveBeenCalledTimes(1)
  })

  it('listing with a server still in needs-auth keeps the login pending', async () => {
    const s = setup()
    await listed(s)
    const auth = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await auth
    await listed(s)
    expect(s.ctl.authPending).toBe(true)
  })

  it('dispose releases the deadline: nothing is reevaluated afterwards', async () => {
    const s = setup()
    await listed(s)
    const auth = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await auth
    s.host.refreshIdle.mockClear()
    s.ctl.dispose()
    await vi.advanceTimersByTimeAsync(AUTH_KEEP_AWAKE_MS * 2)
    expect(s.host.refreshIdle).not.toHaveBeenCalled()
  })

  it('only opens http(s) URLs and a failure to open does not break the login', async () => {
    const s = setup()
    s.query.mcpAuthenticate.mockResolvedValue({
      authUrl: 'javascript:alert(1)',
      requiresUserAction: true,
      callbackExpected: true
    })
    await listed(s)
    const unsafe = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await expect(unsafe).resolves.toEqual({ awaitingCallback: true })
    expect(s.host.openExternal).not.toHaveBeenCalled()

    s.query.mcpAuthenticate.mockResolvedValue({
      authUrl: 'https://auth.example/ok',
      requiresUserAction: true,
      callbackExpected: false
    })
    s.host.openExternal.mockRejectedValueOnce(new Error('no browser'))
    const safe = s.ctl.authenticate('docs')
    await vi.advanceTimersByTimeAsync(0)
    await expect(safe).resolves.toEqual({ authUrl: 'https://auth.example/ok', awaitingCallback: false })
    expect(s.host.openExternal).toHaveBeenCalledWith('https://auth.example/ok')
  })
})

describe('McpController: claude mcp (add and remove)', () => {
  const input = {
    name: 'new',
    scope: 'local' as const,
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { TOKEN: 'secret-123' }
  }

  it('the CLI error comes out without the secret and with a single final period', async () => {
    const s = setup([])
    s.runCli.mockRejectedValue(new Error('failed with secret-123.'))
    const error = await s.ctl.add(validateMcpServerInput(input)).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).not.toContain('secret-123')
    expect(message).toContain('***')
    expect(message).toMatch(/[^.]\.$/)
  })

  it('dispose aborts the ongoing claude mcp', async () => {
    const s = setup([])
    let signal: AbortSignal | undefined
    s.runCli.mockImplementation((_args, ctx) => {
      signal = ctx.signal
      return new Promise<string>(() => {})
    })
    void s.ctl.add(validateMcpServerInput(input)).catch(() => undefined)
    await vi.waitFor(() => expect(signal).toBeDefined())
    expect(signal?.aborted).toBe(false)
    s.ctl.dispose()
    expect(signal?.aborted).toBe(true)
  })

  it('remove only accepts an editable server of the requested scope and hides it from the next list', async () => {
    const s = setup([
      { name: 'docs', status: 'connected', scope: 'project' },
      { name: 'walph', status: 'connected', scope: 'sdk' }
    ])
    await s.ctl.status()
    await expect(s.ctl.remove('docs', 'user')).rejects.toThrow('removidos')
    await expect(s.ctl.remove('walph', 'user')).rejects.toThrow('removidos')
    const list = await s.ctl.remove('docs', 'project')
    expect(s.runCli).toHaveBeenCalledWith(['mcp', 'remove', '-s', 'project', '--', 'docs'], expect.anything())
    expect(list.map((x) => x.name)).toEqual(['walph'])
    expect((await s.ctl.status()).map((x) => x.name)).toEqual(['walph'])
  })

  it('remove warns when the live CLI keeps listing the server, but still hides it', async () => {
    const s = setup([{ name: 'docs', status: 'connected', scope: 'project' }])
    await s.ctl.status()
    await s.ctl.remove('docs', 'project')
    expect(s.host.notice).toHaveBeenCalledTimes(1)
  })

  it('add warns when the live session did not pick up the server', async () => {
    const s = setup([])
    await s.ctl.add(validateMcpServerInput(input))
    expect(s.host.notice).toHaveBeenCalledTimes(1)
    expect(s.query.reloadPlugins).toHaveBeenCalled()
  })

  it('a failure to reload plugins does not stop the list from coming back', async () => {
    const s = setup([])
    s.query.reloadPlugins.mockRejectedValue(new Error('no reload'))
    await expect(s.ctl.add(validateMcpServerInput(input))).resolves.toEqual([])
  })
})
