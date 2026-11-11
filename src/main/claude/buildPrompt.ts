// Builds the user message content for the SDK: typed text + `@file` attachments (read from disk by the caller) +
// automatic editor context + images. Pure. The injected text carries recognizable markers (`isInjectedContext`) so the
// resumed history does not show those parts as if the user had typed them.

import { t } from '@shared/i18n'
import type { ClaudeImage, ClaudePromptInput } from '@shared/types'
import { UserError } from '../errors'

export type PromptBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ClaudeImage['mediaType']; data: string } }

/** Attachment already resolved by the caller (which validates the path inside the window folder and reads the disk). */
export type LoadedAttachment =
  | { kind: 'file'; path: string; startLine?: number; endLine?: number; text: string }
  | { kind: 'directory'; path: string; entries: string[] }
  | { kind: 'unreadable'; path: string; reason: string }

export const MAX_ATTACHMENT_CHARS = 100_000
const MAX_SELECTION_CHARS = 50_000
export const MAX_DIRECTORY_ENTRIES = 200
const MAX_IMAGES = 8
/** 5 MB of bytes in base64 (4 characters per 3 bytes). */
export const MAX_IMAGE_BASE64_CHARS = Math.ceil((5 * 1024 * 1024 * 4) / 3)
export const MAX_ATTACHMENTS = 30

const INJECTED = /^<(attached_file|attached_directory|attached_unreadable|ide_opened_file|ide_selection)[\s>]/

/** `true` for a text block that Walph itself injected (attachment or editor context). */
export function isInjectedContext(text: string): boolean {
  return INJECTED.test(text)
}

/** Lines `start..end` (1-based, inclusive) of `text`; out of range is clamped to the text length. */
export function sliceLines(text: string, start?: number, end?: number): string {
  if (start === undefined && end === undefined) return text
  const lines = text.split('\n')
  const from = Math.max(1, Math.floor(start ?? 1))
  const to = Math.min(lines.length, Math.floor(end ?? lines.length))
  if (to < from) return ''
  return lines.slice(from - 1, to).join('\n')
}

/** Cuts at `max` characters without splitting a surrogate pair (emoji). */
export function clampText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  let cut = max
  const code = text.charCodeAt(cut - 1)
  if (code >= 0xd800 && code <= 0xdbff) cut--
  return { text: text.slice(0, cut), truncated: true }
}

const attr = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/[\r\n]+/g, ' ')

function rangeLabel(start?: number, end?: number): string {
  if (start === undefined && end === undefined) return ''
  return ` lines="${start ?? 1}-${end ?? ''}"`
}

function attachmentBlock(a: LoadedAttachment): string {
  if (a.kind === 'unreadable') {
    return `<attached_unreadable path="${attr(a.path)}">${a.reason}</attached_unreadable>`
  }
  if (a.kind === 'directory') {
    const shown = a.entries.slice(0, MAX_DIRECTORY_ENTRIES)
    const more = a.entries.length - shown.length
    const body = shown.join('\n') + (more > 0 ? `\n… (+${more} items)` : '')
    return `<attached_directory path="${attr(a.path)}">\n${body}\n</attached_directory>`
  }
  const { text, truncated } = clampText(a.text, MAX_ATTACHMENT_CHARS)
  const note = truncated ? '\n… (file truncated)' : ''
  return `<attached_file path="${attr(a.path)}"${rangeLabel(a.startLine, a.endLine)}>\n${text}${note}\n</attached_file>`
}

function validateImage(image: ClaudeImage): void {
  if (
    typeof image.data !== 'string' ||
    image.data === '' ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data.slice(0, 1024))
  ) {
    throw new UserError(t().claudeHost.attachments.invalidImage)
  }
  if (image.data.length > MAX_IMAGE_BASE64_CHARS) throw new UserError(t().claudeHost.attachments.imageTooLargeError)
}

/** Message content. Throws for an invalid/large image or too many images; empty text with nothing else is an error. */
export function buildUserContent(input: ClaudePromptInput, attachments: LoadedAttachment[]): PromptBlock[] {
  if (input.images.length > MAX_IMAGES) throw new UserError(t().claudeHost.attachments.tooManyImages(MAX_IMAGES))
  input.images.forEach(validateImage)

  const blocks: PromptBlock[] = []
  const text = input.text.trim()
  if (text !== '') blocks.push({ type: 'text', text: input.text })
  for (const a of attachments) blocks.push({ type: 'text', text: attachmentBlock(a) })

  const sel = input.selection
  if (sel && sel.text !== '') {
    const { text: body } = clampText(sel.text, MAX_SELECTION_CHARS)
    blocks.push({
      type: 'text',
      text: `<ide_selection>The user selected lines ${sel.startLine} to ${sel.endLine} from ${sel.path}:\n${body}\n\nThis may or may not be related to the current task.</ide_selection>`
    })
  }
  // The active file is only included if the selection (which already cites it) does not cover it.
  if (input.activeFile && !(sel && sel.text !== '' && sel.path === input.activeFile)) {
    blocks.push({
      type: 'text',
      text: `<ide_opened_file>The user opened the file ${input.activeFile} in the IDE. This may or may not be related to the current task.</ide_opened_file>`
    })
  }
  for (const image of input.images) {
    blocks.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })
  }
  // The automatic context alone (active file/selection) is not a message.
  if (text === '' && attachments.length === 0 && input.images.length === 0)
    throw new UserError(t().claudeHost.attachments.emptyMessage)
  return blocks
}
