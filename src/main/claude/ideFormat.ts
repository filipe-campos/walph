// Text of the IDE tools (`walph` MCP server) that Claude reads. Pure.

import { relative } from 'node:path'
import type { ClaudeEditorContext, Diagnostic } from '@shared/types'

export interface FileDiagnostics {
  path: string
  diagnostics: Diagnostic[]
}

export const MAX_DIAGNOSTIC_LINES = 200

const rank: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, info: 2, hint: 3 }

/** One line per diagnostic: `path:line:column severity [source code] message` (lines/columns from 1). */
export function formatDiagnostics(files: FileDiagnostics[], root: string): string {
  const lines: string[] = []
  let total = 0
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  for (const file of sorted) {
    const rel = relative(root, file.path) || file.path
    for (const d of [...file.diagnostics].sort((a, b) => rank[a.severity] - rank[b.severity])) {
      total++
      if (lines.length >= MAX_DIAGNOSTIC_LINES) continue
      const tag = [d.source, d.code].filter((x) => x !== undefined && x !== '').join(' ')
      const message = d.message.replace(/\s*\n\s*/g, ' ').trim()
      lines.push(
        `${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} ${d.severity}${tag ? ` [${tag}]` : ''} ${message}`
      )
    }
  }
  if (total === 0) return 'No diagnostics in the files open in the editor.'
  if (total > lines.length) lines.push(`… (+${total - lines.length} diagnostics omitted)`)
  return lines.join('\n')
}

export function formatSelection(context: ClaudeEditorContext): string {
  const sel = context.selection
  if (!sel || sel.text === '') {
    return JSON.stringify({ filePath: context.activeFile, selection: null })
  }
  return JSON.stringify({ filePath: sel.path, startLine: sel.startLine, endLine: sel.endLine, text: sel.text })
}

export function formatOpenEditors(context: ClaudeEditorContext): string {
  return JSON.stringify({
    activeFile: context.activeFile,
    openEditors: context.openFiles.map((f) => ({ filePath: f.path, isDirty: f.dirty }))
  })
}
