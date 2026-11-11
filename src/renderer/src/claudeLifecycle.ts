// Lifecycle of the Claude conversations: opening and closing the panel, starting (new, resumed, dormant that wakes),
// activating, closing and navigating between tabs.
import type { ClaudeStartOptions } from '@shared/types'
import { t } from '@shared/i18n'
import { get, set, useStore } from './store'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import {
  createConversation,
  newConversationTitle,
  sendReadiness,
  type ClaudeConversation
} from './lib/claudeConversation'
import { selectConversation } from './lib/claudeSelectors'
import { forgetAgentTimes } from './lib/claudeAgents'
import { asLiveId, type LiveConversationId } from './lib/claudeIds'
import { deleteDraft, moveDraft } from './claudeDrafts'
import { focusPrompt, promptHasFocus, resetPromptRequests } from './claudePromptBridge'
import { dismissToastsWhere, notify } from './toasts'
import { focusEditor } from './components/editor/editorFocus'
import { focusRegion } from './focusBridge'
import { bridge, failed, findConversation, liveConversationId, patchClaude, updateConversation } from './claudeState'
import { earlyEvents, startQueue } from './claudeQueue'
import { forgetReadRequest, toastPrefix } from './claudeVisibility'
import { closeProposalTabs } from './claudePermissions'
import { agentTimes, applyEvent } from './claudeEvents'

export function showClaude(): void {
  set({ claudeVisible: true, screen: 'workbench' })
  // Panel already open but with no conversation (closed every tab): the visibility transition does not fire.
  if (get().claude.conversations.length === 0) void autoStart()
}

export function hideClaude(): void {
  set({ claudeVisible: false })
}

export function toggleClaudeSidebar(): void {
  // On the Containers screen the panel is hidden: the shortcut shows it instead of closing it.
  if (get().claudeVisible && get().screen === 'workbench') hideClaude()
  else showClaude()
}

/**
 * "Claude: Open/Focus": opens the panel and focuses the prompt. With the focus already on the prompt, returns it to the
 * editor (like the VS Code extension).
 */
export function focusClaude(): void {
  if (get().claudeVisible && promptHasFocus()) return focusEditor()
  showClaude()
  focusPrompt()
}

export async function newClaudeConversation(): Promise<void> {
  set({ claudeVisible: true, screen: 'workbench' })
  // The panel's initial conversation still opening is awaited; if it opens empty, it is the "new" one (no second one).
  const initial = startQueue.latest('auto')
  if (initial) {
    const conv = reusableConversation(await initial)
    if (conv) {
      activateConversation(conv.id)
      focusPrompt()
      return
    }
  }
  // Without an open conversation (failed or discarded) there is no box to focus.
  if (await enqueueStart({})) focusPrompt()
}

/** The conversation exists, is alive and has received nothing yet: it can become the "new" one of a requester. */
export function reusableConversation(id: string | null): ClaudeConversation | undefined {
  const conv = id ? findConversation(id) : undefined
  return conv && !conv.dormant && conv.messages.length === 0 && conv.queued.length === 0 ? conv : undefined
}

/**
 * Opens a conversation (new or resumed) on its turn in the queue and makes it active. Returns the id, or `null` if it
 * did not open.
 */
export function enqueueStart(options: ClaudeStartOptions, replace?: string): Promise<LiveConversationId | null> {
  return startQueue.run(() => runStart(options, replace))
}

/**
 * Panel auto start: with another `start` in the queue it does not happen (the queue will already open a conversation).
 */
export function autoStart(): Promise<LiveConversationId | null> | null {
  return startQueue.busy ? null : startQueue.run(runInitialStart, { kind: 'auto' })
}

function runInitialStart(): Promise<LiveConversationId | null> {
  const s = get()
  if (!s.claudeVisible || !s.root || s.claude.conversations.length > 0) return Promise.resolve(null)
  return runStart({})
}

/** ⌃Tab / ⌃⇧Tab with focus in the panel: activates the neighbouring session (cyclic) and keeps the focus in its box. */
export function stepClaudeSession(delta: 1 | -1): void {
  const { conversations, activeId } = get().claude
  if (conversations.length < 2) return
  const at = Math.max(
    conversations.findIndex((c) => c.id === activeId),
    0
  )
  const next = conversations[(at + delta + conversations.length) % conversations.length]
  if (!next) return
  activateConversation(next.id)
  focusPrompt()
}

/**
 * ⌘W with focus in the panel: closes the active session (like the tab's ×); the focus stays in the panel, or goes back
 * to the editor.
 */
export function closeActiveClaudeSession(): void {
  const id = get().claude.activeId
  if (!id) return
  void closeConversation(id)
  // `closeConversation` updates the state before the await: we already know whether a session is left. Without a
  // session the box unmounts with the focus inside: `focusContext.ts` moves the focus to the "New conversation" button
  // (or the editor).
  if (get().claude.conversations.length > 0) focusPrompt()
  // Through the ⋯ menu the button that had the focus becomes disabled without a session: the focus goes to "New
  // conversation" when it mounts.
  else requestAnimationFrame(() => focusRegion('claudeNewConversation'))
}

async function runStart(options: ClaudeStartOptions, replace?: string): Promise<LiveConversationId | null> {
  const { root, settings } = get()
  if (!root) return null
  let retry = false
  try {
    const started = await bridge.start(options)
    if (get().root !== root) {
      // The folder changed during the start: the conversation belongs to a folder the window already left.
      void bridge.close(asLiveId(started.id)).catch(() => {})
      resetPromptRequests()
      // The folder change already tried to open the new conversation, but ran into this `start` in flight.
      retry = true
      return null
    }
    // The dormant tab was closed while waking: the conversation that started cannot resurrect it.
    if (replace && !findConversation(replace)) {
      void bridge.close(asLiveId(started.id)).catch(() => {})
      return null
    }
    const conversation = createConversation(started, {
      permissionMode: options.permissionMode ?? settings['claude.initialPermissionMode'],
      model: options.model ?? settings['claude.model'],
      sessionId: options.resume ?? null,
      // Mirrors main: only a NEW conversation without an explicit effort uses the configured default (empty = the
      // model's); a resume keeps the saved effort (null = automatic).
      effort: options.effort ?? (options.resume ? null : settings['claude.effort'] || null)
    })
    if (replace && findConversation(replace)) {
      // Restored tab that wakes: takes the dormant one's place (order, active and draft go with it).
      moveDraft(replace, started.id)
      const dormant = findConversation(replace)!
      // `tabKey` stays: the UI (panel, prompt box, rename field) does not remount on the id change.
      const awake = { ...conversation, tabKey: dormant.tabKey ?? dormant.id }
      set((s) => ({
        claude: {
          ...s.claude,
          conversations: s.claude.conversations.map((c) => (c.id === replace ? awake : c)),
          activeId: s.claude.activeId === replace ? started.id : s.claude.activeId,
          renamingId: s.claude.renamingId === replace ? started.id : s.claude.renamingId
        }
      }))
    } else
      set((s) => ({
        claude: { ...s.claude, conversations: [...s.claude.conversations, conversation], activeId: started.id }
      }))
    for (const event of earlyEvents.get(started.id) ?? []) applyEvent(event)
    return asLiveId(started.id)
  } catch (err) {
    notify(t().claude.actions.failed(errorMessage(err)))
    // Focus/insertion that were waiting for this conversation's box will never have anywhere to land.
    resetPromptRequests()
    return null
  } finally {
    // Enters the queue right behind this `start`; checks panel, folder and conversations when its turn comes.
    if (retry) void startQueue.run(runInitialStart, { kind: 'auto' })
  }
}

// Restored (dormant) tabs wake only when they appear in an active view: they resume the CLI with the saved `sessionId`.
const wakeKey = (id: string): string => `wake:${id}`

/** What decides whether the active tab should wake. */
interface WakeInputs {
  activeId: string | null
  activeDormant: boolean
  activeWakeState: ClaudeConversation['wakeState']
  hasRoot: boolean
  claudeVisible: boolean
  screen: ReturnType<typeof get>['screen']
  workspacesKnown: boolean
  viewActive: boolean
  starting: boolean
}

/** The active `id` is dormant and in view: it should wake. */
function shouldWake(s: WakeInputs): string | null {
  if (!s.activeDormant || !s.activeId || !s.hasRoot || !s.claudeVisible || s.screen !== 'workbench') return null
  if (!s.workspacesKnown || !s.viewActive || s.starting) return null
  return startQueue.has(wakeKey(s.activeId)) || s.activeWakeState ? null : s.activeId
}

export function wakeIfNeeded(s: WakeInputs): void {
  const wake = shouldWake(s)
  if (wake) void wakeConversation(wake)
}

/**
 * Wakes a dormant tab (resumes the CLI) and returns the REAL conversation id, or `null` if it failed. Simultaneous
 * calls share the same resume. Whoever sends something to main needs the returned id: the dormant one never reaches
 * IPC.
 */
export function wakeConversation(id: string): Promise<LiveConversationId | null> {
  const current = findConversation(id)
  if (!current) return Promise.resolve(null)
  if (!current.dormant) return Promise.resolve(liveConversationId(id))
  // Synchronous (may be inside a subscriber): closes `shouldWake` before the key enters the queue.
  if (!startQueue.has(wakeKey(id))) updateConversation(id, (c) => ({ ...c, wakeState: 'waking' }))
  // Enters the queue one microtask later: a `start` requested in the same tick (e.g. `/clear` in this tab) goes first.
  return Promise.resolve().then(() => startQueue.run(() => runWake(id), { key: wakeKey(id) }))
}

/**
 * Waits for the conversation (real id) to finish loading: `true` when it accepts messages, `false` if it disappeared,
 * ended or failed during the wait. The caller decides what to do with the message; there is no notice here.
 */
export function waitConversationReady(id: string): Promise<boolean> {
  const state = (): ReturnType<typeof sendReadiness> => sendReadiness(selectConversation(id)(get()))
  const now = state()
  if (now !== 'pending') return Promise.resolve(now === 'ready')
  return new Promise((resolve) => {
    const off = useStore.subscribe(
      (s) => sendReadiness(selectConversation(id)(s)),
      (readiness) => {
        if (readiness === 'pending') return
        off()
        resolve(readiness === 'ready')
      }
    )
  })
}

async function runWake(id: string): Promise<LiveConversationId | null> {
  // Read on its turn in the queue: the mode, model or session may have changed while waiting; closed, it does not wake.
  const dormant = findConversation(id)
  if (!dormant?.dormant) return null
  try {
    const result = await runStart(
      {
        ...(dormant.sessionId ? { resume: dormant.sessionId } : {}),
        ...(dormant.model ? { model: dormant.model } : {}),
        permissionMode: dormant.permissionMode,
        ...(dormant.effort ? { effort: dormant.effort } : {})
      },
      id
    )
    // Failed (already notified): the tab shows "Try again"; on its own it only retries when switching tabs.
    if (!result) updateConversation(id, (c) => ({ ...c, wakeState: 'failed' }))
    return result
  } catch {
    updateConversation(id, (c) => ({ ...c, wakeState: 'failed' }))
    return null
  }
}

/** "Try again" in the banner of the tab that did not resume. */
export function retryWake(id: string): void {
  updateConversation(id, (c) => ({ ...c, wakeState: undefined }))
  void wakeConversation(id)
}

/**
 * "New conversation" of the tab that did not resume: forgets the CLI session, keeps the draft and starts a new
 * conversation.
 */
export function startFreshInTab(id: string): void {
  updateConversation(id, (c) => ({ ...c, sessionId: null, wakeState: undefined, title: newConversationTitle() }))
  void wakeConversation(id)
}

export function activateConversation(id: string): void {
  if (findConversation(id)) patchClaude({ activeId: id })
}

/** Releases what belonged to the conversation: proposal diffs, notices, requested read, draft and agent times. */
export function forgetConversation(conv: ClaudeConversation, options: { keepDraft?: boolean } = {}): void {
  const { id } = conv
  void closeProposalTabs((p) => p.conversationId === id)
  dismissToastsWhere((k) => k.startsWith(toastPrefix(id)))
  forgetReadRequest(id)
  if (!options.keepDraft) deleteDraft(id)
  forgetAgentTimes(agentTimes, conv.messages)
}

export async function closeConversation(id: string): Promise<void> {
  const { conversations, activeId } = get().claude
  const index = conversations.findIndex((c) => c.id === id)
  const closing = conversations[index]
  if (!closing) return
  const live = liveConversationId(id)
  forgetConversation(closing)
  const remaining = conversations.filter((c) => c.id !== id)
  const nextActive = activeId === id ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null) : activeId
  patchClaude({
    conversations: remaining,
    activeId: nextActive,
    renamingId: get().claude.renamingId === id ? null : get().claude.renamingId
  })
  // A dormant one has no process in main. A resume in flight undoes itself (the tab no longer exists).
  if (!live) return
  await attempt(() => bridge.close(live), { format: failed })
}

/** Resumes a previous conversation of the folder (activates the tab if it is already open). */
export async function resumeSession(sessionId: string): Promise<void> {
  const open = get().claude.conversations.find((c) => c.sessionId === sessionId)
  if (open) return activateConversation(open.id)
  await startQueue.run(async () => {
    // While waiting in the queue the same session may have been opened.
    const again = get().claude.conversations.find((c) => c.sessionId === sessionId)
    if (again) {
      activateConversation(again.id)
      return null
    }
    const opened = await runStart({ resume: sessionId })
    if (!opened) notify(t().claude.actions.openConversationFailed, 'info')
    return opened
  })
}
