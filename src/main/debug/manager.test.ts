import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import type { DebugEvent } from '@shared/types'
import type { GroupProcess } from '../process/spawnGroup'
import type { DapStreams } from './connection'
import { createDapParser, encodeDapMessage } from './framing'
import { DebugManager, type DebugManagerDeps } from './manager'
import type { AdapterCallbacks, AdapterHandle } from './transport'

type Args = Record<string, unknown>
type Handler = (args: Args, adapter: FakeAdapter) => unknown

/** Fake DAP adapter over two PassThrough streams: replies through `handlers` and records what it received. */
class FakeAdapter {
  readonly toAdapter = new PassThrough()
  readonly toClient = new PassThrough()
  readonly received: Array<{ command: string; arguments: Args }> = []
  private seq = 1
  private readonly reverse = new Map<number, (response: Args) => void>()
  private readonly waiters: Array<{ command: string; resolve: () => void }> = []

  constructor(private readonly handlers: Record<string, Handler>) {
    const parser = createDapParser()
    this.toAdapter.on('data', (chunk: Buffer) => {
      for (const raw of parser.feed(chunk)) void this.onMessage(raw as Args)
    })
  }

  streams(): DapStreams {
    return { input: this.toClient, output: this.toAdapter, close: () => this.toClient.end() }
  }

  event(event: string, body?: unknown): void {
    this.toClient.write(encodeDapMessage({ seq: this.seq++, type: 'event', event, body }))
  }

  request(command: string, args: unknown): Promise<Args> {
    const seq = this.seq++
    const answer = new Promise<Args>((resolve) => this.reverse.set(seq, resolve))
    this.toClient.write(encodeDapMessage({ seq, type: 'request', command, arguments: args }))
    return answer
  }

  waitFor(command: string): Promise<void> {
    if (this.received.some((r) => r.command === command)) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push({ command, resolve }))
  }

  commands(): string[] {
    return this.received.map((r) => r.command)
  }

  private async onMessage(message: Args): Promise<void> {
    if (message.type === 'response') {
      this.reverse.get(message.request_seq as number)?.(message)
      return
    }
    const command = message.command as string
    const args = (message.arguments ?? {}) as Args
    this.received.push({ command, arguments: args })
    for (const w of this.waiters.filter((x) => x.command === command)) w.resolve()
    const handler = this.handlers[command] ?? (() => ({}))
    const respond = (success: boolean, extra: Args): void => {
      this.toClient.write(
        encodeDapMessage({ seq: this.seq++, type: 'response', request_seq: message.seq, command, success, ...extra })
      )
    }
    try {
      const body = await handler(args, this)
      respond(true, body === undefined ? {} : { body })
    } catch (err) {
      respond(false, { message: (err as Error).message })
    }
  }
}

const defaultHandlers = (): Record<string, Handler> => ({
  initialize: () => ({
    supportsConfigurationDoneRequest: true,
    supportsConditionalBreakpoints: true,
    supportsTerminateRequest: true
  }),
  // Like debugpy: `initialized` right away, the `launch` response only after `configurationDone`.
  launch: async (_args, adapter) => {
    adapter.event('initialized')
    await adapter.waitFor('configurationDone')
    return {}
  },
  setBreakpoints: (args) => ({
    breakpoints: (args.breakpoints as Array<{ line: number }>).map((b, i) => ({
      id: i + 1,
      verified: true,
      line: b.line
    }))
  }),
  threads: () => ({ threads: [{ id: 1, name: 'MainThread' }] }),
  stackTrace: () => ({ stackFrames: [{ id: 10, name: 'main', line: 3, column: 1, source: { path: '/w/app.py' } }] }),
  continue: () => ({ allThreadsContinued: true }),
  terminate: (_args, adapter) => {
    adapter.event('terminated')
    return {}
  },
  disconnect: (_args, adapter) => {
    setTimeout(() => adapter.toClient.end(), 0)
    return {}
  }
})

interface Harness {
  manager: DebugManager
  events: DebugEvent[]
  adapters: FakeAdapter[]
  callbacks: () => AdapterCallbacks
  killed: () => number
  files: Map<string, string>
}

function setup(
  options: { handlers?: Record<string, Handler>; tcp?: boolean; files?: Record<string, string> } = {}
): Harness {
  const events: DebugEvent[] = []
  const adapters: FakeAdapter[] = []
  const files = new Map(Object.entries(options.files ?? {}))
  let callbacks: AdapterCallbacks | null = null
  let kills = 0
  const deps: DebugManagerDeps = {
    getRoot: () => '/w',
    getAdapters: () => ({}),
    emit: (event) => events.push(event),
    resolveLaunch: (adapter, cwd) => Promise.resolve({ adapter, file: '/usr/bin/python3', env: {}, cwd }),
    startAdapter: (_launch, cb) => {
      callbacks = cb
      let markClosed!: () => void
      const closed = new Promise<void>((resolve) => (markClosed = resolve))
      let connections = 0
      const handle: AdapterHandle = {
        proc: { exited: false, closed, kill: () => markClosed() } as unknown as GroupProcess,
        command: 'python3 -m debugpy.adapter',
        connect: () => {
          if (!options.tcp && connections > 0) return Promise.resolve(null)
          connections++
          const adapter = new FakeAdapter({ ...defaultHandlers(), ...options.handlers })
          adapters.push(adapter)
          return Promise.resolve(adapter.streams())
        },
        kill: () => {
          kills++
          markClosed()
        }
      }
      return Promise.resolve(handle)
    },
    createFile: (path, text) => {
      files.set(path, text)
      return Promise.resolve()
    },
    readText: (path) => Promise.resolve(files.get(path) ?? null),
    platform: 'linux',
    timeouts: { request: 2000, launch: 2000, initialize: 2000, disconnect: 200, lateInitialized: 50 }
  }
  return {
    manager: new DebugManager(deps),
    events,
    adapters,
    callbacks: () => {
      if (!callbacks) throw new Error('adapter not started')
      return callbacks
    },
    killed: () => kills,
    files
  }
}

const LAUNCH_FILE = join('/w', '.vscode', 'launch.json')

const LAUNCH = JSON.stringify({
  configurations: [{ name: 'App', type: 'python', request: 'launch', program: '${file}', preLaunchTask: 'build' }]
})

const sessionsOf = (events: DebugEvent[]) => {
  const last = events.filter((e) => e.kind === 'sessions').at(-1)
  return last?.kind === 'sessions' ? last.sessions : []
}

const until = async (check: () => boolean, ms = 1500): Promise<void> => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not reached')
    await new Promise((r) => setTimeout(r, 5))
  }
}

let current: Harness | null = null
afterEach(() => {
  current?.manager.killAll()
  current = null
})

describe('DebugManager: configurations', () => {
  it('without launch.json offers the defaults; with an error shows the error and none', async () => {
    current = setup()
    const empty = await current.manager.configurations()
    expect(empty.exists).toBe(false)
    expect(empty.file).toBe(LAUNCH_FILE)
    expect(empty.configurations.every((c) => c.builtin)).toBe(true)
    expect(empty.configurations.map((c) => c.type)).toEqual(['python', 'pwa-node'])

    current.files.set(LAUNCH_FILE, '{ "configurations": [')
    const broken = await current.manager.configurations()
    expect(broken.configurations).toEqual([])
    expect(broken.error).toMatch(/launch\.json/)
  })

  it('creates launch.json only if it does not exist', async () => {
    current = setup({ files: { [LAUNCH_FILE]: LAUNCH } })
    expect(await current.manager.createLaunchFile()).toBe(LAUNCH_FILE)
    expect(current.files.get(LAUNCH_FILE)).toBe(LAUNCH)
    current.files.clear()
    await current.manager.createLaunchFile()
    expect(current.files.get(LAUNCH_FILE)).toContain('"configurations"')
  })
})

describe('DebugManager: session', () => {
  it('starts in protocol order, sends the breakpoints and replaces the variables', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    h.manager.setBreakpoints('/w/app.py', [{ line: 3, condition: 'x > 1' }])
    const id = await h.manager.start('App', { file: '/w/app.py' })
    const [adapter] = h.adapters
    expect(adapter?.commands()).toEqual(['initialize', 'launch', 'setBreakpoints', 'configurationDone'])
    expect(adapter?.received[1]?.arguments).toMatchObject({ program: '/w/app.py', request: 'launch', name: 'App' })
    expect(adapter?.received[2]?.arguments).toMatchObject({
      source: { path: '/w/app.py' },
      breakpoints: [{ line: 3, condition: 'x > 1' }]
    })
    expect(sessionsOf(h.events)).toMatchObject([{ id, name: 'App', state: 'running', parentId: null }])
    expect(h.events).toContainEqual({
      kind: 'breakpoints',
      path: '/w/app.py',
      breakpoints: [{ line: 3, verified: true, actualLine: null, message: null }]
    })
    await until(() => h.events.some((e) => e.kind === 'output'))
    const text = h.events.flatMap((e) => (e.kind === 'output' ? e.entries.map((x) => x.text) : [])).join('')
    expect(text).toContain('preLaunchTask')
  })

  it('stopped → stack → continue emits `continued` and runs again', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    const id = await h.manager.start('App', { file: '/w/app.py' })
    const adapter = h.adapters[0]
    adapter?.event('stopped', { reason: 'breakpoint', threadId: 1 })
    await until(() => h.events.some((e) => e.kind === 'stopped'))
    expect(sessionsOf(h.events)[0]).toMatchObject({ state: 'stopped', stoppedThreadId: 1 })
    expect(await h.manager.stackTrace(id, 1)).toEqual([
      { id: 10, name: 'main', path: '/w/app.py', sourceName: 'app.py', line: 3, column: 1, hint: 'normal' }
    ])
    await h.manager.control(id, 'continue', null)
    expect(adapter?.received.at(-1)).toEqual({ command: 'continue', arguments: { threadId: 1 } })
    expect(h.events.at(-1)).toEqual({ kind: 'continued', sessionId: id, threadId: 1, allThreadsContinued: true })
    expect(sessionsOf(h.events)[0]?.state).toBe('running')
  })

  it('new breakpoints during the session go straight to the adapter', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    await h.manager.start('App', { file: '/w/app.py' })
    h.manager.setBreakpoints('/w/b.py', [{ line: 8 }])
    await until(() => h.adapters[0]?.commands().at(-1) === 'setBreakpoints')
    expect(h.adapters[0]?.received.at(-1)?.arguments).toMatchObject({ source: { path: '/w/b.py' }, lines: [8] })
  })

  it('stop: terminate + disconnect, the list empties and the adapter dies', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    const id = await h.manager.start('App', { file: '/w/app.py' })
    await h.manager.stop(id)
    await until(() => sessionsOf(h.events).length === 0)
    expect(h.adapters[0]?.commands()).toContain('terminate')
    await until(() => h.killed() > 0, 3000)
    expect(h.events.some((e) => e.kind === 'error')).toBe(false)
  })

  it('an adapter that crashes becomes a translated error and clears the sessions', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    await h.manager.start('App', { file: '/w/app.py' })
    h.callbacks().onStderr('Traceback: boom')
    h.callbacks().onExit(1, null, null)
    await until(() => h.events.some((e) => e.kind === 'error'))
    const error = h.events.find((e) => e.kind === 'error')
    expect(error?.kind === 'error' && error.message).toMatch(/código 1.*Traceback: boom/)
    expect(sessionsOf(h.events)).toEqual([])
    await expect(h.manager.threads('x')).rejects.toThrow(/já terminou/)
  })

  it('a channel that closes before `exit` waits for the code to explain the crash', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    await h.manager.start('App', { file: '/w/app.py' })
    h.callbacks().onStderr('No module named debugpy')
    h.adapters[0]?.toClient.end()
    await until(() => sessionsOf(h.events).length === 0)
    expect(h.events.some((e) => e.kind === 'error')).toBe(false)
    h.callbacks().onExit(1, null, null)
    await until(() => h.events.some((e) => e.kind === 'error'))
    const error = h.events.find((e) => e.kind === 'error')
    expect(error?.kind === 'error' && error.message).toMatch(/código 1.*No module named debugpy/)
  })

  it('switching folders during start ends the session that was starting', async () => {
    const h = (current = setup({
      files: { [LAUNCH_FILE]: LAUNCH },
      handlers: { launch: () => new Promise(() => undefined) }
    }))
    const starting = h.manager.start('App', { file: '/w/app.py' })
    await until(() => h.adapters[0]?.commands().includes('launch') ?? false)
    await h.manager.resetForFolder()
    await expect(starting).rejects.toThrow(/já terminou|comunicação/)
    await until(() => sessionsOf(h.events).length === 0)
  })

  it('a program that ends before the launch response is not a failure', async () => {
    const h = (current = setup({
      files: { [LAUNCH_FILE]: LAUNCH },
      handlers: {
        launch: (_args, adapter) => {
          adapter.event('terminated')
          return new Promise(() => undefined)
        }
      }
    }))
    await expect(h.manager.start('App', { file: '/w/app.py' })).resolves.toBeTypeOf('string')
    await until(() => sessionsOf(h.events).length === 0)
  })

  it('a launch refusal rejects start without an error event', async () => {
    const h = (current = setup({
      files: { [LAUNCH_FILE]: LAUNCH },
      handlers: {
        launch: () => {
          throw new Error('program not found')
        }
      }
    }))
    await expect(h.manager.start('App', { file: '/w/app.py' })).rejects.toThrow('Depurador: program not found')
    await until(() => sessionsOf(h.events).length === 0)
    expect(h.events.some((e) => e.kind === 'error')).toBe(false)
  })

  it('configuration errors: no file for ${file}, unknown name, type without adapter', async () => {
    const h = (current = setup({
      files: {
        [LAUNCH_FILE]: JSON.stringify({
          configurations: [
            { name: 'App', type: 'python', request: 'launch', program: '${file}' },
            { name: 'Go', type: 'go', request: 'launch' }
          ]
        })
      }
    }))
    await expect(h.manager.start('App', {})).rejects.toThrow(/arquivo aberto/)
    await expect(h.manager.start('Nope', {})).rejects.toThrow(/não encontrada/)
    await expect(h.manager.start('Go', {})).rejects.toThrow(/debug\.adapters/)
  })
})

describe('DebugManager: reverse requests', () => {
  it('runInTerminal: ticket to the renderer, pid back to the adapter', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    await h.manager.start('App', { file: '/w/app.py' })
    const reply = h.adapters[0]?.request('runInTerminal', {
      kind: 'integrated',
      title: 'Py',
      args: ['/usr/bin/python3', 'a.py']
    })
    await until(() => h.events.some((e) => e.kind === 'runInTerminal'))
    const event = h.events.find((e) => e.kind === 'runInTerminal')
    const ticket = event?.kind === 'runInTerminal' ? event.ticket : ''
    const request = h.manager.takeRunTicket(ticket)
    expect(request).toMatchObject({ file: '/usr/bin/python3', args: ['a.py'], cwd: '/w', title: 'Py' })
    expect(h.manager.takeRunTicket(ticket)).toBeNull()
    request?.settle(4242)
    expect(await reply).toMatchObject({ success: true, body: { processId: 4242 } })
  })

  it('startDebugging (TCP): child session with its parent, ended together with it', async () => {
    const h = (current = setup({ tcp: true, files: { [LAUNCH_FILE]: LAUNCH } }))
    const id = await h.manager.start('App', { file: '/w/app.py' })
    const reply = h.adapters[0]?.request('startDebugging', {
      request: 'attach',
      configuration: { type: 'pwa-node', __pendingTargetId: 'abc' }
    })
    expect(await reply).toMatchObject({ success: true })
    await until(() => sessionsOf(h.events).some((s) => s.parentId === id && s.state === 'running'))
    expect(h.adapters[1]?.received[1]).toMatchObject({
      command: 'attach',
      arguments: { name: 'App', type: 'pwa-node', __pendingTargetId: 'abc' }
    })
    await h.manager.stop(id)
    await until(() => sessionsOf(h.events).length === 0)
  })

  it('startDebugging without TCP is refused', async () => {
    const h = (current = setup({ files: { [LAUNCH_FILE]: LAUNCH } }))
    await h.manager.start('App', { file: '/w/app.py' })
    const reply = await h.adapters[0]?.request('startDebugging', { request: 'launch', configuration: {} })
    expect(reply).toMatchObject({ success: false })
  })
})
