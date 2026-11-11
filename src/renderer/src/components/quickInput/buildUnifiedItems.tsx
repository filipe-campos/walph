// Unified palette (⌘K, without a prefix): Workspaces, Commands and Files in that order, plus the fixed "Ask
// Claude" row. Pure functions over the received context; they reuse the builders of the `>` and files modes.
import { t } from '@shared/i18n'
import type { WorkspaceId, WorkspaceInfo } from '@shared/types'
import { fuzzyMatch } from '../../lib/fuzzy'
import { askClaude } from '../../claudePromptActions'
import { activateWorkspace } from '../../workspaceActions'
import { buildCommandList, buildFileList, type FilesContext, type QuickItem, type QuickList } from './buildItems'
import { pathLabel } from './highlight'

const UNIFIED_COMMANDS_LIMIT = 8
const UNIFIED_FILES_LIMIT = 8
/** Without a query only the recents enter (used commands and open/recent files), in a smaller number. */
const UNIFIED_EMPTY_LIMIT = 5

export interface UnifiedContext {
  platform: string
  /** `null` until main's first list. */
  workspaces: WorkspaceInfo[] | null
  selfId: WorkspaceId | null
  files: FilesContext
}

/** Workspaces filtered by name or branch (fuzzy); the name is what gets the highlight. */
export function buildWorkspaceItems(text: string, ctx: Pick<UnifiedContext, 'workspaces' | 'selfId'>): QuickItem[] {
  const query = text.trim()
  const ranked: { ws: WorkspaceInfo; matches: number[]; score: number }[] = []
  for (const ws of ctx.workspaces ?? []) {
    if (!query) {
      ranked.push({ ws, matches: [], score: 0 })
      continue
    }
    const byName = fuzzyMatch(query, ws.name)
    // Never the root (nor the parent folder): `dev`/`use` would match every workspace under ~/Development or /Users.
    // The
    // name and the branch count.
    const other = [ws.branch].flatMap((t) => (t ? [fuzzyMatch(query, t)] : []))
    const scores = [byName, ...other].flatMap((r) => (r ? [r.score] : []))
    if (scores.length) ranked.push({ ws, matches: byName?.matches ?? [], score: Math.max(...scores) })
  }
  // Without a query keeps the tab order; with a query, the best match first (stable: tie = tab order).
  if (query) ranked.sort((a, b) => b.score - a.score)
  return ranked.map(({ ws, matches }) => {
    const current = ws.id === ctx.selfId
    return {
      key: `ws:${ws.id}`,
      group: t().quickInput.unified.workspaces,
      // A dormant workspace has no Claude sessions: empty dot column (the labels stay aligned).
      status: ws.dormant ? ('none' as const) : ws.status,
      unread: ws.dormant ? 0 : ws.unread,
      label: pathLabel(ws.name, ws.branch ?? undefined, new Set(matches), 0, false),
      tag: current ? t().quickInput.current : undefined,
      run: () => {
        if (!current) activateWorkspace(ws.id)
      }
    }
  })
}

/**
 * Fixed AI row at the end of any non-empty search. Without an open folder it is disabled (the conversation runs in the
 * folder).
 */
export function buildAskClaudeItem(text: string, hasRoot: boolean): QuickItem {
  const query = text.trim()
  return {
    key: 'ask-claude',
    ai: true,
    label: t().quickInput.unified.askClaude(query),
    tag: hasRoot ? undefined : t().quickInput.unified.openFolder,
    disabled: !hasRoot,
    run: () => void askClaude(query)
  }
}

function inGroup(items: QuickItem[], group: string, prefix: string): QuickItem[] {
  return items.map((item) => ({ ...item, key: `${prefix}:${item.key}`, group }))
}

export function buildUnifiedList(text: string, ctx: UnifiedContext): QuickList {
  const query = text.trim()
  const workspaces = buildWorkspaceItems(text, ctx)

  const allCommands = buildCommandList(text, ctx.platform).items
  const commands = query
    ? allCommands.slice(0, UNIFIED_COMMANDS_LIMIT)
    : allCommands.filter((c) => c.tag).slice(0, UNIFIED_EMPTY_LIMIT)

  // Files: the list still loading or no folder simply does not contribute (the message does not fit here).
  const allFiles = buildFileList(text, ctx.files).items
  const files = allFiles.slice(0, query ? UNIFIED_FILES_LIMIT : UNIFIED_EMPTY_LIMIT)

  const groups = t().quickInput.unified
  const items = [...workspaces, ...inGroup(commands, groups.commands, 'cmd'), ...inGroup(files, groups.files, 'file')]
  if (query) items.push(buildAskClaudeItem(text, !!ctx.files.root))
  return { items, message: groups.empty }
}
