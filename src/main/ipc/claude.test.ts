import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeWebContents } from '../testing/fakeIpc'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
let rootChanged: (wc: unknown) => void = () => undefined
let cliImpl: (args: string[], ctx: { signal?: AbortSignal }) => Promise<string> = () => Promise.resolve('')
const spies = vi.hoisted(() => ({ closed: 0, calls: [] as string[] }))
let startImpl: () => Promise<unknown> = () => Promise.resolve({})

vi.mock('electron', () => ({
  app: { setBadgeCount: () => undefined, getPath: () => '/tmp', on: () => undefined },
  dialog: {},
  shell: {},
  ...harness.electronMock
}))
vi.mock('../claude/conversation/conversation', () => ({
  ClaudeConversation: class {
    constructor(public id: string) {}
    start = (): Promise<unknown> => startImpl().then((started) => ({ id: this.id, ...(started as object) }))
    stopTask = (): Promise<void> => this.record('stopTask')
    setModel = (): Promise<void> => this.record('setModel')
    mcp = Object.fromEntries(
      ['toggle', 'reconnect', 'authenticate', 'submitCallback', 'clearAuth', 'add', 'remove'].map((name) => [
        name,
        (): Promise<void> => this.record(`mcp.${name}`)
      ])
    )
    private record(name: string): Promise<void> {
      spies.calls.push(name)
      return Promise.resolve()
    }
    close = (): Promise<void> => {
      spies.closed++
      return Promise.resolve()
    }
  }
}))
vi.mock('../claude/sdk', () => ({ fakeClaudeScriptPath: () => null, loadSdk: () => Promise.resolve({}) }))
vi.mock('../claude/cliRunner', () => ({
  runClaudeCli: (args: string[], ctx: { signal?: AbortSignal }) => cliImpl(args, ctx)
}))
vi.mock('../claude/cliContext', () => ({ resolveCliContext: () => Promise.resolve({ cwd: '/proj', env: {} }) }))
vi.mock('../claude/notify', () => ({ closeSessionNotification: () => undefined, notifySession: () => false }))
vi.mock('../window/windows', () => ({
  getWindowRoot: () => '/proj',
  onWindowRootChange: (cb: (wc: unknown) => void) => {
    rootChanged = cb
    return () => undefined
  },
  windowOf: () => null,
  workspaceOf: () => null
}))
vi.mock('../window/evictionGuards', () => ({ registerEvictionGuard: () => undefined }))
vi.mock('../lsp/registry', () => ({ lspManagerOf: () => null }))
vi.mock('../settings/state', () => ({ getEffectiveSettings: () => ({}), onSettingsChange: () => () => undefined }))
vi.mock('../notifications/sound', () => ({ requestNotificationSound: () => undefined }))

import { onClaudeSessionEvent, type ClaudeSessionEvent } from '../claude/registry'
import { registerClaudeHandlers } from './claude'

describe('claude:start with a failure', () => {
  beforeEach(() => {
    harness.reset()
    registerClaudeHandlers()
  })

  it('emits `removed` only once when the start fails', async () => {
    const events: ClaudeSessionEvent[] = []
    const off = onClaudeSessionEvent((e) => events.push(e))
    const wc = fakeWebContents()
    startImpl = () => Promise.reject(new Error('failed'))
    await expect(harness.invoke('claude:start', wc, {})).rejects.toThrow('failed')
    expect(events.filter((e) => e.type === 'removed')).toHaveLength(1)
    off()
  })

  it('folder changed during the start: the shutdown already emitted `removed`, the catch does not repeat', async () => {
    const events: ClaudeSessionEvent[] = []
    const off = onClaudeSessionEvent((e) => events.push(e))
    const wc = fakeWebContents()
    startImpl = async () => {
      rootChanged(wc)
      throw new Error('failed')
    }
    await expect(harness.invoke('claude:start', wc, {})).rejects.toThrow('failed')
    expect(events.filter((e) => e.type === 'removed')).toHaveLength(1)
    off()
  })
})

describe('claude:close', () => {
  beforeEach(() => {
    harness.reset()
    registerClaudeHandlers()
    spies.closed = 0
    startImpl = () => Promise.resolve({})
  })

  it('removes the conversation from the view, announces the exit only once and closes it', async () => {
    const events: ClaudeSessionEvent[] = []
    const off = onClaudeSessionEvent((e) => events.push(e))
    const wc = fakeWebContents()
    const { id } = (await harness.invoke('claude:start', wc, {})) as { id: string }

    await harness.invoke('claude:close', wc, id)
    await harness.invoke('claude:close', wc, id)

    expect(events.filter((e) => e.type === 'removed')).toEqual([{ type: 'removed', wc, id }])
    expect(spies.closed).toBe(1)
    off()
  })

  it('an unknown id or one from another view closes nothing', async () => {
    const owner = fakeWebContents()
    const { id } = (await harness.invoke('claude:start', owner, {})) as { id: string }

    await harness.invoke('claude:close', fakeWebContents(), id)
    await harness.invoke('claude:close', owner, 42)

    expect(spies.closed).toBe(0)
  })
})

describe('claude:authStatus and claude:logout', () => {
  beforeEach(() => {
    harness.reset()
    registerClaudeHandlers()
  })

  it('reloading the view aborts the running `claude auth …`', async () => {
    const wc = fakeWebContents()
    let signal: AbortSignal | undefined
    cliImpl = (_args, ctx) => {
      signal = ctx.signal
      return new Promise((_resolve, reject) =>
        ctx.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      )
    }
    const pending = harness.invoke('claude:logout', wc)
    while (!signal) await new Promise((r) => setTimeout(r, 5))
    expect(signal.aborted).toBe(false)

    wc.emit('did-navigate')

    await expect(pending).rejects.toThrow('aborted')
    expect(signal.aborted).toBe(true)
  })

  it('finishing releases the controller: the next reset aborts nothing', async () => {
    const wc = fakeWebContents()
    let signal: AbortSignal | undefined
    cliImpl = (_args, ctx) => {
      signal = ctx.signal
      return Promise.resolve('{"loggedIn":true}')
    }
    await harness.invoke('claude:authStatus', wc)
    wc.emit('did-navigate')
    expect(signal?.aborted).toBe(false)
  })
})

describe('argument validation before the conversation', () => {
  beforeEach(() => {
    harness.reset()
    registerClaudeHandlers()
    spies.calls = []
    startImpl = () => Promise.resolve({})
  })

  const cases: Array<[string, string, unknown[]]> = [
    ['claude:stopTask', 'stopTask', [42]],
    ['claude:setModel', 'setModel', ['-m x']],
    ['claude:mcpToggle', 'mcp.toggle', ['srv', 'sim']],
    ['claude:mcpToggle', 'mcp.toggle', ['', true]],
    ['claude:mcpReconnect', 'mcp.reconnect', [42]],
    ['claude:mcpAuthenticate', 'mcp.authenticate', ['']],
    ['claude:mcpSubmitCallback', 'mcp.submitCallback', ['srv', 'javascript:alert(1)']],
    ['claude:mcpClearAuth', 'mcp.clearAuth', [null]],
    ['claude:mcpAdd', 'mcp.add', [null]],
    ['claude:mcpRemove', 'mcp.remove', ['srv', 'enterprise']]
  ]

  it.each(cases)(
    '%s with an invalid argument rejects and does not call the conversation (%s)',
    async (channel, method, args) => {
      const wc = fakeWebContents()
      const { id } = (await harness.invoke('claude:start', wc, {})) as { id: string }

      await expect(harness.invoke(channel, wc, id, ...args)).rejects.toThrow()

      expect(spies.calls).not.toContain(method)
    }
  )

  it('with valid arguments the conversation is called', async () => {
    const wc = fakeWebContents()
    const { id } = (await harness.invoke('claude:start', wc, {})) as { id: string }

    await harness.invoke('claude:stopTask', wc, id, 'task-1')

    expect(spies.calls).toEqual(['stopTask'])
  })
})
