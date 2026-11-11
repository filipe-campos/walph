// Wires the Claude panel to main and the store: events, folder change, visibility, waking dormant tabs, auto start
// and editor context. It is the top of the `claude*` modules: imports all of them, nobody imports it.
import { shallow } from 'zustand/shallow'
import { get, onRootChange, subscribeDiff, useStore } from './store'
import { createReactionScope } from './lib/reactions'
import { selectActiveConversation } from './lib/claudeSelectors'
import type { ClaudeConversation } from './lib/claudeConversation'
import { forgetDrafts } from './claudeDrafts'
import { resetPromptRequests } from './claudePromptBridge'
import { decideAutoStart } from './lib/claudeStartQueue'
import { dismissToastsWhere } from './toasts'
import { bridge, updateConversation } from './claudeState'
import { earlyEvents } from './claudeQueue'
import { isVisible, resetReadRequests, syncRead, watchWindowFocus } from './claudeVisibility'
import { closeProposalTabs, showAttentionToast } from './claudePermissions'
import { agentTimes, handleEvent, resetDeltas } from './claudeEvents'
import { autoStart, wakeIfNeeded } from './claudeLifecycle'
import { resetEditorContext, scheduleEditorContext, stopEditorContext } from './claudeEditorContext'
import { hydrateDormantMeta, resetMetaRequests } from './claudeSessionMeta'
import { handleStartRequested, loadFavoriteCommands } from './claudePromptActions'
import { stopLoginPoll } from './claudeLogin'

type StoreState = ReturnType<typeof get>

/** Everything the Claude store listener reads to decide. */
interface ClaudeInputs {
  activeId: string | null
  conversationCount: number
  starting: boolean
  activeDormant: boolean
  activeWakeState: ClaudeConversation['wakeState']
  claudeVisible: boolean
  screen: StoreState['screen']
  viewActive: boolean
  workspacesKnown: boolean
  hasRoot: boolean
  tabs: StoreState['tabs']
  activeTabId: StoreState['activeTabId']
  cursor: StoreState['cursor']
}

/** The panel was restored visible in a hidden view: the initial conversation starts when it becomes active. */
let startDeferred = false

/** Wires the panel to main (events, folder change, opening, editor context). Returns the teardown. */
export function startClaudeReactions(): () => void {
  const scope = createReactionScope()
  scope.add(bridge.onEvent(handleEvent))
  scope.add(bridge.onStartRequested(handleStartRequested))

  scope.add(onRootChange(resetForRoot))
  // The selector covers everything the listener reads to decide; the streaming text is not in it.
  scope.add(
    subscribeDiff(
      (s): ClaudeInputs => {
        const active = selectActiveConversation(s)
        return {
          activeId: s.claude.activeId,
          conversationCount: s.claude.conversations.length,
          starting: s.claude.starting,
          activeDormant: !!active?.dormant,
          activeWakeState: active?.wakeState,
          claudeVisible: s.claudeVisible,
          screen: s.screen,
          viewActive: s.viewActive,
          workspacesKnown: s.workspaces !== null,
          hasRoot: !!s.root,
          tabs: s.tabs,
          activeTabId: s.activeTabId,
          cursor: s.cursor
        }
      },
      (s, prev) => {
        onVisibility(s, prev)
        // Switching to a tab that failed to resume tries again.
        if (s.activeId !== prev.activeId) {
          const next = selectActiveConversation(get())
          if (next?.wakeState === 'failed') updateConversation(next.id, (c) => ({ ...c, wakeState: undefined }))
        }
        wakeIfNeeded(s)
        maybeAutoStart(s, prev)
        scheduleEditorContext(s, prev)
      },
      shallow
    )
  )
  scope.add(
    useStore.subscribe((s) => s.claude.conversations.filter((c) => c.dormant && c.sessionId), hydrateDormantMeta, {
      equalityFn: shallow
    })
  )

  const initialRoot = get().root
  if (initialRoot) void loadFavoriteCommands(initialRoot)
  scope.add(watchWindowFocus())

  scope.add(() => {
    stopLoginPoll()
    stopEditorContext()
    resetDeltas()
  })
  return scope.stop
}

/** Another folder: main already killed the previous one's conversations. */
function resetForRoot(s: StoreState): void {
  stopLoginPoll()
  resetClaude()
  if (s.root) void loadFavoriteCommands(s.root)
}

/**
 * Panel shown/hidden, another active tab or this workspace becoming the visible one again: reads the session in view.
 */
function onVisibility(s: ClaudeInputs, prev: ClaudeInputs): void {
  if (s.claudeVisible !== prev.claudeVisible || s.screen !== prev.screen || s.activeId !== prev.activeId) syncRead()
  // Main also resets everything on activation.
  if (s.viewActive && !prev.viewActive) {
    syncRead()
    // Requests that arrived while the view was hidden got no toast: notifies now (the per-request key avoids
    // duplicates).
    for (const conv of get().claude.conversations)
      if (!isVisible(conv.id)) for (const request of conv.permissions) showAttentionToast(conv.id, request)
  }
}

/**
 * Opening the panel (or restoring it from the session) with no conversation starts one, but only in an active view: a
 * hidden workspace does not spawn a Claude process for nothing; it starts when it becomes the visible one again.
 */
function maybeAutoStart(s: ClaudeInputs, prev: ClaudeInputs): void {
  const decision = decideAutoStart(
    {
      known: s.workspacesKnown,
      viewActive: s.viewActive,
      visible: s.claudeVisible,
      prevVisible: prev.claudeVisible,
      hasRoot: s.hasRoot,
      conversations: s.conversationCount
    },
    startDeferred
  )
  startDeferred = decision.deferred
  if (decision.start) void autoStart()
}

function resetClaude(): void {
  resetDeltas()
  void closeProposalTabs(() => true)
  earlyEvents.clear()
  resetPromptRequests()
  resetEditorContext()
  forgetDrafts()
  resetReadRequests()
  dismissToastsWhere((k) => k.startsWith('claude:'))
  agentTimes.started.clear()
  agentTimes.finished.clear()
  resetMetaRequests()
}
