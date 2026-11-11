// Claude action row in the panel (design system "Ações do Claude"): icon and past-tense verb per tool, target,
// `+N −N`, a short value on the right and the lines that show when expanded. Pure. The input and output come from the
// model/CLI: nothing here assumes a format, and everything is capped (lines and characters) so a huge output does not
// hang the panel.
import { isRecord } from '@shared/guards'
import { t, type Messages } from '@shared/i18n'
import { parseMcpName } from './claudeTools'
import { jsonText } from './jsonText'
import { lineDiffCounts } from './claudeTurnSummary'
import { relativeTo } from './path'

/** Design system icons used in the actions (all exist in `components/common/Icon.tsx`). */
type ToolIcon =
  | 'eye'
  | 'filePlus'
  | 'pencil'
  | 'terminal'
  | 'search'
  | 'folder'
  | 'globe'
  | 'agent'
  | 'plan'
  | 'question'
  | 'spark'
  | 'slash'
  | 'bolt'

type ToolLineKind = 'cmd' | 'ok' | 'err' | 'muted' | 'add' | 'del' | 'ctx' | 'q' | 'a'

interface ToolLine {
  text: string
  kind?: ToolLineKind | undefined
}

export interface ToolRowView {
  icon: ToolIcon
  /** Past-tense verb ("Leu", "Editou") or the tool name. */
  label: string
  /** Relative path, command, pattern, URL… (one line). */
  target: string
  /** Path as it came in the input, to open in the editor (the UI validates that it is inside the folder). */
  path?: string | undefined
  /** Lines added/removed by an edit. */
  stat?: { add: number; del: number } | undefined
  /** Short value on the right: "142 linhas", "3 resultados". */
  meta?: string | undefined
  /** The row expands (there is something to show), even when `detail` was not built. */
  hasDetail: boolean
  /** Lines of the expanded area; empty when `toolRowView` was called without `withDetail`. */
  detail: ToolLine[]
}

type ToolLabel = keyof Messages['claude']['toolRow']['labels']

interface ToolMeta {
  icon: ToolIcon
  /** Label key in the catalog; `null` = the tool's own name. */
  label: ToolLabel | null
}

const TOOLS: Record<string, ToolMeta> = {
  Read: { icon: 'eye', label: 'read' },
  Write: { icon: 'filePlus', label: 'write' },
  Edit: { icon: 'pencil', label: 'edit' },
  MultiEdit: { icon: 'pencil', label: 'edit' },
  NotebookEdit: { icon: 'pencil', label: 'edit' },
  Bash: { icon: 'terminal', label: null },
  BashOutput: { icon: 'terminal', label: 'output' },
  Grep: { icon: 'search', label: 'grep' },
  Glob: { icon: 'folder', label: 'list' },
  LS: { icon: 'folder', label: 'list' },
  WebFetch: { icon: 'globe', label: 'fetch' },
  WebSearch: { icon: 'globe', label: 'webSearch' },
  Task: { icon: 'agent', label: 'agent' },
  Agent: { icon: 'agent', label: 'agent' },
  TodoWrite: { icon: 'plan', label: 'todos' },
  AskUserQuestion: { icon: 'question', label: 'asked' },
  ExitPlanMode: { icon: 'plan', label: 'plan' },
  Skill: { icon: 'spark', label: 'skill' },
  SlashCommand: { icon: 'slash', label: 'command' }
}

/** Lines in the expanded area (it scrolls from 220px; beyond that it only weighs on the DOM). */
export const MAX_DETAIL_LINES = 400
const MAX_LINE = 2000
const MAX_TARGET = 200
/** Unchanged lines shown before/after the replaced span of an edit. */
const CONTEXT = 2

function record(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function oneLine(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > MAX_TARGET ? `${line.slice(0, MAX_TARGET - 1)}…` : line
}

function toLines(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n')
  if (t === '') return []
  return (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n')
}

function cap(line: string): string {
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line
}

/** Joins groups of lines within the total limit; the excess becomes a dimmed "… N linhas omitidas" line. */
function limit(m: Messages['claude']['toolRow'], lines: ToolLine[]): ToolLine[] {
  if (lines.length <= MAX_DETAIL_LINES) return lines.map((l) => ({ ...l, text: cap(l.text) }))
  const kept = lines.slice(0, MAX_DETAIL_LINES).map((l) => ({ ...l, text: cap(l.text) }))
  kept.push({ text: m.omittedLines(lines.length - MAX_DETAIL_LINES), kind: 'muted' })
  return kept
}

/** Replaced span of an edit: up to 2 unchanged lines on each side as context, removed, then added. */
function editLines(oldText: string, newText: string): ToolLine[] {
  const a = toLines(oldText)
  const b = toLines(newText)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  return [
    ...a.slice(Math.max(0, start - CONTEXT), start).map((text): ToolLine => ({ text, kind: 'ctx' })),
    ...a.slice(start, endA).map((text): ToolLine => ({ text, kind: 'del' })),
    ...b.slice(start, endB).map((text): ToolLine => ({ text, kind: 'add' })),
    ...a.slice(endA, Math.min(a.length, endA + CONTEXT)).map((text): ToolLine => ({ text, kind: 'ctx' }))
  ]
}

function outputLines(
  m: Messages['claude']['toolRow'],
  result: { content: string; isError: boolean } | null,
  kind?: ToolLineKind
): ToolLine[] {
  if (!result) return []
  const lines = toLines(result.content)
  if (lines.length === 0) return [{ text: m.noOutput, kind: 'muted' }]
  return lines.map((text) => ({ text, kind: result.isError ? 'err' : kind }))
}

function jsonLines(input: unknown): ToolLine[] {
  return toLines(jsonText(input, 2)).map((text) => ({ text, kind: 'muted' }))
}

/** Grep/Glob result: one line per item (not counting the final empty line or the "No files found" message). */
function countResults(result: { content: string; isError: boolean } | null): number | null {
  if (!result || result.isError) return null
  const lines = toLines(result.content).filter((l) => l.trim() !== '')
  if (lines.length === 1 && /^no (files|matches) found/i.test(lines[0] ?? '')) return 0
  return lines.length
}

/**
 * Action row. The lines of the expanded area are only built with `withDetail` (the collapsed row does not pay the
 * `split` of huge outputs on every tab switch); `hasDetail` says, without building them, whether the row expands.
 */
export function toolRowView(
  name: string,
  input: unknown,
  result: { content: string; isError: boolean } | null,
  root?: string | null,
  withDetail = true,
  messages: Messages = t()
): ToolRowView {
  const i = record(input)
  const filePath = str(i.file_path) || str(i.notebook_path) || str(i.path)
  const shown = (p: string): string => (root ? relativeTo(root, p) : p)
  const m = messages.claude.toolRow
  const output = (kind?: ToolLineKind): ToolLine[] => outputLines(m, result, kind)
  const meta = TOOLS[name]
  const has = !!result
  const base = (
    target: string,
    hasDetail: boolean,
    lines: () => ToolLine[],
    rest: Partial<Omit<ToolRowView, 'detail' | 'hasDetail'>> = {}
  ): ToolRowView => ({
    icon: meta?.icon ?? 'bolt',
    label: meta?.label ? m.labels[meta.label] : name,
    target: oneLine(target),
    ...rest,
    hasDetail,
    detail: withDetail && hasDetail ? limit(m, lines()) : []
  })

  switch (name) {
    case 'Bash': {
      const command = str(i.command)
      return base(command || str(i.description), has || command !== '', () => [
        ...toLines(command).map((text): ToolLine => ({ text, kind: 'cmd' })),
        ...output()
      ])
    }
    case 'Read': {
      const lines = result && !result.isError ? toLines(result.content).length : null
      return base(shown(filePath), has, () => output('muted'), {
        path: filePath || undefined,
        meta: lines !== null ? m.lines(lines) : undefined
      })
    }
    case 'Edit': {
      const oldText = str(i.old_string)
      const newText = str(i.new_string)
      const { added, removed } = lineDiffCounts(oldText, newText)
      return base(
        shown(filePath),
        !!result?.isError || oldText !== '' || newText !== '',
        () => (result?.isError ? output() : editLines(oldText, newText)),
        { path: filePath || undefined, stat: { add: added, del: removed } }
      )
    }
    case 'MultiEdit': {
      const edits = Array.isArray(i.edits) ? i.edits.map(record) : []
      let add = 0
      let del = 0
      for (const e of edits) {
        const counts = lineDiffCounts(str(e.old_string), str(e.new_string))
        add += counts.added
        del += counts.removed
      }
      const lines = (): ToolLine[] => {
        if (result?.isError) return output()
        const out: ToolLine[] = []
        for (const e of edits) {
          if (out.length > 0) out.push({ text: '⋯', kind: 'muted' })
          out.push(...editLines(str(e.old_string), str(e.new_string)))
        }
        return out
      }
      return base(shown(filePath), !!result?.isError || edits.length > 0, lines, {
        path: filePath || undefined,
        stat: { add, del }
      })
    }
    case 'Write': {
      const content = str(i.content)
      return base(
        shown(filePath),
        !!result?.isError || content !== '',
        () => (result?.isError ? output() : toLines(content).map((text): ToolLine => ({ text, kind: 'add' }))),
        { path: filePath || undefined, stat: { add: toLines(content).length, del: 0 } }
      )
    }
    case 'NotebookEdit': {
      const source = str(i.new_source)
      return base(
        shown(filePath),
        has || source !== '',
        () => [...toLines(source).map((text): ToolLine => ({ text, kind: 'add' })), ...output()],
        { path: filePath || undefined }
      )
    }
    case 'Grep':
    case 'Glob': {
      const n = countResults(result)
      const where = str(i.path)
      return base(`${str(i.pattern)}${where ? ` ${shown(where)}` : ''}`, has, () => output(), {
        meta: n !== null ? m.results(n) : undefined
      })
    }
    case 'LS':
      return base(shown(filePath), has, () => output())
    case 'WebFetch':
      return base(str(i.url), has, () => output('muted'))
    case 'WebSearch':
      return base(str(i.query), has, () => output('muted'))
    case 'Task':
    case 'Agent': {
      const prompt = str(i.prompt)
      const type = str(i.subagent_type)
      return base(
        str(i.description) || prompt,
        has || prompt !== '',
        () => [...toLines(prompt).map((text): ToolLine => ({ text, kind: 'q' })), ...output('a')],
        { meta: type || undefined }
      )
    }
    case 'TodoWrite': {
      const todos = Array.isArray(i.todos) ? i.todos.map(record) : []
      const done = todos.filter((t) => t.status === 'completed').length
      return base(m.todosDone(done, todos.length), todos.length > 0, () =>
        todos.map((t): ToolLine => ({
          text: `${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '›' : '○'} ${str(t.content)}`,
          kind: t.status === 'completed' ? 'muted' : undefined
        }))
      )
    }
    case 'AskUserQuestion': {
      const qs = Array.isArray(i.questions) ? i.questions.map(record) : []
      return base(qs.map((q) => str(q.question) || str(q.header)).join(' · '), has || qs.length > 0, () => [
        ...qs.map((q): ToolLine => ({ text: str(q.question) || str(q.header), kind: 'q' })),
        ...output('a')
      ])
    }
    case 'ExitPlanMode': {
      const plan = str(i.plan)
      return base('', plan !== '', () => toLines(plan).map((text): ToolLine => ({ text })))
    }
    case 'Skill':
      return base(str(i.skill) || str(i.command), has, () => output('muted'))
    case 'SlashCommand':
      return base(str(i.command), has, () => output('muted'))
    default: {
      // MCP: tool and server; with a file path, the target is the file (becomes a link). Unknown: the input.
      const mcp = parseMcpName(name)
      const target = filePath ? shown(filePath) : mcp ? mcp.server : jsonText(input ?? '')
      const view = base(target, true, () => [...jsonLines(input), ...output()], {
        path: filePath || undefined
      })
      if (mcp) view.label = mcp.tool
      return view
    }
  }
}
