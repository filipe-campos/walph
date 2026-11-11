// "Export conversation (.md)": readable markdown from the in-memory transcript (`ClaudeMessage[]`, which already
// comes without the injected context: `<ide_selection>`, attachments…). Pure. Tools become one line, thinking and
// subagent messages are left out, images become "[imagem]" (no base64 in the file).

import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { ClaudeBlock, ClaudeMessage } from '@shared/types'
import { isInjectedContext } from './buildPrompt'

const SUMMARY_MAX = 160
const FILE_NAME_MAX = 80
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function oneLine(text: string, max = SUMMARY_MAX): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Input that best identifies the call (command, file, pattern, URL, task); `''` if there is none. */
export function toolDetail(name: string, input: unknown): string {
  if (!isRecord(input)) return ''
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = input[key]
      if (typeof value === 'string' && value.trim() !== '') return value
    }
    return ''
  }
  switch (name) {
    case 'Bash':
      return pick('command')
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'Read':
      return pick('file_path')
    case 'NotebookEdit':
      return pick('notebook_path')
    case 'Glob':
    case 'Grep':
      return pick('pattern')
    case 'WebFetch':
      return pick('url')
    case 'WebSearch':
      return pick('query')
    case 'Agent':
    case 'Task':
      return pick('description', 'prompt')
    default:
      return pick('file_path', 'path', 'command', 'pattern', 'query', 'url', 'description')
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `YYYY-MM-DD HH:mm` in the local time zone. */
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function textOf(block: Extract<ClaudeBlock, { type: 'text' }>, role: 'user' | 'assistant'): string {
  // Extra defense: the transcript no longer carries these blocks, but the marker is cheap to check.
  if (role === 'user' && isInjectedContext(block.text)) return ''
  return block.text.trim()
}

export interface ExportInput {
  title: string
  messages: ClaudeMessage[]
  exportedAt: Date
}

export function buildMarkdown({ title, messages, exportedAt }: ExportInput): string {
  const failed = new Set<string>()
  for (const m of messages) {
    for (const b of m.blocks) if (b.type === 'toolResult' && b.isError) failed.add(b.toolUseId)
  }

  const texts = t().claudeHost.export
  const out: string[] = [
    `# ${oneLine(title, 200) || texts.defaultTitle}`,
    '',
    `_${texts.exportedAt(formatDate(exportedAt))}_`
  ]
  let section: 'user' | 'assistant' | null = null

  for (const message of messages) {
    if (message.parentToolUseId !== null) continue
    const parts: Array<{ text: string; tool: boolean }> = []
    for (const block of message.blocks) {
      if (block.type === 'text') {
        const text = textOf(block, message.role)
        if (text !== '') parts.push({ text, tool: false })
      } else if (block.type === 'image') parts.push({ text: t().claudeHost.conversation.image, tool: false })
      else if (block.type === 'toolUse') {
        const detail = oneLine(toolDetail(block.name, block.input))
        const line = `> ${block.name}${detail ? `: ${detail}` : ''}${failed.has(block.toolUseId) ? ` ${texts.toolError}` : ''}`
        parts.push({ text: line, tool: true })
      }
      // thinking and toolResult are left out.
    }
    if (parts.length === 0) continue
    if (section !== message.role) {
      section = message.role
      out.push('', message.role === 'user' ? `## ${texts.you}` : '## Claude')
    }
    // Consecutive tool calls form a single quote (paragraphs separated by `>`); the rest, by a blank line.
    const paragraphs: string[] = []
    let lastWasTool = false
    for (const part of parts) {
      if (part.tool && lastWasTool) paragraphs[paragraphs.length - 1] += `\n>\n${part.text}`
      else paragraphs.push(part.text)
      lastWasTool = part.tool
    }
    for (const paragraph of paragraphs) out.push('', paragraph)
  }
  return `${out.join('\n')}\n`
}

/** Safe file name (all systems) from the title, with `.md`. */
export function exportFileName(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, FILE_NAME_MAX)
    .trim()
  const safe = base === '' ? t().claudeHost.export.fileName : WINDOWS_RESERVED.test(base) ? `_${base}` : base
  return `${safe}.md`
}
