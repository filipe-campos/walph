import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import type {
  DockerApi,
  DockerContainer,
  DockerInfo,
  DockerInspect,
  DockerList,
  DockerLogLine,
  DockerStatsSample
} from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'
import { toastTitles } from './test/toastTitles'

const createTerminal = vi.fn()
const askClaude = vi.fn()
vi.mock('./terminalActions', () => ({ createTerminal: (options: object) => createTerminal(options) }))
vi.mock('./claudePromptActions', () => ({ askClaude: (text: string) => askClaude(text) }))

const info = vi.fn<DockerApi['info']>()
const list = vi.fn<DockerApi['list']>()
const action = vi.fn<DockerApi['action']>()
const composeAction = vi.fn<DockerApi['composeAction']>()
const composeUpWorkspace = vi.fn<DockerApi['composeUpWorkspace']>()
const followLogs = vi.fn<DockerApi['followLogs']>()
const inspect = vi.fn<DockerApi['inspect']>()
const investigationPrompt = vi.fn<DockerApi['investigationPrompt']>()
const { api, emit } = installFakeApi({
  docker: {
    info: () => info(),
    list: (options) => list(options),
    action: (id, act) => action(id, act),
    composeAction: (project, act) => composeAction(project, act),
    composeUpWorkspace: () => composeUpWorkspace(),
    followLogs: (id) => followLogs(id),
    inspect: (id) => inspect(id),
    investigationPrompt: (id) => investigationPrompt(id)
  }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const docker = await import('./dockerActions')
const { registerCommand, executeCommand } = await import('./commands/registry')
const { registerRegion } = await import('./focusBridge')

const OK: DockerInfo = { ok: true, context: 'default', version: '27', memTotal: 1, cpus: 1 }
const DOWN: DockerInfo = { ok: false, reason: 'daemonDown', message: 'daemon stopped' }
const NOT_INSTALLED: DockerInfo = { ok: false, reason: 'notInstalled', message: 'no docker' }

function container(id: string, patch: Partial<DockerContainer> = {}): DockerContainer {
  return {
    id,
    name: `name-${id}`,
    image: 'img',
    state: 'running',
    status: 'Up',
    health: null,
    ports: [],
    uptime: null,
    project: null,
    service: null,
    workingDir: null,
    ...patch
  }
}
const listOf = (...ids: string[]): DockerList => ({
  containers: ids.map((id) => container(id)),
  workspaceComposeFile: null
})
const line = (text: string): DockerLogLine => ({ time: null, text, level: 'info', stream: 'stdout' })
const dockerState = () => useStore.getState().docker
const flushTimers = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

let frames: FrameRequestCallback[]
const flushFrames = (): void => {
  const pending = frames.splice(0)
  for (const cb of pending) cb(0)
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  resetStore()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  info.mockResolvedValue(OK)
  list.mockResolvedValue(listOf('a'))
  followLogs.mockResolvedValue(1)
  action.mockResolvedValue(undefined)
  composeAction.mockResolvedValue(undefined)
  composeUpWorkspace.mockResolvedValue(undefined)
})

describe('refreshDocker', () => {
  it('reads info and list and stores them', async () => {
    await docker.refreshDocker()
    expect(dockerState()).toMatchObject({ info: OK, list: listOf('a'), loading: false, listError: null })
  })

  it('reuses an info that already answered ok, unless a full read is requested', async () => {
    await docker.refreshDocker()
    await docker.refreshDocker()
    expect(info).toHaveBeenCalledTimes(1)
    await docker.refreshDocker(true)
    expect(info).toHaveBeenCalledTimes(2)
  })

  it('repeats info while Docker was unavailable', async () => {
    info.mockResolvedValueOnce(DOWN)
    await docker.refreshDocker()
    await docker.refreshDocker()
    expect(info).toHaveBeenCalledTimes(2)
    expect(dockerState().info).toEqual(OK)
  })

  it('unavailable Docker clears list and samples and does not request the list', async () => {
    useStore.setState((s) => ({ docker: { ...s.docker, list: listOf('a'), stats: { a: {} as DockerStatsSample } } }))
    info.mockResolvedValue(DOWN)
    await docker.refreshDocker()
    expect(list).not.toHaveBeenCalled()
    expect(dockerState()).toMatchObject({ info: DOWN, list: null, stats: {}, loading: false })
  })

  it('the background read asks main for the cached result', async () => {
    await docker.refreshDocker(false, true)
    expect(list).toHaveBeenCalledWith({ background: true })
    await docker.refreshDocker()
    expect(list).toHaveBeenLastCalledWith(undefined)
  })

  it('restarts docker stats when Docker responds again with the screen open', async () => {
    useStore.setState({ screen: 'containers' })
    info.mockResolvedValueOnce(DOWN)
    await docker.refreshDocker()
    expect(api.docker.startStats).not.toHaveBeenCalled()
    await docker.refreshDocker()
    expect(api.docker.startStats).toHaveBeenCalledTimes(1)
  })

  it('a list failure while Docker responds shows the error and keeps the previous list', async () => {
    await docker.refreshDocker()
    list.mockRejectedValue(new Error('timeout'))
    await docker.refreshDocker()
    expect(dockerState()).toMatchObject({ listError: 'timeout', loading: false, list: listOf('a') })
  })

  it('a list failure because the daemon went down meanwhile clears the list', async () => {
    await docker.refreshDocker()
    list.mockRejectedValue(new Error('cannot connect'))
    info.mockResolvedValue(DOWN)
    await docker.refreshDocker(true)
    expect(dockerState()).toMatchObject({ info: DOWN, list: null, listError: null })
  })

  it('a failure of info itself becomes a list error without leaving loading stuck', async () => {
    info.mockRejectedValue(new Error('ipc down'))
    await docker.refreshDocker()
    expect(dockerState()).toMatchObject({ loading: false, listError: 'ipc down' })
  })

  it('only the latest call counts: the slow stale answer is discarded', async () => {
    await docker.refreshDocker()
    const slow = deferred<DockerList>()
    list.mockReturnValueOnce(slow.promise)
    list.mockResolvedValueOnce(listOf('new'))
    const first = docker.refreshDocker()
    await docker.refreshDocker()
    slow.resolve(listOf('old'))
    await first
    expect(dockerState().list).toEqual(listOf('new'))
  })

  it('the error of a stale call does not show after a newer call succeeded', async () => {
    await docker.refreshDocker()
    const slow = deferred<DockerList>()
    list.mockReturnValueOnce(slow.promise)
    list.mockResolvedValueOnce(listOf('new'))
    const first = docker.refreshDocker()
    await docker.refreshDocker()
    slow.reject(new Error('old timeout'))
    await first
    expect(dockerState()).toMatchObject({ list: listOf('new'), listError: null })
  })

  it('the container open in the detail that vanished from the list closes the detail', async () => {
    docker.openContainerDetail('x')
    expect(dockerState().selectedId).toBe('x')
    await docker.refreshDocker()
    expect(dockerState()).toMatchObject({ selectedId: null, logs: null })
    expect(api.docker.stopLogs).toHaveBeenCalled()
  })

  it('Docker going down also closes the detail', async () => {
    docker.openContainerDetail('a')
    info.mockResolvedValue(DOWN)
    await docker.refreshDocker(true)
    expect(dockerState().selectedId).toBeNull()
  })

  it('the detail of a container still in the list stays open', async () => {
    docker.openContainerDetail('a')
    await docker.refreshDocker()
    expect(dockerState().selectedId).toBe('a')
  })
})

describe('actions', () => {
  it('a container action marks busy, runs, rereads the list and releases', async () => {
    const gate = deferred<void>()
    action.mockReturnValue(gate.promise)
    const run = docker.runContainerAction('a', 'restart')
    expect(dockerState().busy).toEqual({ a: true })
    gate.resolve()
    await run
    expect(action).toHaveBeenCalledWith('a', 'restart')
    expect(list).toHaveBeenCalledTimes(1)
    expect(dockerState().busy).toEqual({})
  })

  it('a second click while busy is ignored', async () => {
    const gate = deferred<void>()
    action.mockReturnValue(gate.promise)
    const first = docker.runContainerAction('a', 'stop')
    await docker.runContainerAction('a', 'stop')
    gate.resolve()
    await first
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('a failure notifies the user, rereads the list and releases the button', async () => {
    action.mockRejectedValue(new Error('port in use'))
    await docker.runContainerAction('a', 'start')
    expect(toastTitles()).toEqual(['port in use'])
    expect(list).toHaveBeenCalledTimes(1)
    expect(dockerState().busy).toEqual({})
  })

  it('a compose project action uses the project:<name> key', async () => {
    const gate = deferred<void>()
    composeAction.mockReturnValue(gate.promise)
    const run = docker.runComposeAction('web', 'up')
    expect(dockerState().busy).toEqual({ 'project:web': true })
    gate.resolve()
    await run
    expect(composeAction).toHaveBeenCalledWith('web', 'up')
  })

  it('header Compose up runs in the workspace folder', async () => {
    useStore.setState({ root: '/r' })
    await docker.composeUpWorkspace()
    expect(composeUpWorkspace).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('Compose up with the folder switched meanwhile: no error notice and no list reread', async () => {
    useStore.setState({ root: '/r' })
    composeUpWorkspace.mockImplementation(async () => {
      useStore.setState({ root: '/other' })
      throw new Error('compose failed')
    })
    await docker.composeUpWorkspace()
    expect(toastTitles()).toEqual([])
    expect(list).not.toHaveBeenCalled()
    expect(dockerState().busy).toEqual({})
  })

  it('the container terminal runs docker exec in the panel', async () => {
    await docker.openContainerTerminal(container('abc', { name: 'api' }))
    expect(createTerminal).toHaveBeenCalledWith({ dockerExec: 'abc', title: 'docker exec api' })
  })
})

describe('investigateContainer', () => {
  it('without an open folder notifies and does not request the prompt', async () => {
    await docker.investigateContainer(container('a'))
    expect(toastTitles()).toEqual([t().containers.problem.needsFolder])
    expect(investigationPrompt).not.toHaveBeenCalled()
  })

  it("sends main's prompt to Claude and leaves the Containers screen", async () => {
    useStore.setState({ root: '/r', screen: 'containers' })
    investigationPrompt.mockResolvedValue('logs + inspect')
    await docker.investigateContainer(container('a'))
    expect(askClaude).toHaveBeenCalledWith('logs + inspect')
    expect(useStore.getState().screen).toBe('workbench')
    expect(dockerState().busy).toEqual({})
  })

  it('a failure building the prompt notifies and releases busy', async () => {
    useStore.setState({ root: '/r' })
    investigationPrompt.mockRejectedValue(new Error('no logs'))
    await docker.investigateContainer(container('a'))
    expect(askClaude).not.toHaveBeenCalled()
    expect(toastTitles()).toEqual(['no logs'])
    expect(dockerState().busy).toEqual({})
  })

  it('a running investigation of the same container does not duplicate the request', async () => {
    useStore.setState({ root: '/r' })
    const gate = deferred<string>()
    investigationPrompt.mockReturnValue(gate.promise)
    const first = docker.investigateContainer(container('a'))
    await docker.investigateContainer(container('a'))
    gate.resolve('p')
    await first
    expect(investigationPrompt).toHaveBeenCalledTimes(1)
  })
})

describe('detail: logs and inspect', () => {
  let stopReactions: () => void
  beforeEach(() => {
    docker.takeDetailFocusRequest()
    stopReactions = docker.startDockerReactions()
  })
  afterEach(() => {
    stopReactions()
    vi.useRealTimers()
  })

  it('opening follows the logs and stores the returned seq', async () => {
    docker.openContainerDetail('a')
    expect(dockerState()).toMatchObject({ selectedId: 'a', detailTab: 'logs', logs: { id: 'a', seq: null } })
    await vi.waitFor(() => expect(dockerState().logs?.seq).toBe(1))
  })

  it('log batches arrive per frame and only those of the current seq count', async () => {
    docker.openContainerDetail('a')
    await vi.waitFor(() => expect(dockerState().logs?.seq).toBe(1))
    emit.docker.onLogs({ seq: 1, lines: [line('one')] })
    emit.docker.onLogs({ seq: 99, lines: [line('from another follow')] })
    emit.docker.onLogs({ seq: 1, lines: [line('two')] })
    flushFrames()
    expect(dockerState().logs?.lines.map((l) => l.text)).toEqual(['one', 'two'])
  })

  it('the end of the follow marks it ended with the error', async () => {
    docker.openContainerDetail('a')
    await vi.waitFor(() => expect(dockerState().logs?.seq).toBe(1))
    emit.docker.onLogsEnd({ seq: 1, error: 'container stopped' })
    flushFrames()
    expect(dockerState().logs).toMatchObject({ ended: true, error: 'container stopped' })
  })

  it('batches arriving before the seq wait and are applied when it arrives', async () => {
    const seq = deferred<number>()
    followLogs.mockReturnValue(seq.promise)
    docker.openContainerDetail('a')
    emit.docker.onLogs({ seq: 5, lines: [line('early')] })
    flushFrames()
    expect(dockerState().logs?.lines).toEqual([])
    seq.resolve(5)
    await vi.waitFor(() => expect(dockerState().logs?.lines.map((l) => l.text)).toEqual(['early']))
  })

  it('a failure following the logs ends the log with the message', async () => {
    followLogs.mockRejectedValue(new Error('permission denied'))
    docker.openContainerDetail('a')
    await vi.waitFor(() => expect(dockerState().logs).toMatchObject({ ended: true, error: 'permission denied' }))
  })

  it('opening another container before the answer discards the first seq', async () => {
    const first = deferred<number>()
    followLogs.mockReturnValueOnce(first.promise)
    followLogs.mockResolvedValueOnce(2)
    docker.openContainerDetail('a')
    docker.openContainerDetail('b')
    await vi.waitFor(() => expect(dockerState().logs).toMatchObject({ id: 'b', seq: 2 }))
    first.resolve(1)
    await flushTimers()
    expect(dockerState().logs).toMatchObject({ id: 'b', seq: 2 })
  })

  it('opening on the details tab loads the inspect', async () => {
    const data = { id: 'a' } as DockerInspect
    inspect.mockResolvedValue(data)
    docker.openContainerDetail('a', 'details')
    await vi.waitFor(() => expect(dockerState().inspect).toEqual({ id: 'a', data, error: null }))
  })

  it('the inspect error stays in the detail state', async () => {
    inspect.mockRejectedValue(new Error('removed'))
    docker.openContainerDetail('a', 'details')
    await vi.waitFor(() => expect(dockerState().inspect).toEqual({ id: 'a', data: null, error: 'removed' }))
  })

  it('an inspect arriving after the detail changed is discarded', async () => {
    const slow = deferred<DockerInspect>()
    inspect.mockReturnValueOnce(slow.promise)
    docker.openContainerDetail('a', 'details')
    docker.openContainerDetail('b')
    slow.resolve({ id: 'a' } as DockerInspect)
    await flushTimers()
    expect(dockerState().inspect).toBeNull()
  })

  it('reopening the same container only switches the tab, without restarting the follow', async () => {
    inspect.mockResolvedValue({ id: 'a' } as DockerInspect)
    docker.openContainerDetail('a')
    docker.openContainerDetail('a', 'details')
    expect(followLogs).toHaveBeenCalledTimes(1)
    expect(dockerState().detailTab).toBe('details')
    await vi.waitFor(() => expect(dockerState().inspect?.data).not.toBeNull())
  })

  it('setDetailTab rereads the inspect each time the details tab opens', async () => {
    inspect.mockResolvedValue({ id: 'a' } as DockerInspect)
    docker.openContainerDetail('a')
    docker.setDetailTab('details')
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(1))
    docker.setDetailTab('logs')
    docker.setDetailTab('details')
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(2))
  })

  it('setDetailTab without an open container does nothing', () => {
    docker.setDetailTab('details')
    expect(dockerState().detailTab).toBe('logs')
    expect(inspect).not.toHaveBeenCalled()
  })

  it('dismissContainerDetail stops the follow and returns focus to the opener', () => {
    vi.useFakeTimers()
    const view = document.body.appendChild(document.createElement('div'))
    const opener = view.appendChild(document.createElement('button'))
    const detail = document.body.appendChild(document.createElement('div'))
    const inside = detail.appendChild(document.createElement('input'))
    const off = [registerRegion('containersView', view), registerRegion('containerDetail', detail)]
    opener.focus()
    docker.openContainerDetail('a')
    inside.focus()
    docker.dismissContainerDetail()
    expect(dockerState().selectedId).toBeNull()
    expect(api.docker.stopLogs).toHaveBeenCalled()
    vi.runAllTimers()
    expect(document.activeElement).toBe(opener)
    off.forEach((fn) => fn())
    view.remove()
    detail.remove()
  })

  it('dismissContainerDetail with focus outside the detail leaves focus alone', () => {
    vi.useFakeTimers()
    const view = document.body.appendChild(document.createElement('div'))
    const opener = view.appendChild(document.createElement('button'))
    const detail = document.body.appendChild(document.createElement('div'))
    detail.appendChild(document.createElement('input'))
    const outside = document.body.appendChild(document.createElement('button'))
    const off = [registerRegion('containersView', view), registerRegion('containerDetail', detail)]
    opener.focus()
    docker.openContainerDetail('a')
    outside.focus()
    docker.dismissContainerDetail()
    vi.runAllTimers()
    expect(document.activeElement).toBe(outside)
    off.forEach((fn) => fn())
    view.remove()
    detail.remove()
    outside.remove()
  })

  it('opening with keyboard focus requests the detail focus only once', () => {
    const view = document.body.appendChild(document.createElement('div'))
    const opener = view.appendChild(document.createElement('button'))
    const off = registerRegion('containersView', view)
    opener.focus()
    docker.openContainerDetail('a')
    expect(docker.takeDetailFocusRequest()).toBe(true)
    expect(docker.takeDetailFocusRequest()).toBe(false)
    off()
    view.remove()
  })

  it('opening without focus in the list does not request the detail focus', () => {
    docker.openContainerDetail('a')
    expect(docker.takeDetailFocusRequest()).toBe(false)
  })
})

describe('Containers screen', () => {
  afterEach(() => vi.useRealTimers())

  it('toggleContainers toggles the screen', () => {
    docker.toggleContainers()
    expect(useStore.getState().screen).toBe('containers')
    vi.useFakeTimers()
    docker.toggleContainers()
    expect(useStore.getState().screen).toBe('workbench')
  })

  it('the overlay policy makes ⌘W leave the screen without closing the tab, and other editor commands restore the layout', async () => {
    const stop = docker.startDockerReactions()
    const runClose = vi.fn()
    const runSave = vi.fn()
    const offs = [
      registerCommand({ id: 'workbench.closeTab', title: 'x', category: 'x', run: runClose }),
      registerCommand({ id: 'editor.save', title: 'x', category: 'x', run: runSave }),
      registerCommand({ id: 'workbench.quickOpen', title: 'x', category: 'x', run: () => {} })
    ]
    useStore.setState({ screen: 'containers' })
    await executeCommand('workbench.closeTab')
    expect(runClose).not.toHaveBeenCalled()
    expect(useStore.getState().screen).toBe('workbench')

    useStore.setState({ screen: 'containers' })
    await executeCommand('workbench.quickOpen')
    expect(useStore.getState().screen).toBe('containers')

    await executeCommand('editor.save')
    expect(runSave).toHaveBeenCalledTimes(1)
    expect(useStore.getState().screen).toBe('workbench')
    offs.forEach((off) => off())
    stop()
  })
})

describe('startDockerReactions', () => {
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    stop = docker.startDockerReactions()
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('opening the screen starts stats and reads everything; closing stops it, closes the detail and clears samples', async () => {
    useStore.setState({ screen: 'containers' })
    expect(api.docker.startStats).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(info).toHaveBeenCalledTimes(1)
    docker.openContainerDetail('a')
    useStore.setState((s) => ({ docker: { ...s.docker, stats: { a: {} as DockerStatsSample } } }))
    useStore.setState({ screen: 'workbench' })
    expect(api.docker.stopStats).toHaveBeenCalledTimes(1)
    expect(dockerState()).toMatchObject({ selectedId: null, stats: {} })
  })

  it('with the screen open, refreshes the list every 5 s only while visible and active', async () => {
    useStore.setState({ screen: 'containers' })
    await vi.advanceTimersByTimeAsync(0)
    list.mockClear()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(list).toHaveBeenCalledTimes(1)

    useStore.setState({ viewActive: false })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(list).toHaveBeenCalledTimes(1)

    useStore.setState({ viewActive: true })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('without Docker installed it does not retry on its own', async () => {
    info.mockResolvedValue(NOT_INSTALLED)
    useStore.setState({ screen: 'containers' })
    await vi.advanceTimersByTimeAsync(0)
    info.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(info).not.toHaveBeenCalled()
  })

  it('stats samples are only applied with the screen open', () => {
    const sample = { id: 'a' } as DockerStatsSample
    emit.docker.onStats([sample])
    expect(dockerState().stats).toEqual({})
    useStore.setState({ screen: 'containers' })
    emit.docker.onStats([sample])
    expect(dockerState().stats).toEqual({ a: sample })
  })

  it('the activity bar badge checks in the background after 4 s', async () => {
    await vi.advanceTimersByTimeAsync(4_000)
    expect(list).toHaveBeenCalledWith({ background: true })
  })

  it('the badge does not check with the screen open or the view inactive', async () => {
    useStore.setState({ viewActive: false })
    await vi.advanceTimersByTimeAsync(4_000)
    expect(info).not.toHaveBeenCalled()
  })

  it('switching folders with the screen open closes the detail and rereads', async () => {
    useStore.setState({ root: '/a', screen: 'containers' })
    await vi.advanceTimersByTimeAsync(0)
    docker.openContainerDetail('a')
    list.mockClear()
    useStore.setState({ root: '/b' })
    await vi.advanceTimersByTimeAsync(0)
    expect(dockerState().selectedId).toBeNull()
    expect(list).toHaveBeenCalled()
  })

  it('stopping clears the timers and, with the screen open, stats and logs', async () => {
    useStore.setState({ screen: 'containers' })
    await vi.advanceTimersByTimeAsync(0)
    api.docker.stopStats.mockClear()
    api.docker.stopLogs.mockClear()
    stop()
    expect(api.docker.stopStats).toHaveBeenCalledTimes(1)
    expect(api.docker.stopLogs).toHaveBeenCalledTimes(1)
    list.mockClear()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(list).not.toHaveBeenCalled()
  })
})
