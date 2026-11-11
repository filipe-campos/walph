// Summary of a Claude tool call for the collapsible row: icon, title, short detail and the file path
// involved (to open in the editor). The input comes from the model: nothing here is trusted or assumes a format.
import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { jsonText } from './jsonText'
import { relativeTo } from './path'

export interface ToolSummary {
  /** Codicon name (without the `codicon-` prefix). */
  icon: string
  title: string
  detail: string
  /** Path as it came in the input (the UI validates that it is inside the folder before opening). */
  path?: string | undefined
}

const MAX_DETAIL = 160

function record(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function firstLine(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > MAX_DETAIL ? `${line.slice(0, MAX_DETAIL - 1)}…` : line
}

/** `mcp__server__tool` → `{ server, tool }`; `null` if it is not MCP. */
export function parseMcpName(name: string): { server: string; tool: string } | null {
  const [, server, tool] = /^mcp__(.+?)__(.+)$/.exec(name) ?? []
  return server !== undefined && tool !== undefined ? { server, tool } : null
}

export function summarizeTool(name: string, input: unknown, root?: string | null): ToolSummary {
  const i = record(input)
  const filePath = str(i.file_path) || str(i.notebook_path) || str(i.path)
  const shown = (p: string): string => (root ? relativeTo(root, p) : p)
  const m = t().claude.tools
  switch (name) {
    case 'Bash':
      return { icon: 'terminal', title: 'Bash', detail: firstLine(str(i.command) || str(i.description)) }
    case 'Read':
      return { icon: 'file-code', title: m.read, detail: shown(filePath), path: filePath || undefined }
    case 'Edit':
    case 'MultiEdit':
      return { icon: 'edit', title: m.edit, detail: shown(filePath), path: filePath || undefined }
    case 'Write':
      return { icon: 'new-file', title: m.write, detail: shown(filePath), path: filePath || undefined }
    case 'NotebookEdit':
      return { icon: 'notebook', title: m.editNotebook, detail: shown(filePath), path: filePath || undefined }
    case 'Glob':
      return { icon: 'search', title: m.findFiles, detail: firstLine(str(i.pattern)) }
    case 'Grep':
      return { icon: 'search', title: m.search, detail: firstLine(str(i.pattern)) }
    case 'WebFetch':
      return { icon: 'globe', title: m.fetch, detail: firstLine(str(i.url)) }
    case 'WebSearch':
      return { icon: 'globe', title: m.webSearch, detail: firstLine(str(i.query)) }
    case 'Task':
    case 'Agent':
      return { icon: 'sparkle', title: m.subagent, detail: firstLine(str(i.description) || str(i.prompt)) }
    case 'TodoWrite': {
      const todos = Array.isArray(i.todos) ? i.todos.length : 0
      return { icon: 'checklist', title: m.todos, detail: m.items(todos) }
    }
    case 'AskUserQuestion': {
      const qs = Array.isArray(i.questions) ? i.questions : []
      const headers = qs.map((q) => str(record(q).header)).filter(Boolean)
      return { icon: 'question', title: m.asked, detail: firstLine(headers.join(', ')) }
    }
    case 'ExitPlanMode':
      return { icon: 'checklist', title: m.plan, detail: '' }
    default: {
      const mcp = parseMcpName(name)
      if (mcp) {
        const mcpPath = filePath || undefined
        return { icon: 'plug', title: mcp.tool, detail: mcp.server, path: mcpPath }
      }
      return { icon: 'tools', title: name, detail: firstLine(jsonText(input ?? '')) }
    }
  }
}

const MAX_JSON = 4000

/** Tool input as text for the expanded row (Bash shows only the command); truncated. */
export function toolInputText(name: string, input: unknown): string {
  const i = record(input)
  if (name === 'Bash' && typeof i.command === 'string') return cap(i.command)
  return cap(jsonText(input, 2))
}

function cap(text: string): string {
  return text.length > MAX_JSON
    ? `${text.slice(0, MAX_JSON)}\n… ${t().claude.tools.omittedChars(text.length - MAX_JSON)}`
    : text
}
