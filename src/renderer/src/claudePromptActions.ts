// Sending messages to Claude and everything that starts from the prompt box: local commands (`/clear`, `/mcp`,
// `/usage`, `/login`, `/logout`), attachments, the `/` menu, favorite commands, "Ask Claude" and "Start with Claude".
import type {
  ClaudeAttachment,
  ClaudeAttachmentFile,
  ClaudeAttachmentResult,
  ClaudeImage,
  ClaudePromptInput,
  ClaudeSlashCommand,
  ClaudeStartRequest
} from '@shared/types'
import type { ClaudeFavoriteCommand } from '@shared/favoriteCommands'
import { t } from '@shared/i18n'
import { get, set } from './store'
import { attempt } from './attempt'
import {
  addQueued,
  bindQueuedUuid,
  loadStep,
  removeQueued,
  userText,
  type ClaudeConversation,
  type QueuedMessage
} from './lib/claudeConversation'
import { errorMessage } from './lib/errors'
import { mergeAttachments } from './lib/claudeAttachments'
import { moveItem } from './lib/tabOrder'
import { localCommandOf } from './lib/claudePrompt'
import { parseMentions } from './lib/claudeMentions'
import { createStartQueue } from './lib/claudeStartQueue'
import { focusPrompt, insertIntoPrompt, restorePromptText } from './claudePromptBridge'
import { loadProjectFiles } from './projectFiles'
import { workspaceReady } from './sessionActions'
import { notify, showToast } from './toasts'
import {
  activeConversation,
  bridge,
  failed,
  findConversation,
  liveConversationId,
  updateConversation
} from './claudeState'
import { startQueue } from './claudeQueue'
import {
  enqueueStart,
  forgetConversation,
  reusableConversation,
  waitConversationReady,
  wakeConversation
} from './claudeLifecycle'
import { readEditorContext } from './claudeEditorContext'
import { openClaudeMcp, openClaudeUsage } from './claudeMcpActions'
import { openCommandArgsModal } from './overlayActions'
import { logoutClaude, openClaudeLogin } from './claudeLogin'

/** The user typed or accepted the next prompt suggestion: it no longer applies. */
export function clearPromptSuggestion(id: string): void {
  updateConversation(id, (c) => (c.suggestion === null ? c : { ...c, suggestion: null }))
}

/**
 * "Ask Claude" from the palette: opens the panel (the user sees the progress), uses a NEW session and sends `text` as
 * the first prompt. Opening the panel with no conversations already triggers the initial conversation: it is empty and
 * just created, so it is reused (awaiting the `start` in flight) instead of opening a second one. If it does not open,
 * the query becomes a draft in the prompt.
 */
export async function askClaude(text: string, options: { reuseStart?: boolean } = {}): Promise<void> {
  const query = text.trim()
  if (!get().root || !query) return
  // `reuseStart` ("Start with Claude" request): in a just-opened folder the `start` in flight is the opening's own.
  const opened = options.reuseStart || !get().claudeVisible
  set({ claudeVisible: true, screen: 'workbench' })
  // Only the auto start (this panel opening's) is reused: a `start` of another kind may be a `resumeSession`, and the
  // question must go to a new session.
  const initial = opened ? startQueue.latest('auto') : null
  let id: string | null = reusableConversation(initial ? await initial : null)?.id ?? null
  // No start in flight (the session restore already finished opening an empty conversation): reuses the active one if
  // new.
  if (!id && options.reuseStart) {
    const active = activeConversation()
    // Dormant counts: a restored tab with only a draft has no session and wakes on send.
    if (active && !active.sessionId && active.messages.length === 0 && active.queued.length === 0) id = active.id
  }
  id ??= await enqueueStart({})
  if (!id) {
    notify(t().claude.actions.start.sessionFailed)
    insertIntoPrompt(query)
    return
  }
  focusPrompt()
  if (!(await sendPrompt(id, query, [], get().settings['claude.autoContext']))) insertIntoPrompt(query)
}

/**
 * "Start with Claude" requests in their own queue (wait for the folder + open + send): the second only picks the
 * conversation after the first one sent. It cannot be `startQueue`: the request enqueues `start`s in it and would wait
 * for itself.
 */
const startRequestQueue = createStartQueue<void>()

/**
 * "Start with Claude": main opened the folder and asks for a new session with the prompt. Without a folder in time
 * (15 s) the request is discarded with a notice: never sends the text to another folder.
 */
export function handleStartRequested({ root, prompt }: ClaudeStartRequest): void {
  // A failure must not block the following requests.
  void attempt(
    () =>
      startRequestQueue.run(async () => {
        if (!(await workspaceReady(root, 15_000))) {
          // The field was already cleared on the welcome screen: the request is not lost, "Copy request" returns it.
          showToast({
            ai: true,
            tone: 'attention',
            title: t().claude.actions.start.folderTimeout,
            description: t().claude.actions.start.notSent,
            actions: [
              {
                label: t().claude.actions.start.copyRequest,
                onClick: () => void navigator.clipboard.writeText(prompt).catch(() => {})
              }
            ]
          })
          return
        }
        await askClaude(prompt, { reuseStart: true })
      }),
    { format: failed }
  )
}

let queueSeq = 0

const tabKeyOf = (c: ClaudeConversation): string => c.tabKey ?? c.id

/** The tab's conversation: the id changes when a dormant tab wakes, the `tabKey` does not. */
function conversationOfTab(tab: string): ClaudeConversation | undefined {
  return get().claude.conversations.find((c) => tabKeyOf(c) === tab)
}

/**
 * Pending deliveries per tab, serialized: messages sent before the session is ready go out in the order they were
 * given.
 */
const deliveries = new Map<string, Promise<void>>()
/**
 * Messages accepted and not yet delivered per tab, in order; `deliveryGenerations` invalidates the queued ones when one
 * fails.
 */
const pendingDeliveries = new Map<string, QueuedMessage[]>()
const deliveryGenerations = new Map<string, number>()

/**
 * Prompt text + mentions, attachments and editor context. `null` = the folder changed or the tab closed during the
 * read.
 */
async function buildPromptInput(
  root: string,
  trimmed: string,
  images: ClaudeImage[],
  files: ClaudeAttachment[],
  autoContext: boolean,
  stillOpen: () => boolean
): Promise<ClaudePromptInput | null> {
  let known: ((rel: string) => boolean) | undefined
  try {
    const list = await loadProjectFiles(root)
    if (!list.truncated) {
      const names = new Set([...list.files, ...list.folders.map((f) => f.slice(0, -1))])
      known = (rel) => names.has(rel)
    }
  } catch {
    // Without the list, every mention becomes an attachment; main refuses what does not exist.
  }
  // The window may have changed folder or closed the conversation while the list was read.
  if (get().root !== root || !stillOpen()) return null
  const context = autoContext ? readEditorContext() : null
  return {
    text: trimmed,
    attachments: mergeAttachments(files, parseMentions(trimmed, root, known)),
    images,
    activeFile: context?.activeFile ?? null,
    selection: context?.selection ?? null
  }
}

/**
 * Sends the message. With Claude working it enters the CLI queue and shows as "queued" until main's echo.
 * With the session still loading (dormant tab, `init`, MCP) the message shows right away as "Sending…" and goes out
 * when the session is ready; then `true` means "accepted" and a late failure returns the text to the box with a notice.
 * `false` = nothing was sent (the box keeps the text).
 */
export async function sendPrompt(
  id: string,
  text: string,
  images: ClaudeImage[],
  autoContext: boolean,
  files: ClaudeAttachment[] = []
): Promise<boolean> {
  const { root } = get()
  const conv = findConversation(id)
  const trimmed = text.trim()
  if (!root || !conv || (!trimmed && images.length === 0 && files.length === 0)) return false
  // Bare `/clear`: the CLI does not accept it in SDK mode; here it becomes a new conversation in place of this tab.
  if (trimmed === '/clear' && images.length === 0 && files.length === 0) return clearConversation(id)
  // Bare `/mcp`: the CLI has no screen in SDK mode; opens the manager (the box clears as on a send).
  if (trimmed === '/mcp' && images.length === 0 && files.length === 0) {
    void openClaudeMcp(id)
    return true
  }
  // Bare `/usage`, `/login` and `/logout`: Walph screens (the CLI cannot show them in SDK mode).
  const local = images.length === 0 && files.length === 0 ? localCommandOf(trimmed) : null
  if (local === 'usage') {
    void openClaudeUsage(id)
    return true
  }
  if (local === 'logout') {
    void logoutClaude()
    return true
  }
  if (local === 'login') {
    void openClaudeLogin()
    return true
  }
  if (conv.status === 'closed') {
    notify(t().claude.actions.conversationEnded, 'info')
    return false
  }
  const tab = tabKeyOf(conv)
  const key = `q${++queueSeq}`
  const item = { key, text: trimmed, imageCount: images.length, uuid: null }
  const stillOpen = (): boolean => conversationOfTab(tab) !== undefined

  if (conv.dormant || loadStep(conv) !== null || deliveries.has(tab)) {
    updateConversation(id, (c) => addQueued(c, item))
    const input = buildPromptInput(root, trimmed, images, files, autoContext, stillOpen)
    const generation = deliveryGenerations.get(tab) ?? 0
    pendingDeliveries.set(tab, [...(pendingDeliveries.get(tab) ?? []), item])
    const run = (deliveries.get(tab) ?? Promise.resolve()).then(() =>
      deliverEarly(tab, generation, root, item, input).catch(() => {})
    )
    deliveries.set(tab, run)
    void run.then(() => {
      if (deliveries.get(tab) === run) deliveries.delete(tab)
    })
    return true
  }

  const live = liveConversationId(id)
  const input = await buildPromptInput(root, trimmed, images, files, autoContext, stillOpen)
  if (!live || !input) return false
  updateConversation(id, (c) => addQueued(c, item))
  return attempt(
    async () => {
      const uuid = await bridge.send(live, input)
      updateConversation(id, (c) => bindQueuedUuid(c, key, uuid))
      return true
    },
    { format: failed, fallback: false, onError: () => updateConversation(id, (c) => removeQueued(c, key)) }
  )
}

/** Delivers a message accepted before the session is ready: wakes the tab, waits for `init`/MCP and sends. */
async function deliverEarly(
  tab: string,
  generation: number,
  root: string,
  item: QueuedMessage,
  pendingInput: Promise<ClaudePromptInput | null>
): Promise<void> {
  // A previous failure of this tab already returned this text to the box.
  if ((deliveryGenerations.get(tab) ?? 0) !== generation) return
  const dropQuietly = (): void => {
    const conv = conversationOfTab(tab)
    if (conv) updateConversation(conv.id, (c) => removeQueued(c, item.key))
  }
  try {
    let conv = conversationOfTab(tab)
    if (!conv || get().root !== root) return dropQuietly()
    let live = liveConversationId(conv.id)
    if (!live) {
      updateConversation(conv.id, (c) => (c.wakeState === 'failed' ? { ...c, wakeState: undefined } : c))
      live = await wakeConversation(conv.id)
      if (!live) return abortDeliveries(tab, t().claude.actions.notDelivered)
      conv = conversationOfTab(tab)
      if (!conv) return dropQuietly()
    }
    // Waking creates the conversation again (without the dormant one's queue): the message moves to it, including those
    // that were waiting for the previous delivery and already find the tab awake.
    updateConversation(conv.id, (c) => (c.queued.some((q) => q.key === item.key) ? c : addQueued(c, item)))
    const input = await pendingInput
    if (!input) return dropQuietly()
    if (!(await waitConversationReady(conv.id))) {
      const ended = conversationOfTab(tab)?.status === 'closed'
      return abortDeliveries(tab, ended ? t().claude.actions.conversationEnded : t().claude.actions.notDelivered)
    }
    const id = conv.id
    const uuid = await bridge.send(live, input)
    updateConversation(id, (c) => bindQueuedUuid(c, item.key, uuid))
  } catch (err) {
    abortDeliveries(tab, failed(errorMessage(err)))
  } finally {
    const rest = pendingDeliveries.get(tab)?.filter((q) => q.key !== item.key)
    if (rest?.length) pendingDeliveries.set(tab, rest)
    else pendingDeliveries.delete(tab)
  }
}

/**
 * Delivery of one of the tab's messages failed: the ones still waiting go too (sending them without the first would
 * change the conversation order), a single notice, and all texts go back to the box at once, in order.
 */
function abortDeliveries(tab: string, reason: string): void {
  deliveryGenerations.set(tab, (deliveryGenerations.get(tab) ?? 0) + 1)
  const items = pendingDeliveries.get(tab) ?? []
  pendingDeliveries.delete(tab)
  const conv = conversationOfTab(tab)
  if (conv) {
    const keys = new Set(items.map((q) => q.key))
    updateConversation(conv.id, (c) => ({ ...c, queued: c.queued.filter((q) => !keys.has(q.key)) }))
  }
  notify(reason, 'error')
  if (conv && items.length > 0) restorePromptText(conv.id, items.map((q) => q.text).join('\n\n'))
}

/**
 * `/clear`: starts a NEW session in place of this tab (same position and `tabKey`, same model, mode and effort) and
 * ends the old one. Title and cost reset because it is another conversation. `false` = nothing changed (the box keeps
 * the text).
 */
async function clearConversation(id: string): Promise<boolean> {
  const conv = findConversation(id)
  if (!conv) return false
  // As in rewind: switching the session with the turn running would lose what Claude is doing.
  if (conv.status === 'working') {
    notify(t().claude.actions.waitToClear, 'info')
    return false
  }
  const live = liveConversationId(id)
  const started = await enqueueStart(
    {
      ...(conv.model ? { model: conv.model } : {}),
      permissionMode: conv.permissionMode,
      ...(conv.effort ? { effort: conv.effort } : {})
    },
    id
  )
  if (!started) {
    notify(t().claude.actions.clearFailed, 'info')
    return false
  }
  // The draft already went to the new conversation.
  forgetConversation(conv, { keepDraft: true })
  if (live) await bridge.close(live).catch(() => {})
  return true
}

/** "Try again" in the error banner: repeats the user's last message (without images). */
export function retryLastPrompt(id: string): void {
  const conv = findConversation(id)
  if (!conv || conv.dormant) return
  const last = conv.messages.findLast((m) => m.role === 'user' && m.checkpoint && m.parentToolUseId === null)
  const text = last ? userText(last) : ''
  if (!text) return notify(t().claude.actions.nothingToRepeat, 'info')
  updateConversation(id, (c) => ({ ...c, error: null }))
  void sendPrompt(id, text, [], false)
}

/** Esc / stop button. */
export function interruptConversation(id: string): void {
  const live = liveConversationId(id)
  if (!live) return
  void attempt(() => bridge.interrupt(live), { format: failed })
}

/** Stop button of a background task. `false` = it did not stop (the notice was already shown). */
export async function stopBackgroundTask(id: string, taskId: string): Promise<boolean> {
  const live = liveConversationId(id)
  if (!live) return false
  return attempt(
    async () => {
      await bridge.stopTask(live, taskId)
      return true
    },
    { format: failed, fallback: false }
  )
}

/** Sends `/compact` like any message (the CLI handles the command). */
export function compactConversation(id: string): void {
  if (findConversation(id)?.dormant) return
  void sendPrompt(id, '/compact', [], false)
}

// ---------- Attachments and commands ----------

function reportRejected(result: ClaudeAttachmentResult): ClaudeAttachmentFile[] {
  for (const r of result.rejected) notify(t().claude.actions.attachFailed(r.name, r.reason))
  return result.files
}

/** The paperclip: native dialog in main. Cancelling returns an empty list. */
export async function pickAttachments(): Promise<ClaudeAttachmentFile[]> {
  return attempt(async () => reportRejected(await bridge.pickAttachments()), { format: failed, fallback: [] })
}

/** Dragged files: main allows the ones inside the folder and asks about the ones outside. */
export async function authorizeAttachments(paths: string[]): Promise<ClaudeAttachmentFile[]> {
  if (paths.length === 0) return []
  return attempt(async () => reportRejected(await bridge.authorizeAttachments(paths)), {
    format: failed,
    fallback: []
  })
}

/** List of the `/` menu (reread by main on each opening); failed → the `init` one. */
export async function loadSlashCommands(id: string): Promise<ClaudeSlashCommand[] | null> {
  const live = liveConversationId(id)
  if (!live) return null
  return attempt(() => bridge.commands(live), { quiet: true, fallback: null })
}

// ---------- Favorite commands ----------

/** Reads the folder's favorites; only applies them if the view is still on it (another folder's reply is discarded). */
export async function loadFavoriteCommands(root: string): Promise<void> {
  try {
    const list = await bridge.favoriteCommands(root)
    if (get().root === root) set({ claudeFavoriteCommands: list })
  } catch {
    // Without the list the strip stays empty; the next folder change tries again.
  }
}

/**
 * Favorite changes are queued: each one starts from the list the previous one left (adding and then removing another
 * resurrects nothing) and main validates and returns the saved one, which is the one shown. Nothing optimistic.
 */
let favoritesChain: Promise<unknown> = Promise.resolve()

function changeFavoriteCommands(edit: (list: ClaudeFavoriteCommand[]) => ClaudeFavoriteCommand[]): Promise<void> {
  const run = async (): Promise<void> => {
    const { root } = get()
    if (!root) return
    await attempt(
      async () => {
        const saved = await bridge.setFavoriteCommands(root, edit(get().claudeFavoriteCommands))
        if (get().root === root) set({ claudeFavoriteCommands: saved })
      },
      { format: failed }
    )
  }
  const next = favoritesChain.then(run, run)
  favoritesChain = next
  return next
}

export function addFavoriteCommand(command: ClaudeFavoriteCommand): Promise<void> {
  return changeFavoriteCommands((list) => (list.some((f) => f.name === command.name) ? list : [...list, command]))
}

export function reorderFavoriteCommand(name: string, to: number): Promise<void> {
  return changeFavoriteCommands((list) => {
    const from = list.findIndex((f) => f.name === name)
    return from < 0 ? list : moveItem(list, from, to)
  })
}

export function removeFavoriteCommand(name: string): Promise<void> {
  return changeFavoriteCommands((list) => list.filter((f) => f.name !== name))
}

/**
 * Click on a favorite command: sends `/name` directly to the conversation in view (with Claude working, it is queued
 * like any message). Without an open conversation, opens a new one with it.
 */
export async function runFavoriteCommand(conversationId: string | null, name: string): Promise<void> {
  const text = `/${name}`
  const conv = conversationId ? findConversation(conversationId) : undefined
  if (!conv || conv.status === 'closed') {
    await askClaude(text)
    return
  }
  // The commands list only arrives with `init`: with the session loading, waits for it to know whether it asks for
  // arguments.
  let current = conv
  if (current.commands.length === 0 && loadStep(current) !== null) {
    const tab = tabKeyOf(current)
    if (current.dormant && !(await wakeConversation(current.id))) {
      notify(t().claude.actions.notDelivered, 'error')
      return
    }
    const awake = conversationOfTab(tab)
    if (!awake || !(await waitConversationReady(awake.id))) return
    current = conversationOfTab(tab) ?? current
  }
  // A command that expects arguments: asks before sending.
  const hint = current.commands.find((c) => c.name === name)?.argumentHint.trim()
  if (hint) {
    openCommandArgsModal(current.id, name, hint)
    return
  }
  // No automatic context: the command already says what to do, the open file does not go along.
  await sendPrompt(current.id, text, [], false)
}
