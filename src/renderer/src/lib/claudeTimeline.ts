// Claude panel timeline: flattens the messages of a conversation into screen items.
import type { ClaudeBlock, ClaudeMessage, ClaudeMessageContext } from '@shared/types'
import { userText, type ConversationNote } from './claudeConversation'

export type TimelineItem =
  | {
      type: 'user'
      key: string
      uuid: string
      text: string
      images: readonly UserImage[]
      checkpoint: boolean
      context?: ClaudeMessageContext
      timestamp?: number
    }
  | {
      type: 'text'
      key: string
      text: string
      depth: 0 | 1
      timestamp?: number
      /** Last assistant text of the turn (shows the time). */
      turnEnd: boolean
      /** The turn is the last of the list (it may still be running: the time only counts with Claude stopped). */
      lastTurn: boolean
    }
  | { type: 'thinking'; key: string; text: string; depth: 0 | 1 }
  | {
      type: 'tool'
      key: string
      toolUseId: string
      name: string
      input: unknown
      result: ToolResult | null
      depth: 0 | 1
    }
  | { type: 'commandOutput'; key: string; text: string; timestamp: number }
  | { type: 'compacted'; key: string; trigger: 'manual' | 'auto'; preTokens: number | null; timestamp: number }
  | { type: 'autoTurn'; key: string; reason: 'scheduled' | 'background'; timestamp: number }
  | { type: 'denied'; key: string; toolUseId: string; toolName: string; reason: string; timestamp: number }
  | { type: 'taskNotice'; key: string; status: string; summary: string; timestamp?: number }

/** Image sent with the message (the block itself, without copying the data). */
export type UserImage = Extract<ClaudeBlock, { type: 'image' }>

const NO_IMAGES: readonly UserImage[] = []
// One list per message: without this every timeline rebuild would break the memo of the messages with images.
const imagesCache = new WeakMap<object, readonly UserImage[]>()

const urlCache = new WeakMap<UserImage, string>()

/** `data:` URL of the image, built once per block (it can be MBs: do not redo it on every build). */
export function imageUrl(image: UserImage): string {
  let url = urlCache.get(image)
  if (!url) {
    url = `data:${image.mediaType};base64,${image.data}`
    urlCache.set(image, url)
  }
  return url
}

function imagesOf(message: ClaudeMessage): readonly UserImage[] {
  let hit = imagesCache.get(message.blocks)
  if (!hit) {
    const found = message.blocks.filter((b): b is UserImage => b.type === 'image')
    hit = found.length === 0 ? NO_IMAGES : found
    imagesCache.set(message.blocks, hit)
  }
  return hit
}

type ToolResult = { content: string; isError: boolean }

// One `result` object per block: without this every new message recreated them all and broke the memo of the tool rows.
const resultCache = new WeakMap<object, ToolResult>()

function resultOf(block: Extract<ClaudeBlock, { type: 'toolResult' }>): ToolResult {
  let hit = resultCache.get(block)
  if (!hit) {
    hit = { content: block.content, isError: block.isError }
    resultCache.set(block, hit)
  }
  return hit
}

/** Flattens the messages into screen items: the result of each tool is attached to the call by `toolUseId`. */
export function buildTimeline(
  messages: readonly ClaudeMessage[],
  notes: readonly ConversationNote[] = []
): TimelineItem[] {
  const results = new Map<string, ToolResult>()
  for (const message of messages)
    for (const block of message.blocks) if (block.type === 'toolResult') results.set(block.toolUseId, resultOf(block))

  const items: TimelineItem[] = []
  // End of turn: the last assistant text (depth 0) before the next user message or notice.
  let lastText = -1
  const closeTurn = (last: boolean): void => {
    const at = lastText
    lastText = -1
    const item = items[at]
    if (item?.type === 'text') items[at] = { ...item, turnEnd: true, lastTurn: last }
  }
  const pushNote = (note: ConversationNote): void => {
    closeTurn(false)
    if (note.kind === 'commandOutput')
      items.push({ type: 'commandOutput', key: note.key, text: note.text, timestamp: note.timestamp })
    else if (note.kind === 'autoTurn')
      items.push({ type: 'autoTurn', key: note.key, reason: note.reason, timestamp: note.timestamp })
    else if (note.kind === 'denied')
      items.push({
        type: 'denied',
        key: note.key,
        toolUseId: note.toolUseId,
        toolName: note.toolName,
        reason: note.reason,
        timestamp: note.timestamp
      })
    else
      items.push({
        type: 'compacted',
        key: note.key,
        trigger: note.trigger,
        preTokens: note.preTokens,
        timestamp: note.timestamp
      })
  }
  let noteAt = 0
  messages.forEach((message, index) => {
    for (let note = notes[noteAt]; note && note.at <= index; note = notes[noteAt]) {
      noteAt++
      pushNote(note)
    }
    const depth = message.parentToolUseId === null ? 0 : 1
    if (message.taskNotification) {
      if (depth === 1) return
      closeTurn(false)
      const { status, summary } = message.taskNotification
      items.push({
        type: 'taskNotice',
        key: message.uuid,
        status,
        summary,
        ...(message.timestamp ? { timestamp: message.timestamp } : {})
      })
      // Only the notice: the blocks repeat the summary. With typed text alongside, it stays as a user message.
      const typed = userText(message)
      if (!typed || typed === summary.trim()) return
    }
    if (message.role === 'user') {
      if (depth === 1) return
      const text = userText(message)
      const images = imagesOf(message)
      if (!text && images.length === 0) return
      closeTurn(false)
      items.push({
        type: 'user',
        key: message.uuid,
        uuid: message.uuid,
        text,
        images,
        checkpoint: !!message.checkpoint,
        ...(message.context ? { context: message.context } : {}),
        ...(message.timestamp ? { timestamp: message.timestamp } : {})
      })
      return
    }
    message.blocks.forEach((block, i) => {
      const key = `${message.uuid}:${i}`
      if (block.type === 'text') {
        if (!block.text.trim()) return
        items.push({
          type: 'text',
          key,
          text: block.text,
          depth,
          turnEnd: false,
          lastTurn: false,
          ...(message.timestamp ? { timestamp: message.timestamp } : {})
        })
        if (depth === 0) lastText = items.length - 1
      } else if (block.type === 'thinking') {
        if (block.text.trim()) items.push({ type: 'thinking', key, text: block.text, depth })
      } else if (block.type === 'toolUse') {
        items.push({
          type: 'tool',
          key,
          toolUseId: block.toolUseId,
          name: block.name,
          input: block.input,
          result: results.get(block.toolUseId) ?? null,
          depth
        })
      }
    })
  })
  for (const note of notes.slice(noteAt)) pushNote(note)
  // What is left is the most recent turn.
  closeTurn(true)
  return items
}
