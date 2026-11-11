// Characterization of Claude conversation starts (new, resume, duplicate, /clear, waking a dormant tab, "Start with
// Claude" and auto start): pins only what is observable from outside (calls to `api.claude.*`, tabs and active
// conversation), to survive a change of the internal queue/wait mechanism.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeStartOptions, ClaudeStarted } from '@shared/types'
import { installFakeApi } from './test/fakeApi'

type Gate = { promise: Promise<void>; open: () => void }
function gate(): Gate {
  let open!: () => void
  const promise = new Promise<void>((res) => (open = res))
  return { promise, open }
}

let seq = 0
// How many `start`s are in flight at the same time (main accepts one at a time).
let startsRunning = 0
let maxStartsRunning = 0
// One per call, in order: `undefined` = replies right away; `Error` = fails; `Gate` = waits to open.
let startPlan: Array<undefined | Error | Gate> = []
let startResult: (options: ClaudeStartOptions) => Partial<ClaudeStarted> = () => ({})

const start = vi.fn(async (options: ClaudeStartOptions): Promise<ClaudeStarted> => {
  const step = startPlan.shift()
  startsRunning++
  maxStartsRunning = Math.max(maxStartsRunning, startsRunning)
  try {
    if (step instanceof Error) throw step
    if (step) await step.promise
    return { id: `live-${++seq}`, messages: [], favorite: false, ...startResult(options) }
  } finally {
    startsRunning--
  }
})
const close = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve())
const fork = vi.fn<(id: string) => Promise<string>>(() => Promise.resolve('forked'))
const send = vi.fn<(id: string, input: { text: string }) => Promise<string>>(() => Promise.resolve('uuid'))
const fake = installFakeApi({
  platform: 'darwin',
  claude: {
    start,
    close,
    fork,
    send,
    sessions: () => Promise.resolve([]),
    contextUsage: () => Promise.resolve(null)
  },
  files: { list: () => Promise.resolve({ files: [], truncated: false }) }
})
const onStartRequested = fake.emit.claude.onStartRequested

const { useStore } = await import('./store')
const { newClaudeConversation, resumeSession, showClaude, wakeConversation, retryWake } =
  await import('./claudeLifecycle')
const { duplicateConversation } = await import('./claudeSessionMeta')
const { sendPrompt, askClaude } = await import('./claudePromptActions')
const { startClaudeReactions } = await import('./claudeReactions')
const { createConversation, createDormantConversation } = await import('./lib/claudeConversation')
const { registerPrompt, resetPromptRequests } = await import('./claudePromptBridge')
const { setRestoring } = await import('./sessionActions')

const ROOT = '/repo'
// The mocks resolve right away: after one event loop turn every pending chain has moved, so what has not happened yet
// will not happen. Only for asserting ABSENCE; presence uses `vi.waitFor`.
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
// Hidden panel -> visible with no conversations: the auto start, the public trigger of the first `start`.
const openPanel = (): void => {
  useStore.setState({ claudeVisible: false })
  useStore.setState({ claudeVisible: true })
}
const startsCalled = (n: number) => vi.waitFor(() => expect(start).toHaveBeenCalledTimes(n))

const claude = () => useStore.getState().claude
const tabs = () => claude().conversations
const ids = () => tabs().map((c) => c.id)
const startCalls = () => start.mock.calls.map(([o]) => o)
const toastTitles = () => useStore.getState().toasts.map((t) => t.title)

function conversation(id: string, patch: Record<string, unknown> = {}) {
  const base = createConversation(
    { id, messages: [], favorite: false },
    {
      permissionMode: 'plan',
      model: 'm1'
    }
  )
  return { ...base, ...patch }
}
function dormant(id: string, sessionId: string | null = 's9', patch: Record<string, unknown> = {}) {
  return {
    ...createDormantConversation({ ...(sessionId !== null && { sessionId }), title: 'Restored' }, id, {
      permissionMode: 'plan',
      model: 'm1'
    }),
    ...patch
  }
}
function seed(conversations: ReturnType<typeof conversation>[], activeId: string | null): void {
  useStore.setState((s) => ({ claude: { ...s.claude, conversations: conversations, activeId } }))
}

let stop: () => void
let stopInit: () => void
let unregisterPrompt: (() => void) | undefined

beforeEach(() => {
  seq = 0
  startsRunning = 0
  maxStartsRunning = 0
  startPlan = []
  startResult = () => ({})
  start.mockClear()
  close.mockClear()
  fork.mockClear()
  send.mockClear()
  useStore.setState({
    root: ROOT,
    claudeVisible: true,
    screen: 'workbench',
    viewActive: true,
    workspaces: { selfId: 'w', tabs: [] } as never,
    toasts: [],
    claude: { conversations: [], activeId: null, starting: false, renamingId: null }
  })
  resetPromptRequests()
  stop = startClaudeReactions()
  // The CLI `init` arrives right after `start`: sending waits for it.
  stopInit = useStore.subscribe(
    (s) => s.claude.conversations,
    (list) => {
      if (!list.some((c) => !c.dormant && !(c.ready && c.mcpReady))) return
      useStore.setState((s) => ({
        claude: {
          ...s.claude,
          conversations: s.claude.conversations.map((c) => (c.dormant ? c : { ...c, ready: true, mcpReady: true }))
        }
      }))
    }
  )
})
afterEach(async () => {
  vi.useRealTimers()
  await settled()
  stopInit()
  stop()
  unregisterPrompt?.()
  unregisterPrompt = undefined
  vi.useRealTimers()
})

describe('new conversation', () => {
  it('opens a conversation through main, makes it active and shows the panel', async () => {
    useStore.setState({ claudeVisible: false })
    await newClaudeConversation()
    expect(start).toHaveBeenCalledTimes(1)
    expect(startCalls()[0]).toEqual({})
    expect(ids()).toEqual(['live-1'])
    expect(claude().activeId).toBe('live-1')
    expect(claude().starting).toBe(false)
    expect(useStore.getState().claudeVisible).toBe(true)
  })

  it('uses the settings defaults in the conversation state (mode, model, effort)', async () => {
    useStore.setState((s) => ({
      settings: {
        ...s.settings,
        'claude.initialPermissionMode': 'plan',
        'claude.model': 'opus',
        'claude.effort': 'high'
      }
    }))
    await newClaudeConversation()
    expect(tabs()[0]).toMatchObject({ permissionMode: 'plan', model: 'opus', effort: 'high', sessionId: null })
  })

  it('with an initial conversation still opening, waits for it and reuses it (a single start)', async () => {
    const g = gate()
    startPlan = [g]
    // Hidden panel with root: opening the panel triggers the auto start.
    openPanel()
    expect(start).toHaveBeenCalledTimes(1)
    const done = newClaudeConversation()
    await settled()
    g.open()
    await done
    expect(start).toHaveBeenCalledTimes(1)
    expect(ids()).toEqual(['live-1'])
    expect(claude().activeId).toBe('live-1')
  })

  it('with the active conversation already used, opens a second, new one and activates it', async () => {
    seed([conversation('live-0', { messages: [{ role: 'user' }] })], 'live-0')
    await newClaudeConversation()
    expect(start).toHaveBeenCalledTimes(1)
    expect(ids()).toEqual(['live-0', 'live-1'])
    expect(claude().activeId).toBe('live-1')
  })

  it('failure in main: notifies, creates no conversation and allows trying again', async () => {
    startPlan = [new Error('no login')]
    await newClaudeConversation()
    expect(ids()).toEqual([])
    expect(claude().starting).toBe(false)
    expect(toastTitles()).toEqual(['Claude: no login'])
    await newClaudeConversation()
    expect(ids()).toEqual(['live-1'])
  })

  it('two calls in a row never have two starts in flight and open one conversation each, in order', async () => {
    const g1 = gate()
    startPlan = [g1]
    const a = newClaudeConversation()
    const b = newClaudeConversation()
    await startsCalled(1)
    expect(maxStartsRunning).toBe(1)
    g1.open()
    await Promise.all([a, b])
    expect(maxStartsRunning).toBe(1)
    expect(ids()).toEqual(['live-1', 'live-2'])
  })

  it('without an open folder nothing starts', async () => {
    useStore.setState({ root: null })
    await newClaudeConversation()
    await settled()
    expect(start).not.toHaveBeenCalled()
    expect(ids()).toEqual([])
  })

  it('the folder changed during the start: the conversation is closed and discarded', async () => {
    const g = gate()
    startPlan = [g]
    openPanel()
    await startsCalled(1)
    useStore.setState({ root: '/other', claudeVisible: false })
    g.open()
    await vi.waitFor(() => expect(close).toHaveBeenCalledWith('live-1'))
    await settled()
    expect(ids()).toEqual([])
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('folder changed during the start with the panel open: the auto start retries in the new folder', async () => {
    const g = gate()
    startPlan = [g]
    openPanel()
    await startsCalled(1)
    useStore.setState({ root: '/other' })
    g.open()
    await startsCalled(2)
    await vi.waitFor(() => expect(ids()).toEqual(['live-2']))
  })
})

describe('resume', () => {
  it('opens the session with resume, keeps the sessionId and the messages and activates the tab', async () => {
    startResult = () => ({ messages: [{ role: 'user', id: 'm' } as never], title: 'Old' })
    seed([conversation('live-0', { messages: [{ role: 'user' }] })], 'live-0')
    await resumeSession('s1')
    expect(startCalls()).toEqual([{ resume: 's1' }])
    expect(ids()).toEqual(['live-0', 'live-1'])
    expect(claude().activeId).toBe('live-1')
    expect(tabs()[1]).toMatchObject({ sessionId: 's1', effort: null })
    expect(tabs()[1].messages).toHaveLength(1)
  })

  it('session already open: only activates the tab, no start', async () => {
    seed([conversation('a', { sessionId: 's1' }), conversation('b', { sessionId: 's2' })], 'b')
    await resumeSession('s1')
    expect(start).not.toHaveBeenCalled()
    expect(claude().activeId).toBe('a')
  })

  it('the same session requested twice at the same time opens a single tab', async () => {
    seed([conversation('live-0', { messages: [{ role: 'user' }] })], 'live-0')
    const g = gate()
    startPlan = [g]
    const a = resumeSession('s1')
    const b = resumeSession('s1')
    await settled()
    g.open()
    await Promise.all([a, b])
    expect(start).toHaveBeenCalledTimes(1)
    expect(tabs().filter((c) => c.sessionId === 's1')).toHaveLength(1)
    expect(maxStartsRunning).toBe(1)
  })

  it('different sessions requested together are opened one at a time, in order', async () => {
    seed([conversation('live-0', { messages: [{ role: 'user' }] })], 'live-0')
    const g = gate()
    startPlan = [g]
    const a = resumeSession('s1')
    const b = resumeSession('s2')
    await settled()
    expect(start).toHaveBeenCalledTimes(1)
    g.open()
    await Promise.all([a, b])
    expect(startCalls()).toEqual([{ resume: 's1' }, { resume: 's2' }])
    expect(maxStartsRunning).toBe(1)
    expect(claude().activeId).toBe('live-2')
  })

  it('waits for a start in flight (auto start) before resuming', async () => {
    const g = gate()
    startPlan = [g]
    openPanel()
    const done = resumeSession('s1')
    await settled()
    expect(start).toHaveBeenCalledTimes(1)
    g.open()
    await done
    expect(startCalls()).toEqual([{}, { resume: 's1' }])
    expect(maxStartsRunning).toBe(1)
  })

  it('failure: notifies and opens no tab', async () => {
    startPlan = [new Error('boom')]
    await resumeSession('s1')
    expect(ids()).toEqual([])
    expect(toastTitles()).toEqual(['Claude: boom', 'Claude: não foi possível abrir a conversa agora.'])
  })
})

describe('duplicate', () => {
  it('forks the session and opens the copy as a resumed session, with the same mode', async () => {
    seed([conversation('live-0', { permissionMode: 'acceptEdits', effort: 'high', sessionId: 's1' })], 'live-0')
    await duplicateConversation('live-0')
    expect(fork).toHaveBeenCalledWith('live-0')
    expect(startCalls()).toEqual([{ resume: 'forked', permissionMode: 'acceptEdits', effort: 'high' }])
    expect(ids()).toEqual(['live-0', 'live-1'])
    expect(claude().activeId).toBe('live-1')
    expect(tabs()[1].sessionId).toBe('forked')
  })

  it('dormant tab: tells to wait and does not call main', async () => {
    useStore.setState({ viewActive: false })
    seed([dormant('dormant:1')], 'dormant:1')
    await duplicateConversation('dormant:1')
    expect(fork).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    expect(toastTitles()).toEqual(['Aguarde a conversa ser retomada.'])
  })

  it('fork failure: notifies and opens no tab', async () => {
    seed([conversation('live-0')], 'live-0')
    fork.mockRejectedValueOnce(new Error('no transcript'))
    await duplicateConversation('live-0')
    expect(start).not.toHaveBeenCalled()
    expect(ids()).toEqual(['live-0'])
    expect(toastTitles()).toEqual(['Claude: no transcript'])
  })

  it('a copy created but not opened tells where it is', async () => {
    seed([conversation('live-0')], 'live-0')
    startPlan = [new Error('failed')]
    await duplicateConversation('live-0')
    expect(ids()).toEqual(['live-0'])
    expect(toastTitles()).toEqual([
      'Claude: failed',
      'A cópia foi criada, mas não abriu agora. Ela está em "Conversas anteriores".'
    ])
  })
})

describe('/clear', () => {
  it('replaces the conversation in place (same position, tabKey, active), closes the old, returns true', async () => {
    seed([conversation('live-0', { tabKey: 'k0' }), conversation('live-x'), conversation('live-y')], 'live-x')
    const ok = await sendPrompt('live-x', '/clear', [], false)
    expect(ok).toBe(true)
    expect(startCalls()).toEqual([{ model: 'm1', permissionMode: 'plan' }])
    expect(ids()).toEqual(['live-0', 'live-1', 'live-y'])
    expect(claude().activeId).toBe('live-1')
    expect(close).toHaveBeenCalledExactlyOnceWith('live-x')
    expect(send).not.toHaveBeenCalled()
  })

  it('passes on the conversation effort and accepts spaces around the command', async () => {
    seed([conversation('live-x', { effort: 'low' })], 'live-x')
    await sendPrompt('live-x', '  /clear  ', [], false)
    expect(startCalls()).toEqual([{ model: 'm1', permissionMode: 'plan', effort: 'low' }])
  })

  it('with Claude working: notifies, does not replace or call main', async () => {
    seed([conversation('live-x', { status: 'working' })], 'live-x')
    expect(await sendPrompt('live-x', '/clear', [], false)).toBe(false)
    expect(start).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(ids()).toEqual(['live-x'])
    expect(toastTitles()).toEqual(['Aguarde o Claude terminar (ou interrompa) para limpar a conversa.'])
  })

  it('failure opening the new one: keeps the old one (without closing) and returns false', async () => {
    seed([conversation('live-x')], 'live-x')
    startPlan = [new Error('boom')]
    expect(await sendPrompt('live-x', '/clear', [], false)).toBe(false)
    expect(ids()).toEqual(['live-x'])
    expect(close).not.toHaveBeenCalled()
    expect(toastTitles()).toEqual(['Claude: boom', 'Claude: não foi possível limpar a conversa agora.'])
  })

  it('in a dormant tab: opens the new one in place and sends no close to main (dormant has no process)', async () => {
    seed([dormant('dormant:1', null)], 'dormant:1')
    useStore.setState({ viewActive: false })
    expect(await sendPrompt('dormant:1', '/clear', [], false)).toBe(true)
    expect(ids()).toEqual(['live-1'])
    expect(close).not.toHaveBeenCalled()
  })

  it('with a start in flight, waits for it (never two at the same time)', async () => {
    const g = gate()
    startPlan = [g]
    openPanel()
    await startsCalled(1)
    seed([conversation('live-x')], 'live-x')
    const cleared = sendPrompt('live-x', '/clear', [], false)
    await settled()
    expect(start).toHaveBeenCalledTimes(1)
    g.open()
    expect(await cleared).toBe(true)
    expect(start).toHaveBeenCalledTimes(2)
    expect(maxStartsRunning).toBe(1)
  })
})

describe('wake dormant tab', () => {
  const wakeSeed = () =>
    seed([dormant('dormant:1', 's9', { permissionMode: 'acceptEdits', effort: 'low' })], 'dormant:1')

  it('the active dormant tab wakes on its own in the active view: resumes the session in its place', async () => {
    useStore.setState({ viewActive: false })
    wakeSeed()
    expect(start).not.toHaveBeenCalled()
    useStore.setState({ viewActive: true })
    await startsCalled(1)
    await vi.waitFor(() => expect(ids()).toEqual(['live-1']))
    expect(startCalls()).toEqual([{ resume: 's9', model: 'm1', permissionMode: 'acceptEdits', effort: 'low' }])
    expect(ids()).toEqual(['live-1'])
    expect(claude().activeId).toBe('live-1')
    expect(tabs()[0].sessionId).toBe('s9')
    expect(tabs()[0].dormant).toBeFalsy()
  })

  it.each([
    ['the hidden view', { viewActive: false }],
    ['the panel closed', { claudeVisible: false }],
    ['the Containers screen', { screen: 'containers' }],
    ['the workspace list still unknown', { workspaces: null }]
  ])('does not wake with %s', async (_, patch) => {
    useStore.setState(patch as never)
    wakeSeed()
    await settled()
    expect(start).not.toHaveBeenCalled()
    expect(tabs()[0].dormant).toBe(true)
  })

  it('a background dormant tab does not wake until it becomes active', async () => {
    seed([conversation('live-0'), dormant('dormant:1')], 'live-0')
    await settled()
    expect(start).not.toHaveBeenCalled()
    useStore.setState((s) => ({ claude: { ...s.claude, activeId: 'dormant:1' } }))
    await startsCalled(1)
    await vi.waitFor(() => expect(ids()).toEqual(['live-0', 'live-1']))
    expect(start).toHaveBeenCalledTimes(1)
    expect(ids()).toEqual(['live-0', 'live-1'])
  })

  it('simultaneous wakeConversation calls share the same resume and return the same id', async () => {
    useStore.setState({ viewActive: false })
    wakeSeed()
    const [a, b] = await Promise.all([wakeConversation('dormant:1'), wakeConversation('dormant:1')])
    expect(a).toBe('live-1')
    expect(b).toBe('live-1')
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('tab already alive: returns its own id without start', async () => {
    seed([conversation('live-0')], 'live-0')
    expect(await wakeConversation('live-0')).toBe('live-0')
    expect(start).not.toHaveBeenCalled()
  })

  it('missing tab: null', async () => {
    expect(await wakeConversation('dormant:nope')).toBeNull()
  })

  it('failure: marks the tab as failed, keeps the dormant one and does not retry on its own', async () => {
    useStore.setState({ viewActive: false })
    wakeSeed()
    startPlan = [new Error('no session')]
    expect(await wakeConversation('dormant:1')).toBeNull()
    expect(tabs()[0]).toMatchObject({ id: 'dormant:1', dormant: true, wakeState: 'failed' })
    await settled()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('"Try again" (retryWake) resumes the tab that failed', async () => {
    useStore.setState({ viewActive: false })
    wakeSeed()
    startPlan = [new Error('x')]
    await wakeConversation('dormant:1')
    retryWake('dormant:1')
    await startsCalled(2)
    await vi.waitFor(() => expect(ids()).toEqual(['live-1']))
    expect(start).toHaveBeenCalledTimes(2)
    expect(ids()).toEqual(['live-1'])
  })

  it('tab closed while waking: the conversation that started is closed and does not resurrect the tab', async () => {
    useStore.setState({ viewActive: false })
    wakeSeed()
    const g = gate()
    startPlan = [g]
    const woke = wakeConversation('dormant:1')
    await settled()
    seed([], null)
    g.open()
    expect(await woke).toBeNull()
    expect(close).toHaveBeenCalledWith('live-1')
    expect(ids()).toEqual([])
  })

  it('sending a prompt in a dormant tab wakes it first and sends to the real id', async () => {
    useStore.setState({ viewActive: false })
    wakeSeed()
    expect(await sendPrompt('dormant:1', 'hi', [], false)).toBe(true)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(start).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('live-1')
    expect(send.mock.calls[0][1].text).toBe('hi')
  })

  it('sending in a dormant tab that does not wake: the pending message leaves with a notice, none sent', async () => {
    useStore.setState({ viewActive: false })
    wakeSeed()
    startPlan = [new Error('x')]
    expect(await sendPrompt('dormant:1', 'hi', [], false)).toBe(true)
    expect(tabs()[0]?.queued).toHaveLength(1)
    await vi.waitFor(() => expect(tabs()[0]?.queued).toHaveLength(0))
    expect(toastTitles().length).toBeGreaterThan(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('waits for a start in flight before waking', async () => {
    const g = gate()
    startPlan = [g]
    openPanel()
    await startsCalled(1)
    useStore.setState({ viewActive: false })
    wakeSeed()
    const woke = wakeConversation('dormant:1')
    await settled()
    expect(start).toHaveBeenCalledTimes(1)
    g.open()
    expect(await woke).toBe('live-2')
    expect(maxStartsRunning).toBe(1)
  })
})

describe('panel auto start', () => {
  it('opening the panel with no conversations starts one (one start)', async () => {
    openPanel()
    await startsCalled(1)
    await vi.waitFor(() => expect(ids()).toEqual(['live-1']))
    expect(start).toHaveBeenCalledTimes(1)
    expect(ids()).toEqual(['live-1'])
  })

  it('showClaude with the panel already open and no conversations also starts one', async () => {
    showClaude()
    await startsCalled(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('repeated showClaude during the start does not open a second conversation', async () => {
    const g = gate()
    startPlan = [g]
    showClaude()
    showClaude()
    g.open()
    await vi.waitFor(() => expect(ids()).toEqual(['live-1']))
    await settled()
    expect(start).toHaveBeenCalledTimes(1)
    expect(ids()).toEqual(['live-1'])
  })

  it('with open conversations or no folder it does not start', async () => {
    seed([conversation('live-0')], 'live-0')
    openPanel()
    await settled()
    expect(start).not.toHaveBeenCalled()
    seed([], null)
    useStore.setState({ claudeVisible: false, root: null })
    useStore.setState({ claudeVisible: true })
    await settled()
    expect(start).not.toHaveBeenCalled()
  })

  it('a panel restored in a hidden view only starts when it becomes active (once)', async () => {
    useStore.setState({ claudeVisible: false, viewActive: false })
    useStore.setState({ claudeVisible: true })
    await settled()
    expect(start).not.toHaveBeenCalled()
    useStore.setState({ viewActive: true })
    await startsCalled(1)
    expect(start).toHaveBeenCalledTimes(1)
    useStore.setState({ viewActive: false })
    useStore.setState({ viewActive: true })
    await settled()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('before the workspace list it waits; starts when it arrives', async () => {
    useStore.setState({ claudeVisible: false, workspaces: null })
    useStore.setState({ claudeVisible: true })
    await settled()
    expect(start).not.toHaveBeenCalled()
    useStore.setState({ workspaces: { selfId: 'w', tabs: [] } as never })
    await startsCalled(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('closing the panel while waiting cancels the deferred start', async () => {
    useStore.setState({ claudeVisible: false, viewActive: false })
    useStore.setState({ claudeVisible: true })
    useStore.setState({ claudeVisible: false })
    useStore.setState({ viewActive: true })
    await settled()
    expect(start).not.toHaveBeenCalled()
  })
})

describe('askClaude', () => {
  const insertions: string[] = []
  beforeEach(() => {
    insertions.length = 0
  })
  const watchPrompt = (id: string): void => {
    useStore.setState((s) => ({ claude: { ...s.claude, activeId: id } }))
    unregisterPrompt = registerPrompt(id, {
      focus: () => undefined,
      insert: (t) => insertions.push(t),
      setText: () => undefined,
      hasFocus: () => false
    })
  }

  it('panel closed: opens the panel, reuses the initial conversation in flight and sends the question', async () => {
    useStore.setState({ claudeVisible: false })
    await askClaude('  how does it work?  ')
    expect(start).toHaveBeenCalledTimes(1)
    expect(ids()).toEqual(['live-1'])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('live-1')
    expect(send.mock.calls[0][1].text).toBe('how does it work?')
  })

  it('empty text or no folder does nothing', async () => {
    await askClaude('   ')
    useStore.setState({ root: null })
    await askClaude('hi')
    expect(start).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('panel already open with an empty active conversation: opens a NEW session (does not reuse it)', async () => {
    seed([conversation('live-0')], 'live-0')
    await askClaude('hi')
    expect(start).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('live-1')
    expect(ids()).toEqual(['live-0', 'live-1'])
  })

  it('with reuseStart and no start in flight, reuses the new and empty active conversation (no start)', async () => {
    seed([conversation('live-0')], 'live-0')
    await askClaude('hi', { reuseStart: true })
    expect(start).not.toHaveBeenCalled()
    expect(send.mock.calls[0][0]).toBe('live-0')
  })

  it('with reuseStart, an active conversation that already has a session or messages is not reused', async () => {
    seed([conversation('live-0', { sessionId: 's1' })], 'live-0')
    await askClaude('hi', { reuseStart: true })
    expect(start).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('live-1')
  })

  it('with reuseStart and a start in flight (panel opening), waits for it and reuses it', async () => {
    useStore.setState({ claudeVisible: false })
    const g = gate()
    startPlan = [g]
    const done = askClaude('hi', { reuseStart: true })
    await settled()
    g.open()
    await done
    expect(start).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('live-1')
  })

  it('the start in flight failed: tries once more with a new conversation and sends to it', async () => {
    startPlan = [new Error('boom')]
    useStore.setState({ claudeVisible: false })
    await askClaude('hi')
    expect(start).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0]).toBe('live-1')
  })

  it('cannot open: notifies and returns the question to the text box', async () => {
    startPlan = [new Error('boom'), new Error('boom')]
    useStore.setState({ claudeVisible: false })
    watchPrompt('x')
    await askClaude('my question')
    expect(send).not.toHaveBeenCalled()
    expect(toastTitles()).toContain('Claude: não foi possível abrir uma sessão. Sua pergunta ficou na caixa de texto.')
    expect(insertions).toEqual(['my question'])
  })

  it('a send refused by main returns the question to the text box', async () => {
    send.mockRejectedValueOnce(new Error('queue full'))
    useStore.setState({ claudeVisible: false })
    await askClaude('hi')
    expect(toastTitles()).toContain('Claude: queue full')
  })
})

describe('"Start with Claude" (claude:startRequested)', () => {
  it('with the folder already open: opens a session and sends the prompt (one start, one send)', async () => {
    useStore.setState({ claudeVisible: false })
    onStartRequested({ root: ROOT, prompt: 'create an app' })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(start).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('live-1')
    expect(send.mock.calls[0][1].text).toBe('create an app')
    expect(useStore.getState().claudeVisible).toBe(true)
  })

  it('reuses the initial conversation already open and empty (no second start)', async () => {
    seed([conversation('live-0')], 'live-0')
    onStartRequested({ root: ROOT, prompt: 'create' })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(start).not.toHaveBeenCalled()
    expect(send.mock.calls[0][0]).toBe('live-0')
  })

  it('compares the folder case-insensitively on macOS', async () => {
    onStartRequested({ root: '/REPO', prompt: 'hi' })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  })

  it('waits for the folder to open: the request only proceeds when the view reaches the requested folder', async () => {
    vi.useFakeTimers()
    useStore.setState({ root: null })
    onStartRequested({ root: ROOT, prompt: 'hi' })
    await vi.advanceTimersByTimeAsync(500)
    expect(start).not.toHaveBeenCalled()
    useStore.setState({ root: ROOT })
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(toastTitles()).not.toContain('Claude: a pasta não abriu a tempo.')
  })

  it('with the right folder but its session still restoring: only proceeds when the restore ends', async () => {
    setRestoring(true)
    try {
      onStartRequested({ root: ROOT, prompt: 'hi' })
      await settled()
      expect(start).not.toHaveBeenCalled()
      setRestoring(false)
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    } finally {
      setRestoring(false)
    }
  })

  it('folder not open in 15 s: discards the request with a notice and never sends to another folder', async () => {
    vi.useFakeTimers()
    useStore.setState({ root: '/other' })
    onStartRequested({ root: ROOT, prompt: 'hi' })
    await vi.advanceTimersByTimeAsync(15_200)
    expect(toastTitles()).toContain('Claude: a pasta não abriu a tempo.')
    expect(useStore.getState().toasts.find((t) => t.actions)?.actions?.[0].label).toBe('Copiar pedido')
    expect(start).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('two requests in a row are queued: each in a new session, without competing for the start', async () => {
    onStartRequested({ root: ROOT, prompt: 'first' })
    onStartRequested({ root: ROOT, prompt: 'second' })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(maxStartsRunning).toBe(1)
    expect(send.mock.calls.map(([, input]) => input.text)).toEqual(['first', 'second'])
    expect(new Set(send.mock.calls.map(([id]) => id)).size).toBe(2)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('a failure in one request does not block the following ones', async () => {
    startPlan = [new Error('boom')]
    onStartRequested({ root: ROOT, prompt: 'first' })
    onStartRequested({ root: ROOT, prompt: 'second' })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0][1].text).toBe('second')
  })
})
