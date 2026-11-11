// SDK/transcript messages → the contract's `ClaudeMessage`. Everything that comes from Claude is untrusted: here we
// only change the shape (text stays text; whoever renders sanitizes). Pure and tolerant of unexpected formats.

import { isNonEmptyString, isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { ClaudeBlock, ClaudeMessage } from '@shared/types'
import { isCommandWrapperText } from './commandOutput'
import { isInjectedContext } from './buildPrompt'
import { contextOfTexts } from './ideContext'
import { isTaskNotification, parseTaskNotification } from './taskNotification'
import { truncateToolOutput } from './textLimits'

/** `content` of a `tool_result`: plain text or a list of blocks (text/image). */
export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!isRecord(part)) return ''
      if (part.type === 'text' && typeof part.text === 'string') return part.text
      if (part.type === 'image') return t().claudeHost.conversation.image
      return ''
    })
    .filter((s) => s !== '')
    .join('\n')
}

export interface NormalizeOptions {
  /** Message from the transcript (resume): drops the context Walph injected and the CLI system blocks. */
  history?: boolean
}

function normalizeBlock(raw: unknown, role: 'user' | 'assistant', options: NormalizeOptions): ClaudeBlock | null {
  if (!isRecord(raw)) return null
  switch (raw.type) {
    case 'text': {
      if (typeof raw.text !== 'string' || raw.text === '') return null
      if (role === 'user' && isInjectedContext(raw.text)) return null
      // CLI reminders in the transcript were not typed by the user.
      if (options.history && role === 'user' && /^\s*<system-reminder>/.test(raw.text)) return null
      if (options.history && role === 'user' && isCommandWrapperText(raw.text)) return null
      return { type: 'text', text: raw.text }
    }
    case 'thinking':
      return isNonEmptyString(raw.thinking) ? { type: 'thinking', text: raw.thinking } : null
    case 'tool_use':
    case 'server_tool_use':
    case 'mcp_tool_use':
      return typeof raw.id === 'string' && typeof raw.name === 'string'
        ? { type: 'toolUse', toolUseId: raw.id, name: raw.name, input: raw.input ?? {} }
        : null
    case 'tool_result':
      return typeof raw.tool_use_id === 'string'
        ? {
            type: 'toolResult',
            toolUseId: raw.tool_use_id,
            content: truncateToolOutput(toolResultText(raw.content)),
            isError: raw.is_error === true
          }
        : null
    case 'image': {
      const source = raw.source
      return isRecord(source) &&
        source.type === 'base64' &&
        typeof source.media_type === 'string' &&
        typeof source.data === 'string'
        ? { type: 'image', mediaType: source.media_type, data: source.data }
        : null
    }
    default:
      return null
  }
}

/** `content` of an API message (string or list of blocks) → contract blocks. */
export function normalizeContent(
  content: unknown,
  role: 'user' | 'assistant',
  options: NormalizeOptions = {}
): ClaudeBlock[] {
  if (typeof content === 'string') {
    if (content === '' || (role === 'user' && isInjectedContext(content))) return []
    if (options.history && role === 'user' && (isCommandWrapperText(content) || /^\s*<system-reminder>/.test(content)))
      return []
    return [{ type: 'text', text: content }]
  }
  if (!Array.isArray(content)) return []
  return content.flatMap((b) => {
    const block = normalizeBlock(b, role, options)
    return block ? [block] : []
  })
}

/** Shape shared by the stream and transcript messages that we care about. */
export interface RawMessage {
  type: string
  uuid?: unknown
  message?: unknown
  parent_tool_use_id?: unknown
  /** ISO 8601 from the transcript (history only); live messages get Walph's clock. */
  timestamp?: unknown
}

/** Transcript ISO → epoch ms; untrusted: must be a finite date between 2000 and one day ahead. */
function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length > 40) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) && ms >= 946_684_800_000 && ms <= Date.now() + 86_400_000 ? ms : undefined
}

/**
 * `user`/`assistant` message → `ClaudeMessage`. `null` when nothing is left to show (only injected context, unknown
 * blocks) or the uuid is missing. `checkpoint` = user message with typed text/image.
 */
export function normalizeMessage(raw: RawMessage, options: NormalizeOptions = {}): ClaudeMessage | null {
  if (raw.type !== 'user' && raw.type !== 'assistant') return null
  if (typeof raw.uuid !== 'string' || raw.uuid === '') return null
  const role = raw.type
  const inner = isRecord(raw.message) ? raw.message : null
  if (!inner) return null
  const rawBlocks = normalizeContent(inner.content, role, options)
  const blocks = rawBlocks.filter((b) => b.type !== 'text' || !isTaskNotification(b.text))
  const note =
    role === 'user' && blocks.length < rawBlocks.length
      ? taskNotificationMessage(raw.uuid, inner.content, raw.timestamp, options)
      : null
  // Only the notice, nothing typed: the whole message is the note.
  if (note && blocks.length === 0) return note
  if (blocks.length === 0) return null
  const message: ClaudeMessage = {
    uuid: raw.uuid,
    role,
    blocks,
    parentToolUseId: typeof raw.parent_tool_use_id === 'string' ? raw.parent_tool_use_id : null
  }
  // Live, the local clock (the CLI's is "display only"); in history, the transcript's, if valid.
  const timestamp = options.history ? parseTimestamp(raw.timestamp) : Date.now()
  if (timestamp !== undefined) message.timestamp = timestamp
  if (
    role === 'user' &&
    message.parentToolUseId === null &&
    blocks.some((b) => b.type === 'text' || b.type === 'image')
  ) {
    message.checkpoint = true
  }
  if (role === 'user' && message.parentToolUseId === null) {
    const context = contextOfTexts(textsOf(inner.content))
    if (context) message.context = context
  }
  // Text typed along with the notice is still the user's message; the notice is attached.
  if (note?.taskNotification) message.taskNotification = note.taskNotification
  return message
}

/** Texts (`text` blocks or the string itself) of a `content`. */
function textsOf(content: unknown): string[] {
  if (typeof content === 'string') return [content]
  if (!Array.isArray(content)) return []
  return content.flatMap((b) => (isRecord(b) && b.type === 'text' && typeof b.text === 'string' ? [b.text] : []))
}

/** Finished-task note from the first `<task-notification>` block of the content; `null` if there is none. */
function taskNotificationMessage(
  uuid: string,
  content: unknown,
  rawTimestamp: unknown,
  options: NormalizeOptions
): ClaudeMessage | null {
  const text = textsOf(content).find(isTaskNotification)
  const notification = text === undefined ? null : parseTaskNotification(text)
  if (!notification) return null
  const message: ClaudeMessage = {
    uuid,
    role: 'user',
    blocks: [
      { type: 'text', text: notification.summary || notification.status || t().claudeHost.conversation.backgroundTask }
    ],
    parentToolUseId: null,
    taskNotification: notification
  }
  const timestamp = options.history ? parseTimestamp(rawTimestamp) : Date.now()
  if (timestamp !== undefined) message.timestamp = timestamp
  return message
}

export interface TextDelta {
  index: number
  kind: 'text' | 'thinking'
  text: string
}

/** API streaming event (`stream_event`) → text/thinking chunk; the others (tool input etc.) are ignored. */
export function streamDelta(event: unknown): TextDelta | null {
  if (!isRecord(event) || event.type !== 'content_block_delta') return null
  const delta = event.delta
  if (!isRecord(delta) || typeof event.index !== 'number') return null
  if (delta.type === 'text_delta' && typeof delta.text === 'string') {
    return { index: event.index, kind: 'text', text: delta.text }
  }
  if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
    return { index: event.index, kind: 'thinking', text: delta.thinking }
  }
  return null
}
