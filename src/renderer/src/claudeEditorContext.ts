// The editor as Claude sees it: active file, selection and open tabs sent to main, "Insert Reference" and the
// shortcuts that open in the editor a path or file cited by the conversation.
import type { ClaudeEditorContext } from '@shared/types'
import { t } from '@shared/i18n'
import { get } from './store'
import { notify } from './toasts'
import { getView, shownTabId } from './components/editor/groupViews'
import { selectionOf } from './lib/claudeSelection'
import { formatMention, resolveInside, resolvePath } from './lib/claudeMentions'
import { isInside, relativeTo } from './lib/path'
import { insertIntoPrompt } from './claudePromptBridge'
import { activeTab, openDiff, openFile } from './tabActions'
import { bridge } from './claudeState'
import { showClaude } from './claudeLifecycle'

const api = window.api

/** Active file, selection and open tabs, as Claude (IDE tools and automatic context) sees them. */
export function readEditorContext(): ClaudeEditorContext {
  const { tabs } = get()
  const active = activeTab()
  const file = active?.kind === 'file' ? active : null
  let selection = null
  const view = getView()
  if (file && view && shownTabId() === file.id) {
    const { from, to } = view.state.selection.main
    selection = selectionOf(view.state.doc, from, to, file.path)
  }
  return {
    activeFile: file?.path ?? null,
    selection,
    openFiles: tabs.filter((t) => t.kind === 'file').map((t) => ({ path: t.path, dirty: t.dirty }))
  }
}

let lastContextSent = ''

function pushEditorContext(): void {
  const s = get()
  if (!s.root || s.claude.conversations.length === 0) return
  const context = readEditorContext()
  const json = JSON.stringify(context)
  if (json === lastContextSent) return
  lastContextSent = json
  bridge.setEditorContext(context)
}

export function resetEditorContext(): void {
  lastContextSent = ''
}

let contextTimer: ReturnType<typeof setTimeout> | undefined

interface EditorContextInputs {
  conversationCount: number
  tabs: ReturnType<typeof get>['tabs']
  activeTabId: ReturnType<typeof get>['activeTabId']
  cursor: ReturnType<typeof get>['cursor']
}

/** Resends the context (debounced) when the editor changes or a conversation is born. */
export function scheduleEditorContext(s: EditorContextInputs, prev: EditorContextInputs): void {
  if (s.tabs !== prev.tabs || s.activeTabId !== prev.activeTabId || s.cursor !== prev.cursor) {
    clearTimeout(contextTimer)
    contextTimer = setTimeout(pushEditorContext, 250)
  }
  // New conversation: main does not know the editor yet.
  if (s.conversationCount > prev.conversationCount) {
    lastContextSent = ''
    clearTimeout(contextTimer)
    contextTimer = setTimeout(pushEditorContext, 50)
  }
}

export function stopEditorContext(): void {
  clearTimeout(contextTimer)
}

/** "Claude: Insert Reference": `@file#L10-20` of the selection (or `@file`) into the prompt. */
export function insertClaudeReference(): void {
  const { root } = get()
  const context = readEditorContext()
  if (!root || !context.activeFile) return notify(t().claude.actions.openFileForReference, 'info')
  const rel = relativeTo(root, context.activeFile)
  const sel = context.selection
  const mention = formatMention(rel, sel ? { startLine: sel.startLine, endLine: sel.endLine } : undefined)
  showClaude()
  insertIntoPrompt(`${mention} `)
}

/**
 * "Review" in the turn summary: opens the file's git diff (working tree against HEAD/index; the exact "before" of the
 * turn is not stored). A file with no git change opens the file itself.
 */
export function reviewChangedFile(raw: string): void {
  const { root, git } = get()
  // The path is the tool's raw `file_path`: normalizes it (slashes, `..`) and only accepts what is in the window
  // folder.
  const path = root ? resolveInside(root, raw) : null
  if (!root || !path) return notify(t().claude.actions.fileOutsideFolder, 'info')
  // macOS and Windows ignore case; git reports the path in its own spelling.
  const fold = (p: string): string => (window.api.platform === 'linux' ? p : p.toLowerCase())
  const file = git?.files.find((f) => fold(f.path) === fold(path))
  if (!file) {
    notify(t().claude.actions.noGitDiff, 'info')
    openFile(path)
    return
  }
  // A working tree change wins; only in the index (staged) opens the index diff.
  openDiff(file.path, file.workingDir.trim() === '' && file.index.trim() !== '')
}

/**
 * Opens in the editor a path cited by Claude (relative to the folder or absolute, even outside it: opening only reads)
 * if it exists.
 */
export async function openPathFromClaude(raw: string, line?: number, column?: number): Promise<void> {
  const { root } = get()
  if (!root) return
  const path = resolvePath(root, raw)
  try {
    if (!(await api.fs.exists(path)))
      return notify(t().claude.actions.fileNotFound(isInside(root, path) ? relativeTo(root, path) : path), 'info')
  } catch {
    return
  }
  if (get().root !== root) return
  openFile(path, line ? { line, column: Math.max(0, (column ?? 1) - 1), length: 0 } : undefined)
}
