// Reducer of main events over a Claude panel conversation. Pure: the store only keeps the result.
import type { ClaudeBlock, ClaudeEvent, ClaudeMessage } from '@shared/types'
import {
  NO_ENTRIES,
  userText,
  type ClaudeConversation,
  type QueuedMessage,
  type StreamBlock
} from './claudeConversation'

function upsertMessage(messages: ClaudeMessage[], message: ClaudeMessage): ClaudeMessage[] {
  const at = messages.findIndex((m) => m.uuid === message.uuid)
  if (at < 0) return [...messages, message]
  const next = messages.slice()
  next[at] = message
  return next
}

/**
 * Removes from the streaming what the complete message already covers (text/reasoning); only a tool = end of the
 * response.
 */
function settleStreaming(streaming: StreamBlock[], message: ClaudeMessage): StreamBlock[] {
  if (streaming.length === 0 || message.role !== 'assistant' || message.parentToolUseId !== null) return streaming
  const hasText = message.blocks.some((b) => b.type === 'text')
  const hasThinking = message.blocks.some((b) => b.type === 'thinking')
  if (!hasText && !hasThinking) return message.blocks.some((b) => b.type === 'toolUse') ? [] : streaming
  return streaming.filter((s) => !(s.kind === 'text' ? hasText : hasThinking))
}

function isQueuedEcho(conv: ClaudeConversation, message: ClaudeMessage): boolean {
  return (
    message.role === 'user' &&
    !!message.checkpoint &&
    message.parentToolUseId === null &&
    conv.status === 'working' &&
    !conv.waiting.includes(message.uuid) &&
    !conv.messages.some((m) => m.uuid === message.uuid)
  )
}

/**
 * Local message with what was left in the streaming, or `null` if there is no text. The uuid never collides with the
 * CLI ones.
 */
function partialMessage(conv: ClaudeConversation): ClaudeMessage | null {
  const blocks: ClaudeBlock[] = [...conv.streaming]
    .sort((a, b) => a.index - b.index)
    .filter((s) => s.text.trim() !== '')
    .map((s) => ({ type: s.kind, text: s.text }))
  if (blocks.length === 0) return null
  return { uuid: `local:${conv.id}:${conv.messages.length}`, role: 'assistant', blocks, parentToolUseId: null }
}

function settleQueued(queued: QueuedMessage[], message: ClaudeMessage): QueuedMessage[] {
  if (message.role !== 'user' || queued.length === 0) return queued
  const byUuid = queued.findIndex((q) => q.uuid === message.uuid)
  if (byUuid >= 0) return queued.filter((_, i) => i !== byUuid)
  // The echo may arrive before `send` replies (uuid still unknown): matches by text, oldest first.
  const text = userText(message)
  const byText = queued.findIndex((q) => q.uuid === null && q.text.trim() === text)
  return byText >= 0 ? queued.filter((_, i) => i !== byText) : queued
}

export function reduceEvent(conv: ClaudeConversation, event: ClaudeEvent): ClaudeConversation {
  switch (event.type) {
    case 'init':
      return {
        ...conv,
        sessionId: event.sessionId,
        model: event.model,
        permissionMode: event.permissionMode,
        commands: event.commands,
        models: event.models,
        effort: event.effort === undefined ? conv.effort : event.effort,
        ready: true,
        account: event.account === undefined ? conv.account : event.account,
        error: null
      }
    case 'mcpReady':
      return { ...conv, mcpReady: true }
    case 'status': {
      // New process: `init` and `mcpReady` only count again when it emits them.
      if (event.status === 'starting') return { ...conv, status: 'starting', ready: false, mcpReady: false }
      if (event.status === 'working')
        return {
          ...conv,
          status: event.status,
          error: null,
          lastTurnMs: null,
          turnStartedAt: conv.turnStartedAt ?? Date.now(),
          // New turn: the suggestion got stale and the previous turn's progress no longer counts.
          suggestion: null,
          taskProgress: conv.status === 'working' ? conv.taskProgress : NO_ENTRIES,
          toolElapsed: conv.status === 'working' ? conv.toolElapsed : NO_ENTRIES
        }
      // Conversation closed: the background tasks died with the process.
      const background = event.status === 'closed' ? [] : conv.background
      // Turn ended (or interrupted) without the final message: the text already shown becomes a local message instead
      // of vanishing.
      const kept = partialMessage(conv)
      return {
        ...conv,
        status: event.status,
        messages: kept ? [...conv.messages, kept] : conv.messages,
        streaming: [],
        waiting: [],
        background,
        turnStartedAt: null,
        // With no turn running there is no retry nor tool in progress.
        retry: null,
        toolElapsed: NO_ENTRIES
      }
    }
    case 'message':
      return {
        ...conv,
        messages: upsertMessage(conv.messages, event.message),
        streaming: settleStreaming(conv.streaming, event.message),
        queued: settleQueued(conv.queued, event.message),
        // Main echoes the message before marking `working`: an echo with Claude already busy = it went into the CLI
        // queue.
        waiting: isQueuedEcho(conv, event.message) ? [...conv.waiting, event.message.uuid] : conv.waiting,
        retry: null,
        toolElapsed: dropFinishedTools(conv.toolElapsed, event.message)
      }
    case 'delta': {
      const at = conv.streaming.findIndex((s) => s.index === event.index && s.kind === event.kind)
      const block = conv.streaming[at]
      // Text arriving = the API replied (no retry) and the old suggestion no longer counts.
      if (!block)
        return {
          ...conv,
          streaming: [...conv.streaming, { index: event.index, kind: event.kind, text: event.text }],
          retry: null,
          suggestion: null
        }
      const next = conv.streaming.slice()
      next[at] = { ...block, text: block.text + event.text }
      return { ...conv, streaming: next, retry: null, suggestion: null }
    }
    case 'permission':
      if (conv.permissions.some((p) => p.requestId === event.request.requestId)) return conv
      return { ...conv, permissions: [...conv.permissions, event.request] }
    case 'permissionCancelled':
      return { ...conv, permissions: conv.permissions.filter((p) => p.requestId !== event.requestId) }
    case 'result': {
      // End of the turn (main emits one per turn): the partial must not stick to the next turn's deltas.
      const kept = partialMessage(conv)
      return {
        ...conv,
        costUsd: event.costUsd,
        context: event.context ?? conv.context,
        messages: kept ? [...conv.messages, kept] : conv.messages,
        streaming: [],
        lastTurnMs: event.durationMs,
        // Queued message: the CLI already starts the next turn without a new `status`.
        turnStartedAt: conv.waiting.length > 0 ? Date.now() : null,
        waiting: conv.waiting.slice(1),
        retry: null,
        toolElapsed: NO_ENTRIES
      }
    }
    case 'commandOutput':
      return {
        ...conv,
        notes: [
          ...conv.notes,
          {
            key: `note:${conv.notes.length}:${event.timestamp}`,
            at: conv.messages.length,
            kind: 'commandOutput',
            text: event.text,
            timestamp: event.timestamp
          }
        ]
      }
    case 'compacted':
      return {
        ...conv,
        notes: [
          ...conv.notes,
          {
            key: `note:${conv.notes.length}:${event.timestamp}`,
            at: conv.messages.length,
            kind: 'compacted',
            trigger: event.trigger,
            preTokens: event.preTokens,
            timestamp: event.timestamp
          }
        ]
      }
    case 'autoTurn':
      return {
        ...conv,
        notes: [
          ...conv.notes,
          {
            key: `note:${conv.notes.length}:${event.timestamp}`,
            at: conv.messages.length,
            kind: 'autoTurn',
            reason: event.reason,
            timestamp: event.timestamp
          }
        ]
      }
    case 'backgroundTasks':
      return { ...conv, background: event.tasks }
    case 'permissionMode':
      return { ...conv, permissionMode: event.mode }
    case 'title': {
      const auto = event.title.trim()
      if (!auto) return conv
      // The automatic title is kept (to "go back to automatic"), but only shows without a user title.
      return { ...conv, autoTitle: auto, title: conv.userTitle ?? auto }
    }
    case 'error':
      return { ...conv, error: event.error, turnStartedAt: null }
    case 'sessionStatus':
      if (conv.agentStatus === event.status && conv.unread === event.unread) return conv
      return { ...conv, agentStatus: event.status, unread: event.unread }
    case 'rateLimit': {
      const next = event.limit.status === 'allowed' ? null : event.limit
      const prev = conv.rateLimit
      if (next === prev) return conv
      if (
        next &&
        prev &&
        next.status === prev.status &&
        next.window === prev.window &&
        next.percent === prev.percent &&
        next.resetsAt === prev.resetsAt &&
        next.usingOverage === prev.usingOverage
      )
        return conv
      return { ...conv, rateLimit: next }
    }
    case 'retry':
      return {
        ...conv,
        retry: {
          attempt: event.attempt,
          maxRetries: event.maxRetries,
          delayMs: event.delayMs,
          errorStatus: event.errorStatus,
          timestamp: event.timestamp
        }
      }
    case 'permissionDenied':
      // Idempotent: the same `toolUseId` only becomes one notice.
      if (conv.notes.some((n) => n.kind === 'denied' && n.toolUseId === event.toolUseId)) return conv
      return {
        ...conv,
        notes: [
          ...conv.notes,
          {
            key: `note:${conv.notes.length}:${event.timestamp}`,
            at: conv.messages.length,
            kind: 'denied',
            toolUseId: event.toolUseId,
            toolName: event.toolName,
            reason: event.reason,
            timestamp: event.timestamp
          }
        ]
      }
    case 'taskProgress': {
      const { progress } = event
      // Only what the strip shows counts (duration and last tool change on every event and do not show).
      // A task without a call matches no row of the agents strip.
      if (progress.toolUseId === null) return conv
      const prev = conv.taskProgress[progress.toolUseId]
      if (
        prev &&
        prev.summary === progress.summary &&
        prev.totalTokens === progress.totalTokens &&
        prev.toolUses === progress.toolUses
      )
        return conv
      return { ...conv, taskProgress: { ...conv.taskProgress, [progress.toolUseId]: progress } }
    }
    case 'promptSuggestion': {
      const suggestion = event.suggestion.trim()
      if (!suggestion || suggestion === conv.suggestion) return conv
      return { ...conv, suggestion }
    }
    case 'toolProgress':
      if (conv.toolElapsed[event.toolUseId] === event.elapsedSeconds) return conv
      return { ...conv, toolElapsed: { ...conv.toolElapsed, [event.toolUseId]: event.elapsedSeconds } }
    case 'modelFallback': {
      if (event.retracted.length === 0) return conv
      const gone = new Set(event.retracted)
      const removedAt: number[] = []
      conv.messages.forEach((m, i) => {
        if (gone.has(m.uuid)) removedAt.push(i)
      })
      if (removedAt.length === 0) return conv
      // The notices keep "how many messages there were": removing messages before them shifts the position.
      const notes = conv.notes.map((n) => {
        const shift = removedAt.filter((i) => i < n.at).length
        return shift === 0 ? n : { ...n, at: n.at - shift }
      })
      return { ...conv, messages: conv.messages.filter((m) => !gone.has(m.uuid)), notes }
    }
    case 'reveal':
    case 'notice':
      return conv
  }
}

/** Removes from `toolElapsed` the tools whose result arrived in the message (same reference if nothing changed). */
function dropFinishedTools(
  elapsed: Readonly<Record<string, number>>,
  message: ClaudeMessage
): Readonly<Record<string, number>> {
  let next: Record<string, number> | null = null
  for (const block of message.blocks) {
    if (block.type !== 'toolResult' || !((next ?? elapsed)[block.toolUseId] !== undefined)) continue
    next ??= { ...elapsed }
    delete next[block.toolUseId]
  }
  return next ?? elapsed
}

/** User title (`null` = back to automatic; without a known automatic one keeps the text until main reports it). */
