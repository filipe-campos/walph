import { act } from 'react'
import type { ClaudeApi, ClaudeMcpServer, ClaudeMcpStatus } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../../test/fakeApi'
import { renderHook } from '../../../test/renderHook'
import { unmountAll } from '../../../test/dom'
import { deferred } from '../../../test/deferred'

const mcpStatus = vi.fn<ClaudeApi['mcpStatus']>()
const mcpToggle = vi.fn<ClaudeApi['mcpToggle']>()
const mcpReconnect = vi.fn<ClaudeApi['mcpReconnect']>()
const mcpAuthenticate = vi.fn<ClaudeApi['mcpAuthenticate']>()
const mcpSubmitCallback = vi.fn<ClaudeApi['mcpSubmitCallback']>()
const mcpClearAuth = vi.fn<ClaudeApi['mcpClearAuth']>()
const mcpRemove = vi.fn<ClaudeApi['mcpRemove']>()
installFakeApi({
  claude: { mcpStatus, mcpToggle, mcpReconnect, mcpAuthenticate, mcpSubmitCallback, mcpClearAuth, mcpRemove }
})

const { useMcpServers } = await import('./useMcpServers')
const { useStore } = await import('../../../store')
const { resetStore } = await import('../../../test/resetStore')
const { toastTitles } = await import('../../../test/toastTitles')
const { createConversation } = await import('../../../lib/claudeConversation')

const ID = 'c1'

const server = (name: string, status: ClaudeMcpStatus = 'connected', scope = 'user'): ClaudeMcpServer => ({
  name,
  status,
  scope,
  editable: true,
  tools: []
})

const setup = (id = ID) => renderHook(useMcpServers, id)
const flush = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const spy of [mcpToggle, mcpReconnect, mcpAuthenticate, mcpSubmitCallback, mcpClearAuth, mcpRemove])
    spy.mockReset()
  const conv = createConversation({ id: ID, messages: [], favorite: false }, { permissionMode: 'default', model: 'm' })
  useStore.setState((s) => ({ claude: { ...s.claude, activeId: ID, conversations: [conv] } }))
  mcpStatus.mockResolvedValue([server('a')])
})

afterEach(() => {
  unmountAll()
  resetStore()
  vi.useRealTimers()
})

describe('initial load', () => {
  it('lists the conversation servers', async () => {
    const hook = setup()
    expect(hook.current.servers).toBeNull()
    await flush()
    expect(mcpStatus).toHaveBeenCalledExactlyOnceWith(ID)
    expect(hook.current.servers).toEqual([server('a')])
    expect(hook.current.loadFailed).toBe(false)
  })

  it('a failed load marks the error, notifies and "Tentar de novo" loads', async () => {
    mcpStatus.mockRejectedValueOnce(new Error('no network'))
    const hook = setup()
    await flush()
    expect(hook.current.loadFailed).toBe(true)
    expect(hook.current.servers).toBeNull()
    expect(toastTitles()).toEqual(['Claude: no network'])

    act(() => hook.current.retry())
    expect(hook.current.loadFailed).toBe(false)
    await flush()
    expect(hook.current.servers).toEqual([server('a')])
  })

  it('switching conversations reloads the list', async () => {
    const other = createConversation(
      { id: 'c2', messages: [], favorite: false },
      { permissionMode: 'default', model: 'm' }
    )
    useStore.setState((s) => ({ claude: { ...s.claude, conversations: [...s.claude.conversations, other] } }))
    const hook = setup()
    await flush()
    hook.rerender('c2')
    await flush()
    expect(mcpStatus).toHaveBeenLastCalledWith('c2')
  })

  it('an old load response does not overwrite a newer action', async () => {
    const slow = deferred<ClaudeMcpServer[]>()
    mcpStatus.mockReturnValueOnce(slow.promise)
    mcpReconnect.mockResolvedValue([server('a', 'pending')])
    const hook = setup()
    act(() => hook.current.actions.reconnect(server('a')))
    await flush()
    expect(hook.current.servers).toEqual([server('a', 'pending')])
    slow.resolve([server('old')])
    await flush()
    expect(hook.current.servers).toEqual([server('a', 'pending')])
  })

  it('a failure arriving after unmount only notifies once and does not write to the hook', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const slow = deferred<ClaudeMcpServer[]>()
    mcpStatus.mockReturnValueOnce(slow.promise)
    setup()
    unmountAll()
    slow.reject(new Error('x'))
    await flush()
    expect(toastTitles()).toEqual(['Claude: x'])
    expect(error).not.toHaveBeenCalled()
  })
})

describe('polling', () => {
  it('while a server is connecting it polls every 2 s silently and stops when it settles', async () => {
    mcpStatus.mockResolvedValue([server('a', 'pending')])
    const hook = setup()
    await flush()
    mcpStatus.mockClear()
    await flush(2000)
    expect(mcpStatus).toHaveBeenCalledExactlyOnceWith(ID)
    mcpStatus.mockResolvedValue([server('a', 'connected')])
    await flush(2000)
    expect(hook.current.servers).toEqual([server('a')])
    mcpStatus.mockClear()
    await flush(10_000)
    expect(mcpStatus).not.toHaveBeenCalled()
  })

  it('without a pending server or authentication it does not poll', async () => {
    setup()
    await flush()
    mcpStatus.mockClear()
    await flush(10_000)
    expect(mcpStatus).not.toHaveBeenCalled()
  })

  it('a hidden view (another workspace) does not poll', async () => {
    mcpStatus.mockResolvedValue([server('a', 'pending')])
    useStore.setState({ viewActive: false })
    setup()
    await flush()
    mcpStatus.mockClear()
    await flush(6000)
    expect(mcpStatus).not.toHaveBeenCalled()
    act(() => useStore.setState({ viewActive: true }))
    await flush(2000)
    expect(mcpStatus).toHaveBeenCalledTimes(1)
  })

  it('does not stack polls: waits for the previous one to finish', async () => {
    mcpStatus.mockResolvedValue([server('a', 'pending')])
    setup()
    await flush()
    const slow = deferred<ClaudeMcpServer[]>()
    mcpStatus.mockClear()
    mcpStatus.mockReturnValue(slow.promise)
    await flush(8000)
    expect(mcpStatus).toHaveBeenCalledTimes(1)
    slow.resolve([server('a', 'pending')])
    await flush(2000)
    expect(mcpStatus).toHaveBeenCalledTimes(2)
  })

  it('three polling failures in a row give up and show the error, without notices', async () => {
    mcpStatus.mockResolvedValueOnce([server('a', 'pending')])
    const hook = setup()
    await flush()
    mcpStatus.mockRejectedValue(new Error('x'))
    await flush(4000)
    expect(hook.current.loadFailed).toBe(false)
    await flush(2000)
    expect(hook.current.loadFailed).toBe(true)
    expect(toastTitles()).toEqual([])
    mcpStatus.mockClear()
    await flush(10_000)
    expect(mcpStatus).not.toHaveBeenCalled()
  })

  it('a success in between resets the failure count', async () => {
    mcpStatus.mockResolvedValueOnce([server('a', 'pending')])
    const hook = setup()
    await flush()
    mcpStatus.mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'))
    mcpStatus.mockResolvedValueOnce([server('a', 'pending')])
    mcpStatus.mockRejectedValue(new Error('x'))
    await flush(8000)
    expect(hook.current.loadFailed).toBe(false)
    await flush(4000)
    expect(hook.current.loadFailed).toBe(true)
  })
})

describe('per-server actions', () => {
  it('toggle enables a disabled server and disables an active one, applying the new list', async () => {
    mcpToggle.mockResolvedValue([server('a', 'disabled')])
    const hook = setup()
    await flush()
    act(() => hook.current.actions.toggle(server('a')))
    await flush()
    expect(mcpToggle).toHaveBeenLastCalledWith(ID, 'a', false)
    expect(hook.current.servers).toEqual([server('a', 'disabled')])

    mcpToggle.mockResolvedValue([server('a')])
    act(() => hook.current.actions.toggle(server('a', 'disabled')))
    await flush()
    expect(mcpToggle).toHaveBeenLastCalledWith(ID, 'a', true)
  })

  it('marks the server busy during the call and ignores a second click', async () => {
    const pending = deferred<ClaudeMcpServer[]>()
    mcpReconnect.mockReturnValue(pending.promise)
    const hook = setup()
    await flush()
    act(() => hook.current.actions.reconnect(server('a')))
    act(() => hook.current.actions.reconnect(server('a')))
    expect(hook.current.busy.has('user:a')).toBe(true)
    await flush()
    expect(mcpReconnect).toHaveBeenCalledTimes(1)
    pending.resolve([server('a')])
    await flush()
    expect(hook.current.busy.size).toBe(0)
  })

  it('the same name in another scope has its own busy state', async () => {
    mcpReconnect.mockReturnValue(new Promise(() => {}))
    const hook = setup()
    await flush()
    act(() => hook.current.actions.reconnect(server('a', 'failed', 'project')))
    act(() => hook.current.actions.reconnect(server('a', 'failed', 'user')))
    await flush()
    expect(mcpReconnect).toHaveBeenCalledTimes(2)
    expect([...hook.current.busy].sort()).toEqual(['project:a', 'user:a'])
  })

  it('a failing action shows the notice, frees the row and silently reloads the list', async () => {
    mcpClearAuth.mockRejectedValue(new Error('no permission'))
    const hook = setup()
    await flush()
    mcpStatus.mockClear()
    mcpStatus.mockResolvedValue([server('a', 'failed')])
    act(() => hook.current.actions.logout(server('a')))
    await flush()
    expect(toastTitles()).toEqual(['Claude: no permission'])
    expect(mcpStatus).toHaveBeenCalledExactlyOnceWith(ID)
    expect(hook.current.busy.size).toBe(0)
    expect(hook.current.servers).toEqual([server('a', 'failed')])
  })

  it('submitCallback delivers the URL and returns a promise that resolves with the applied list', async () => {
    mcpSubmitCallback.mockResolvedValue([server('a')])
    const hook = setup()
    await flush()
    let done = false
    act(() => {
      void hook.current.actions
        .submitCallback(server('a', 'needs-auth'), 'http://localhost/cb?code=1')
        .then(() => (done = true))
    })
    await flush()
    expect(mcpSubmitCallback).toHaveBeenCalledWith(ID, 'a', 'http://localhost/cb?code=1')
    expect(done).toBe(true)
  })

  it('remove uses the server scope and resolves true with the modal open', async () => {
    mcpRemove.mockResolvedValue([])
    const hook = setup()
    await flush()
    let result: boolean | null = null
    act(() => {
      void hook.current.actions.remove(server('a', 'connected', 'project')).then((r) => (result = r))
    })
    await flush()
    expect(mcpRemove).toHaveBeenCalledWith(ID, 'a', 'project')
    expect(result).toBe(true)
    expect(hook.current.servers).toEqual([])
  })

  it('remove resolves false if the modal closed midway', async () => {
    const pending = deferred<ClaudeMcpServer[]>()
    mcpRemove.mockReturnValue(pending.promise)
    const hook = setup()
    await flush()
    let result: boolean | null = null
    act(() => {
      void hook.current.actions.remove(server('a')).then((r) => (result = r))
    })
    unmountAll()
    pending.resolve([])
    await flush()
    expect(result).toBe(false)
  })

  it('the actions keep the same identity between renders', async () => {
    const hook = setup()
    await flush()
    const before = hook.current.actions
    mcpReconnect.mockResolvedValue([server('a')])
    act(() => before.reconnect(server('a')))
    await flush()
    expect(hook.current.actions).toBe(before)
  })

  it('applyExternal applies the list of a just-added server', async () => {
    const hook = setup()
    await flush()
    let ok = false
    act(() => {
      ok = hook.current.applyExternal([server('a'), server('new')])
    })
    expect(ok).toBe(true)
    expect(hook.current.servers?.map((s) => s.name)).toEqual(['a', 'new'])
  })

  it('applyExternal after unmount returns false', async () => {
    const hook = setup()
    await flush()
    const apply = hook.current.applyExternal
    unmountAll()
    expect(apply([server('x')])).toBe(false)
  })
})

describe('OAuth authentication', () => {
  it('shows the waiting state, then the URL and the callback request', async () => {
    const pending = deferred<{ authUrl?: string; awaitingCallback: boolean }>()
    mcpAuthenticate.mockReturnValue(pending.promise)
    mcpStatus.mockResolvedValue([server('a', 'needs-auth')])
    const hook = setup()
    await flush()
    act(() => hook.current.actions.authenticate(server('a', 'needs-auth')))
    expect(hook.current.auth).toEqual({ 'user:a': { awaitingCallback: false } })
    expect(hook.current.busy.has('user:a')).toBe(true)
    pending.resolve({ authUrl: 'https://auth.example/x', awaitingCallback: true })
    await flush()
    expect(hook.current.auth).toEqual({ 'user:a': { authUrl: 'https://auth.example/x', awaitingCallback: true } })
    expect(hook.current.busy.size).toBe(0)
  })

  it('authenticating again with a flow in progress is ignored', async () => {
    mcpAuthenticate.mockResolvedValue({ awaitingCallback: false })
    mcpStatus.mockResolvedValue([server('a', 'needs-auth')])
    const hook = setup()
    await flush()
    act(() => hook.current.actions.authenticate(server('a', 'needs-auth')))
    await flush()
    act(() => hook.current.actions.authenticate(server('a', 'needs-auth')))
    expect(mcpAuthenticate).toHaveBeenCalledTimes(1)
  })

  it('a failure to start drops the waiting state and reloads the list', async () => {
    mcpAuthenticate.mockRejectedValue(new Error('browser'))
    mcpStatus.mockResolvedValue([server('a', 'needs-auth')])
    const hook = setup()
    await flush()
    mcpStatus.mockClear()
    act(() => hook.current.actions.authenticate(server('a', 'needs-auth')))
    await flush()
    expect(hook.current.auth).toEqual({})
    expect(toastTitles()).toEqual(['Claude: browser'])
    expect(mcpStatus).toHaveBeenCalledTimes(1)
  })

  it('cancel drops only that server authentication', async () => {
    mcpAuthenticate.mockResolvedValue({ awaitingCallback: true })
    mcpStatus.mockResolvedValue([server('a', 'needs-auth'), server('b', 'needs-auth')])
    const hook = setup()
    await flush()
    act(() => hook.current.actions.authenticate(server('a', 'needs-auth')))
    act(() => hook.current.actions.authenticate(server('b', 'needs-auth')))
    await flush()
    act(() => hook.current.actions.cancelAuth(server('a', 'needs-auth')))
    expect(Object.keys(hook.current.auth)).toEqual(['user:b'])
  })

  it('the authentication disappears when the server stops waiting for it', async () => {
    mcpAuthenticate.mockResolvedValue({ awaitingCallback: true })
    mcpStatus.mockResolvedValue([server('a', 'needs-auth')])
    const hook = setup()
    await flush()
    act(() => hook.current.actions.authenticate(server('a', 'needs-auth')))
    await flush()
    expect(Object.keys(hook.current.auth)).toEqual(['user:a'])
    mcpStatus.mockResolvedValue([server('a', 'connected')])
    await flush(2000)
    expect(hook.current.auth).toEqual({})
    expect(hook.current.servers).toEqual([server('a')])
  })

  it('while authenticating, polling runs even without a pending server', async () => {
    mcpAuthenticate.mockResolvedValue({ awaitingCallback: true })
    mcpStatus.mockResolvedValue([server('a', 'needs-auth')])
    const hook = setup()
    await flush()
    act(() => hook.current.actions.authenticate(server('a', 'needs-auth')))
    await flush()
    mcpStatus.mockClear()
    await flush(2000)
    expect(mcpStatus).toHaveBeenCalledTimes(1)
  })
})
