import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudePermissionRequest } from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'
import { selectConversation } from './lib/claudeSelectors'

const respond = vi.fn<(id: string, requestId: string, response: unknown) => Promise<boolean>>()
const setSessionMeta = vi.fn<(sessionId: string, patch: unknown) => Promise<void>>()
const rewind = vi.fn<(id: string, message: string, what: unknown) => Promise<{ filesChanged: string[] }>>()
const fake = installFakeApi({
  claude: {
    rewind,
    setSessionMeta,
    sessions: () => Promise.resolve([{ sessionId: 's1', title: 'Automatic', lastModified: 0, favorite: false }]),
    respond,
    contextUsage: () => Promise.resolve(null)
  }
})
const onEvent = fake.emit.claude.onEvent

const { useStore } = await import('./store')
const { toastTitles } = await import('./test/toastTitles')
const { respondPermission } = await import('./claudePermissions')
const { startClaudeReactions } = await import('./claudeReactions')
const { toggleFavorite, renameConversation } = await import('./claudeSessionMeta')
const { rewindConversation } = await import('./claudeRewind')
const { createConversation } = await import('./lib/claudeConversation')

const ID = 'c1'
const question: ClaudePermissionRequest = {
  kind: 'question',
  requestId: 'q1',
  questions: [{ id: 'a', header: 'Lib', question: 'Which?', options: [], multiSelect: false }]
}
const tool: ClaudePermissionRequest = {
  kind: 'tool',
  requestId: 't1',
  toolName: 'Bash',
  title: 'run',
  input: {},
  canAlwaysAllow: true,
  canAllowInWorkspace: true
}
const plan: ClaudePermissionRequest = { kind: 'plan', requestId: 'p1', plan: '# plan' }

function seed(...permissions: ClaudePermissionRequest[]): void {
  const conv = createConversation({ id: ID, messages: [] } as never, { permissionMode: 'plan', model: 'm' })
  useStore.setState((s) => ({ claude: { ...s.claude, activeId: ID, conversations: [{ ...conv, permissions }] } }))
}
const pending = (): string[] => selectConversation(ID)(useStore.getState())?.permissions.map((p) => p.requestId) ?? []
const mode = (): string | undefined => selectConversation(ID)(useStore.getState())?.permissionMode
const notices = toastTitles

const answer = { behavior: 'allow' } as const
let stop: () => void

beforeEach(() => {
  respond.mockReset()
  useStore.setState({ toasts: [] })
  stop = startClaudeReactions()
})
afterEach(() => stop())

describe('respondPermission', () => {
  it('question: only leaves the panel after the ack and resolves true', async () => {
    seed(question)
    const d = deferred<boolean>()
    respond.mockReturnValue(d.promise)
    const result = respondPermission(ID, 'q1', answer)
    await Promise.resolve()
    expect(pending()).toEqual(['q1'])
    d.resolve(true)
    expect(await result).toBe(true)
    expect(pending()).toEqual([])
    expect(notices()).toEqual([])
  })

  it('question: a false ack keeps the card, notifies and resolves false', async () => {
    seed(question)
    respond.mockResolvedValue(false)
    expect(await respondPermission(ID, 'q1', answer)).toBe(false)
    expect(pending()).toEqual(['q1'])
    expect(notices()).toHaveLength(1)
  })

  it('question: an IPC failure behaves like a refusal', async () => {
    seed(question)
    respond.mockRejectedValue(new Error('ipc'))
    expect(await respondPermission(ID, 'q1', answer)).toBe(false)
    expect(pending()).toEqual(['q1'])
    expect(notices()).toHaveLength(1)
  })

  it('question: permissionCancelled in flight removes the card and ignores the late ack', async () => {
    seed(question)
    const d = deferred<boolean>()
    respond.mockReturnValue(d.promise)
    const result = respondPermission(ID, 'q1', answer)
    onEvent({ type: 'permissionCancelled', id: ID, requestId: 'q1' })
    expect(pending()).toEqual([])
    d.resolve(false)
    await result
    expect(pending()).toEqual([])
    expect(notices()).toEqual([])
  })

  it('double send of the same request in flight: the second returns false and IPC is called once', async () => {
    seed(question)
    const d = deferred<boolean>()
    respond.mockReturnValue(d.promise)
    const first = respondPermission(ID, 'q1', answer)
    expect(await respondPermission(ID, 'q1', answer)).toBe(false)
    d.resolve(true)
    expect(await first).toBe(true)
    expect(respond).toHaveBeenCalledTimes(1)
  })

  it('tool: goes away right away and comes back to the panel when main refuses', async () => {
    seed(tool)
    const d = deferred<boolean>()
    respond.mockReturnValue(d.promise)
    const result = respondPermission(ID, 't1', answer)
    expect(pending()).toEqual([])
    d.resolve(false)
    expect(await result).toBe(false)
    expect(pending()).toEqual(['t1'])
    expect(notices()).toContain('Claude: a resposta não foi aceita; revise e tente de novo.')
  })

  it('tool: a refusal after permissionCancelled does not restore the request', async () => {
    seed(tool)
    const d = deferred<boolean>()
    respond.mockReturnValue(d.promise)
    const result = respondPermission(ID, 't1', answer)
    onEvent({ type: 'permissionCancelled', id: ID, requestId: 't1' })
    d.resolve(false)
    expect(await result).toBe(false)
    expect(pending()).toEqual([])
    expect(notices()).toEqual([])
  })

  it('approved plan: the renderer does not change the mode (main reports it)', async () => {
    seed(plan)
    respond.mockResolvedValue(true)
    expect(await respondPermission(ID, 'p1', { behavior: 'allow', mode: 'acceptEdits' })).toBe(true)
    expect(pending()).toEqual([])
    expect(mode()).toBe('plan')
    onEvent({ type: 'permissionMode', id: ID, mode: 'acceptEdits' })
    expect(mode()).toBe('acceptEdits')
  })
})

describe('favorite and rename', () => {
  const conv = (): ClaudeConversationShape | undefined => selectConversation(ID)(useStore.getState())
  type ClaudeConversationShape = ReturnType<typeof createConversation>

  beforeEach(() => {
    setSessionMeta.mockReset()
    seed()
    useStore.setState((s) => ({
      claude: {
        ...s.claude,
        conversations: s.claude.conversations.map((c) => ({ ...c, sessionId: 's1', autoTitle: 'Automatic' }))
      }
    }))
  })

  it('favorite is optimistic and an error reverts and notifies', async () => {
    setSessionMeta.mockResolvedValueOnce(undefined)
    const pendingToggle = toggleFavorite(ID)
    expect(conv()?.favorite).toBe(true)
    await pendingToggle
    expect(setSessionMeta).toHaveBeenCalledWith('s1', { favorite: true })

    setSessionMeta.mockRejectedValueOnce(new Error('failed'))
    await toggleFavorite(ID)
    expect(conv()?.favorite).toBe(true)
    expect(notices().some((n) => n.includes('failed'))).toBe(true)
  })

  it('rename changes the tab right away; empty goes back to automatic (title: null); an error reverts', async () => {
    setSessionMeta.mockResolvedValue(undefined)
    const pendingRename = renameConversation(ID, '  Pix no checkout ')
    expect(conv()).toMatchObject({ title: 'Pix no checkout', userTitle: 'Pix no checkout' })
    await pendingRename
    expect(setSessionMeta).toHaveBeenLastCalledWith('s1', { title: 'Pix no checkout' })

    await renameConversation(ID, '   ')
    expect(setSessionMeta).toHaveBeenLastCalledWith('s1', { title: null })
    expect(conv()).toMatchObject({ title: 'Automatic', userTitle: null })

    setSessionMeta.mockRejectedValueOnce(new Error('no disk'))
    await renameConversation(ID, 'Other')
    expect(conv()).toMatchObject({ title: 'Automatic', userTitle: null })
  })

  it('the CLI title event does not overwrite the user title', async () => {
    setSessionMeta.mockResolvedValue(undefined)
    await renameConversation(ID, 'My title')
    onEvent({ type: 'title', id: ID, title: 'CLI title' })
    expect(conv()?.title).toBe('My title')
    expect(conv()?.autoTitle).toBe('CLI title')
  })
})

describe('rewindConversation', () => {
  const what = { code: true, conversation: false }

  it('a second rewind before the first one replies is ignored', async () => {
    seed()
    rewind.mockReset()
    const d = deferred<boolean>()
    rewind.mockReturnValue(d.promise.then(() => ({ filesChanged: [] })))
    const first = rewindConversation(ID, 'm1', what, 'text')
    const second = rewindConversation(ID, 'm1', what, 'text')
    d.resolve(true)
    await Promise.all([first, second])
    expect(rewind).toHaveBeenCalledTimes(1)
    // Once the first is resolved, a new rewind is accepted again.
    await rewindConversation(ID, 'm1', what, 'text')
    expect(rewind).toHaveBeenCalledTimes(2)
  })

  it('an error from main still goes to the toast and frees the next rewind', async () => {
    seed()
    rewind.mockReset()
    rewind.mockRejectedValueOnce(new Error('A rewind is already in progress.'))
    await rewindConversation(ID, 'm1', what, 'text')
    expect(notices().some((n) => n.includes('A rewind is already'))).toBe(true)
    rewind.mockResolvedValueOnce({ filesChanged: [] })
    await rewindConversation(ID, 'm1', what, 'text')
    expect(rewind).toHaveBeenCalledTimes(2)
  })
})

describe('workspace view becomes the active one again', () => {
  const state = (active: boolean): never =>
    ({
      selfId: 'a',
      workspaces: [
        { id: 'a', active },
        { id: 'b', active: !active }
      ]
    }) as never

  it('notifies the requests that arrived while the view was hidden, only once', async () => {
    const { setWorkspaces } = await import('./workspaceLifecycle')
    setWorkspaces(state(false))
    seed(tool)
    useStore.setState({ toasts: [] })
    setWorkspaces(state(true))
    const keys = useStore.getState().toasts.map((t) => t.key)
    expect(keys).toEqual([`claude:${ID}:permission:t1`])
    // Same state again (still active): does not repeat.
    useStore.setState({ toasts: [] })
    setWorkspaces({ ...(state(true) as object), selfId: 'a', extra: 1 } as never)
    expect(useStore.getState().toasts).toEqual([])
  })
})
