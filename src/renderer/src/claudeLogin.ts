// Claude login and logout: `claude auth login` in a folder terminal, `authStatus` watch and conversation restart.
import type { ClaudeAuthStatus } from '@shared/types'
import { t } from '@shared/i18n'
import { get } from './store'
import { attempt } from './attempt'
import { dismissToastByKey, notify, showToast } from './toasts'
import { confirmDialog } from './saveActions'
import { createTerminal } from './terminalActions'
import { bridge, failed } from './claudeState'

const api = window.api

const LOGIN_TOAST = 'claude:login'
const LOGIN_POLL_MS = 3000
const LOGIN_POLL_LIMIT_MS = 5 * 60_000

/** Tracking of the login in progress (one at a time). `before` = state before opening the terminal. */
interface LoginWatch {
  before: ClaudeAuthStatus | null
  sawLoggedOut: boolean
  checking: boolean
  timer: ReturnType<typeof setTimeout> | null
  offExit: () => void
}
let loginWatch: LoginWatch | null = null

export function stopLoginPoll(): void {
  const watch = loginWatch
  loginWatch = null
  if (watch?.timer) clearTimeout(watch.timer)
  watch?.offExit()
  dismissToastByKey(LOGIN_TOAST)
}

/** Only a transition counts: it was out (or another account) and now it is in. `any` = explicit confirmation. */
function loginCompleted(watch: LoginWatch, status: ClaudeAuthStatus, any: boolean): boolean {
  if (!status.loggedIn) return false
  if (any) return true
  if (watch.before) return !watch.before.loggedIn || watch.before.email !== status.email
  return watch.sawLoggedOut
}

/**
 * Checks the login: logged in -> restarts the conversations (so they use the new account) and stops watching. `poll`
 * only accepts the transition; `manual` ("I'm signed in") and `exit` (the login terminal ended) accept any open
 * session.
 */
async function checkLogin(mode: 'poll' | 'manual' | 'exit'): Promise<void> {
  const watch = loginWatch
  if (!watch || watch.checking) return
  watch.checking = true
  const root = get().root
  try {
    await attempt(
      async () => {
        const status = await bridge.authStatus()
        if (loginWatch !== watch) return
        if (!status.loggedIn) watch.sawLoggedOut = true
        if (!loginCompleted(watch, status, mode !== 'poll')) {
          if (mode === 'manual') {
            notify(t().claude.actions.login.notDetected, 'info')
            showLoginToast()
          }
          return
        }
        stopLoginPoll()
        await bridge.restartAll()
        if (get().root !== root) return
        notify(
          status.email ? t().claude.actions.login.connectedAs(status.email) : t().claude.actions.login.connected,
          'info'
        )
      },
      { format: failed, quiet: mode !== 'manual' }
    )
  } finally {
    watch.checking = false
  }
}

function showLoginToast(): void {
  showToast({
    key: LOGIN_TOAST,
    tone: 'info',
    title: t().claude.actions.login.signingIn,
    description: t().claude.actions.login.finishInTerminal,
    actions: [{ label: t().claude.actions.login.done, onClick: () => void checkLogin('manual') }]
  })
}

/**
 * No login: runs `claude auth login` in a new terminal of the window folder (the OAuth flow opens the browser) and
 * watches `authStatus` for a few minutes (and the terminal's end); once signed in, restarts the conversations. "I'm
 * signed in" checks right away.
 */
export async function openClaudeLogin(): Promise<void> {
  stopLoginPoll()
  const root = get().root
  // Before opening the terminal: what was already open does not count as a new login.
  const before = await bridge.authStatus().catch(() => null)
  if (get().root !== root) return
  const id = await createTerminal({ claudeLogin: true, title: 'claude auth login' })
  if (!id || get().root !== root) return
  const watch: LoginWatch = {
    before,
    sawLoggedOut: false,
    checking: false,
    timer: null,
    offExit: api.terminal.onExit((exitedId, code) => {
      if (exitedId === id && loginWatch === watch && code === 0) void checkLogin('exit')
    })
  }
  loginWatch = watch
  showLoginToast()
  const startedAt = Date.now()
  const tick = (): void => {
    if (loginWatch !== watch) return
    if (Date.now() - startedAt > LOGIN_POLL_LIMIT_MS) return stopLoginPoll()
    void checkLogin('poll').finally(() => {
      if (loginWatch === watch) watch.timer = setTimeout(tick, LOGIN_POLL_MS)
    })
  }
  watch.timer = setTimeout(tick, LOGIN_POLL_MS)
}

/**
 * `/logout`: confirms, logs out through the CLI and main restarts the conversations (the new `init` brings an empty
 * account).
 */
export async function logoutClaude(): Promise<void> {
  const confirmed = await confirmDialog({
    message: t().claude.actions.logout.confirm,
    detail: t().claude.actions.logout.detail,
    confirmLabel: t().claude.actions.logout.action,
    destructive: true
  })
  if (!confirmed) return
  await attempt(
    async () => {
      await bridge.logout()
      notify(t().claude.actions.logout.done, 'info')
    },
    { format: failed }
  )
}
