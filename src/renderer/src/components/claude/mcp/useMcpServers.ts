import type { ClaudeMcpServer } from '@shared/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  authenticateMcpServer,
  loadMcpStatus,
  logoutMcpServer,
  reconnectMcpServer,
  removeMcpServer,
  submitMcpCallback,
  toggleMcpServer
} from '../../../claudeMcpActions'
import { needsPolling, serverKey } from '../../../lib/claudeMcp'
import { useStore } from '../../../store'

const POLL_MS = 2000

/** Consecutive polling failures before giving up and showing the error state. */
const MAX_POLL_FAILURES = 3

/** OAuth authentication in progress for a server (the browser was already opened by main). */
export interface AuthState {
  authUrl?: string | undefined
  awaitingCallback: boolean
}

type Mutation = (id: string, name: string) => Promise<ClaudeMcpServer[] | null>

/** Per-server actions; the identity is stable, so the memoized rows do not render on every poll. */
export interface McpServerActions {
  toggle: (server: ClaudeMcpServer) => void
  reconnect: (server: ClaudeMcpServer) => void
  authenticate: (server: ClaudeMcpServer) => void
  cancelAuth: (server: ClaudeMcpServer) => void
  submitCallback: (server: ClaudeMcpServer, url: string) => Promise<void>
  logout: (server: ClaudeMcpServer) => void
  /** Resolves `false` if the modal closed midway (nothing more to update on screen). */
  remove: (server: ClaudeMcpServer) => Promise<boolean>
}

/**
 * List of the conversation's MCP servers: initial load, polling while some server is connecting/authenticating and the
 * actions (which return the new list). Out-of-order responses never overwrite a newer one.
 */
export function useMcpServers(conversationId: string) {
  const [servers, setServers] = useState<ClaudeMcpServer[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // Per-server state is keyed by `scope:name` (the same name may exist in different scopes).
  const [auth, setAuth] = useState<Record<string, AuthState>>({})
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const viewActive = useStore((s) => s.viewActive)

  const live = useRef(true)
  const issued = useRef(0)
  const applied = useRef(0)
  const polling = useRef(false)
  const failures = useRef(0)
  // The actions are stable: they read the current state through here.
  const busyRef = useRef(busy)
  const authRef = useRef(auth)
  useEffect(() => {
    busyRef.current = busy
    authRef.current = auth
  })
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const apply = useCallback((list: ClaudeMcpServer[], token: number): void => {
    if (!live.current || token < applied.current) return
    applied.current = token
    failures.current = 0
    setServers(list)
    setLoadFailed(false)
    // The authentication only holds while the server still waits for it.
    setAuth((current) => {
      const keep = new Set(
        Object.keys(current).filter((k) =>
          list.some((s) => serverKey(s) === k && (s.status === 'needs-auth' || s.status === 'pending'))
        )
      )
      return keep.size === Object.keys(current).length
        ? current
        : Object.fromEntries(Object.entries(current).filter(([k]) => keep.has(k)))
    })
  }, [])

  const settle = useCallback(
    (list: ClaudeMcpServer[] | null, token: number): void => {
      if (!live.current) return
      if (list) apply(list, token)
      else setLoadFailed(true)
    },
    [apply]
  )

  useEffect(() => {
    // The state is only written after the `await` (in `settle`).
    const token = ++issued.current
    void loadMcpStatus(conversationId).then((list) => settle(list, token))
  }, [conversationId, settle])

  const retry = useCallback((): void => {
    failures.current = 0
    setLoadFailed(false)
    const token = ++issued.current
    void loadMcpStatus(conversationId).then((list) => settle(list, token))
  }, [conversationId, settle])

  const authenticating = Object.keys(auth).length > 0
  // A hidden view (another workspace) does not poll; consecutive errors stop the polling until "Try again".
  const poll = viewActive && !loadFailed && servers !== null && needsPolling(servers, authenticating)
  useEffect(() => {
    if (!poll) return
    const timer = setInterval(() => {
      if (polling.current) return
      polling.current = true
      const token = ++issued.current
      void loadMcpStatus(conversationId, true)
        .then((list) => {
          if (!live.current) return
          if (list) apply(list, token)
          else if (++failures.current >= MAX_POLL_FAILURES) setLoadFailed(true)
        })
        .finally(() => {
          polling.current = false
        })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [poll, conversationId, apply])

  /** Applies a list coming from outside (added server); `false` if the modal already closed. */
  const applyExternal = useCallback(
    (list: ClaudeMcpServer[]): boolean => {
      if (!live.current) return false
      apply(list, ++issued.current)
      return true
    },
    [apply]
  )

  const actions = useMemo<McpServerActions>(() => {
    const markBusy = (key: string, on: boolean): void =>
      setBusy((current) => {
        const next = new Set(current)
        if (on) next.add(key)
        else next.delete(key)
        return next
      })

    /**
     * After a failed action (the toast already went out) the row goes back to the real state instead of staying stuck.
     */
    const refetchQuietly = async (): Promise<void> => {
      const token = ++issued.current
      const list = await loadMcpStatus(conversationId, true)
      if (live.current && list) apply(list, token)
    }

    /** Action that returns the new list: marks the server busy and applies the result. */
    const run = async (s: ClaudeMcpServer, action: Mutation): Promise<void> => {
      const key = serverKey(s)
      if (busyRef.current.has(key)) return
      markBusy(key, true)
      const list = await action(conversationId, s.name)
      if (!live.current) return
      markBusy(key, false)
      // The token goes out AFTER the wait: a poll that started before must not beat the action result.
      if (list) apply(list, ++issued.current)
      else await refetchQuietly()
    }

    const dropAuth = (key: string): void => setAuth(({ [key]: _gone, ...rest }) => rest)

    return {
      toggle: (s) => void run(s, (id, name) => toggleMcpServer(id, name, s.status === 'disabled')),
      reconnect: (s) => void run(s, reconnectMcpServer),
      logout: (s) => void run(s, logoutMcpServer),
      submitCallback: (s, url) => run(s, (id, name) => submitMcpCallback(id, name, url)),
      cancelAuth: (s) => dropAuth(serverKey(s)),
      authenticate: (s) => {
        const key = serverKey(s)
        if (busyRef.current.has(key) || authRef.current[key]) return
        markBusy(key, true)
        setAuth((a) => ({ ...a, [key]: { awaitingCallback: false } }))
        void authenticateMcpServer(conversationId, s.name).then(async (result) => {
          if (!live.current) return
          markBusy(key, false)
          if (!result) {
            dropAuth(key)
            await refetchQuietly()
            return
          }
          setAuth((a) => ({ ...a, [key]: { authUrl: result.authUrl, awaitingCallback: result.awaitingCallback } }))
        })
      },
      remove: async (s) => {
        // `editable` guarantees one of these three scopes.
        const scope = s.scope as 'local' | 'project' | 'user'
        await run(s, (id, name) => removeMcpServer(id, name, scope))
        return live.current
      }
    }
  }, [conversationId, apply])

  return { servers, loadFailed, auth, busy, retry, applyExternal, actions }
}
