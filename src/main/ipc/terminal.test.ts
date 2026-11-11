import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const ptys = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock('electron', () => harness.electronMock)
vi.mock('node-pty', () => ({ spawn: ptys.spawn }))
vi.mock('../window/windows', () => ({
  getSenderRoot: () => null,
  onWorkspaceEvent: () => () => undefined,
  hostOf: () => null,
  activeContents: () => null
}))
vi.mock('../settings/state', () => ({ getEffectiveSettings: () => ({}) }))
vi.mock('../terminal/resolveProfile', () => ({
  resolveTerminal: () => ({ file: '/bin/sh', args: [], env: {} }),
  buildTerminalEnv: (base: Record<string, string>) => base
}))

interface FakePty {
  pid: number
  process: string
  kill: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
}

function fakePty(): FakePty {
  return {
    pid: 1,
    process: 'zsh',
    kill: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() }))
  }
}

type Created = { id: string; title: string }
const create = (wc: FakeWebContents, options: unknown = {}): Promise<Created> =>
  harness.invoke('terminal:create', wc, options) as Promise<Created>

beforeAll(async () => {
  const { registerTerminalHandlers } = await import('./terminal')
  registerTerminalHandlers()
})

beforeEach(() => {
  ptys.spawn.mockReset()
  ptys.spawn.mockImplementation(() => fakePty())
})

describe('terminal: ptys tied to the view', () => {
  it('reloading the view kills only its ptys', async () => {
    const a = fakeWebContents()
    const b = fakeWebContents()
    const [first, second] = [await create(a), await create(a)]
    const other = await create(b)
    const [pa1, pa2, pb] = ptys.spawn.mock.results.map((r) => r.value as FakePty)
    expect([first.id, second.id, other.id]).toHaveLength(3)

    a.emit('did-navigate')

    expect(pa1.kill).toHaveBeenCalledTimes(1)
    expect(pa2.kill).toHaveBeenCalledTimes(1)
    expect(pb.kill).not.toHaveBeenCalled()
  })

  it('ignores write, resize and kill for an id from another view', async () => {
    const a = fakeWebContents()
    const b = fakeWebContents()
    const { id } = await create(a)
    const pty = ptys.spawn.mock.results[0].value as FakePty

    harness.emit('terminal:write', b, id, 'ls\n')
    harness.emit('terminal:resize', b, id, 100, 30)
    harness.emit('terminal:kill', b, id)
    expect(pty.write).not.toHaveBeenCalled()
    expect(pty.resize).not.toHaveBeenCalled()
    expect(pty.kill).not.toHaveBeenCalled()
    expect(await harness.invoke('terminal:cwd', b, id)).toBeNull()
    expect(await harness.invoke('terminal:resolveLink', b, id, 'a.ts')).toBeNull()

    harness.emit('terminal:write', a, id, 'ls\n')
    harness.emit('terminal:resize', a, id, 100, 30)
    expect(pty.write).toHaveBeenCalledWith('ls\n')
    expect(pty.resize).toHaveBeenCalledWith(100, 30)
    harness.emit('terminal:kill', a, id)
    expect(pty.kill).toHaveBeenCalledTimes(1)
  })
})

describe('terminal: Claude login commands and Docker exec', () => {
  it('claudeLogin aborts, without opening the pty, if the view restarts during the await', async () => {
    const { registerTerminalSource } = await import('../terminal/launchSources')
    let resolveLogin: (value: { file: string; args: string[]; env: Record<string, string> }) => void = () => undefined
    const started = vi.fn()
    registerTerminalSource('claudeLogin', () => {
      started()
      return new Promise((resolve) => {
        resolveLogin = resolve
      })
    })
    const wc = fakeWebContents()
    const pending = create(wc, { claudeLogin: true })
    await vi.waitFor(() => expect(started).toHaveBeenCalled())

    wc.emit('did-navigate')
    resolveLogin({ file: '/usr/bin/true', args: [], env: {} })

    await expect(pending).rejects.toThrow('recarregada ou fechada antes de o login abrir')
    expect(ptys.spawn).not.toHaveBeenCalled()
  })

  it('claudeLogin without a reset opens the pty with the source command', async () => {
    const { registerTerminalSource } = await import('../terminal/launchSources')
    registerTerminalSource('claudeLogin', () =>
      Promise.resolve({ file: '/usr/bin/true', args: ['auth', 'login'], env: { A: '1' } })
    )
    await create(fakeWebContents(), { claudeLogin: true })
    expect(ptys.spawn).toHaveBeenCalledWith(
      '/usr/bin/true',
      ['auth', 'login'],
      expect.objectContaining({ env: { A: '1' } })
    )
  })

  it('dockerExec forwards the id to the registry and aborts if the view restarts', async () => {
    const { registerTerminalSource } = await import('../terminal/launchSources')
    const source = vi.fn(() => Promise.resolve({ file: 'docker', args: ['exec', '-it', '--', 'abc', 'sh'], env: {} }))
    registerTerminalSource('dockerExec', source)
    const wc = fakeWebContents()
    await create(wc, { dockerExec: 'abc' })
    expect(source).toHaveBeenCalledWith(wc, 'abc')

    registerTerminalSource('dockerExec', async () => {
      wc.emit('did-navigate')
      return { file: 'docker', args: [], env: {} }
    })
    ptys.spawn.mockClear()
    await expect(create(wc, { dockerExec: 'abc' })).rejects.toThrow('recarregada ou fechada')
    expect(ptys.spawn).not.toHaveBeenCalled()
  })
})
