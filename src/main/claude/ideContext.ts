// Editor context that Walph (or the official extension) injects as `<ide_selection>`/`<ide_opened_file>` blocks.
// Text coming from the transcript is untrusted: we only extract a path and a line range, nothing is executed.

import type { ClaudeMessageContext } from '@shared/types'

const MAX_PATH_CHARS = 4096

const SELECTION = /^<ide_selection>\s*The user selected (?:the )?lines? (\d+)(?: to (\d+))? from ([^\n]+?):\s*(?:\n|<)/
const OPENED = /^<ide_opened_file>\s*The user opened the file ([^\n]+?) in the IDE\./

function validPath(path: string): string | null {
  const trimmed = path.trim()
  return trimmed !== '' && trimmed.length <= MAX_PATH_CHARS && !trimmed.includes('\0') ? trimmed : null
}

/** Context described by ONE injected text block; `null` if the text is not an editor context block. */
export function parseIdeContext(text: string): ClaudeMessageContext | null {
  const selection = SELECTION.exec(text)
  if (selection) {
    const path = validPath(selection[3] ?? '')
    const startLine = Number(selection[1])
    const endLine = selection[2] === undefined ? startLine : Number(selection[2])
    if (!path || !Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1) return null
    return { path, startLine, endLine: Math.max(startLine, endLine) }
  }
  const opened = OPENED.exec(text)
  if (opened) {
    const path = validPath(opened[1] ?? '')
    return path ? { path } : null
  }
  return null
}

/** Context of a message's list of texts: the selection (more specific) beats the opened file. */
export function contextOfTexts(texts: readonly string[]): ClaudeMessageContext | undefined {
  let opened: ClaudeMessageContext | undefined
  for (const text of texts) {
    const context = parseIdeContext(text)
    if (!context) continue
    if (context.startLine !== undefined) return context
    opened ??= context
  }
  return opened
}
