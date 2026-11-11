import { isFiniteNumber, isNonEmptyString, isRecord } from '@shared/guards'
import { isModelId } from '@shared/claudeModel'
import { isSessionId } from '../claude/validate'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type {
  SessionBreakpoint,
  SessionBreakpointFile,
  SessionClaudeTab,
  SessionClosedTab,
  SessionEditorGroup,
  SessionTab,
  SidebarView,
  WorkspaceSession
} from '@shared/types'
import type { ClaudePermissionMode } from '@shared/settings'
import { isClaudeEffort } from '@shared/claudeModes'
import { isTextEncoding } from '../fs/encoding'
import { pathKey } from '@shared/pathCompare'
import { MAX_EDITOR_GROUPS, mapLayout, parseLayout } from '@shared/editorLayout'
import { MAX_BREAKPOINTS_PER_FILE } from '@shared/debug'

const VIEWS: readonly SidebarView[] = ['explorer', 'search', 'git', 'debug']
const MAX_TABS = 200
const MAX_EXPANDED = 5000
const DEFAULT_SIDEBAR_WIDTH = 260
const DEFAULT_PANEL_HEIGHT = 240
const DEFAULT_PANEL_WIDTH = 420
const DEFAULT_CLAUDE_WIDTH = 400
const MAX_SIZE = 10_000
const MAX_LANGUAGE_LENGTH = 100
const MAX_CLAUDE_TABS = 20
const MAX_CLAUDE_TEXT = 200
const MAX_CLAUDE_DRAFT = 20_000
const MAX_CLOSED_TABS = 20
const MAX_BREAKPOINT_FILES = 500
const MAX_BREAKPOINT_TEXT = 1000
const MAX_WATCHES = 100
const MAX_WATCH_TEXT = 1000
// `bypassPermissions` never comes back from a file: the user turns it on again, deliberately.
const CLAUDE_MODES: readonly string[] = ['default', 'acceptEdits', 'plan', 'auto']

/** Session file name of a folder: sha256 of the normalized path (same rule as `samePath`). */
export function sessionFileName(root: string, platform: string = process.platform): string {
  return `${createHash('sha256').update(pathKey(root, platform)).digest('hex')}.json`
}

const isAbsPath = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && isAbsolute(v)

function size(v: unknown, fallback: number): number {
  return isFiniteNumber(v) && v > 0 ? Math.min(Math.round(v), MAX_SIZE) : fallback
}

function sanitizeTab(value: unknown): SessionTab | null {
  if (!isRecord(value) || !isAbsPath(value.path)) return null
  if (value.kind === 'markdownPreview') return { kind: 'markdownPreview', path: value.path }
  if (value.kind === 'image') return { kind: 'image', path: value.path }
  if (value.kind === 'diff') return { kind: 'diff', path: value.path, staged: value.staged === true }
  if (value.kind !== 'file') return null
  const cursor = isRecord(value.cursor) ? value.cursor : {}
  const line = isFiniteNumber(cursor.line) ? Math.max(1, Math.floor(cursor.line)) : 1
  const column = isFiniteNumber(cursor.column) ? Math.max(0, Math.floor(cursor.column)) : 0
  // Old sessions stored `scrollTop` in px: it is ignored (the top line is what survives the editor measurement).
  const topLine = isFiniteNumber(value.topLine) ? Math.max(1, Math.floor(value.topLine)) : 1
  // Encoding/language chosen by the user; an invalid value is dropped (detection takes over again).
  const encoding = isTextEncoding(value.encoding) ? value.encoding : undefined
  const language =
    typeof value.language === 'string' && value.language.length > 0 && value.language.length <= MAX_LANGUAGE_LENGTH
      ? value.language
      : undefined
  return {
    kind: 'file',
    path: value.path,
    preview: value.preview === true,
    ...(encoding ? { encoding } : {}),
    ...(language ? { language } : {}),
    cursor: { line, column },
    topLine
  }
}

function sanitizeClaudeTab(value: unknown): SessionClaudeTab | null {
  if (!isRecord(value)) return null
  const text = (v: unknown, max: number): string | undefined => (isNonEmptyString(v) ? v.slice(0, max) : undefined)
  // Same rules as `claude:start` (`validate.ts`): whatever is accepted here must open on restore.
  const sessionId = isSessionId(value.sessionId) ? value.sessionId : undefined
  const title = text(value.title, MAX_CLAUDE_TEXT)
  const model = isModelId(value.model) ? text(value.model, MAX_CLAUDE_TEXT) : undefined
  const draft = text(value.draft, MAX_CLAUDE_DRAFT)
  const permissionMode = CLAUDE_MODES.includes(value.permissionMode as string)
    ? (value.permissionMode as ClaudePermissionMode)
    : undefined
  const effort = isClaudeEffort(value.effort) ? value.effort : undefined
  // Without a session and without a draft there is nothing to restore.
  if (!sessionId && !draft) return null
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(title ? { title } : {}),
    ...(model ? { model } : {}),
    ...(permissionMode ? { permissionMode } : {}),
    ...(effort ? { effort } : {}),
    ...(draft ? { draft } : {})
  }
}

/** Closed tabs stack: invalid entries go away, the most recent ones (end of the list) stay. */
function sanitizeClosedTabs(value: unknown): SessionClosedTab[] {
  if (!Array.isArray(value)) return []
  const nonNegativeInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
  return value.slice(-MAX_CLOSED_TABS).flatMap((raw): SessionClosedTab[] => {
    if (!isRecord(raw)) return []
    const tab = sanitizeTab(raw.tab)
    if (!tab) return []
    return [
      { tab, group: nonNegativeInt(raw.group) ? raw.group : null, index: nonNegativeInt(raw.index) ? raw.index : 0 }
    ]
  })
}

function sanitizeBreakpoint(value: unknown): SessionBreakpoint | null {
  if (!isRecord(value) || !isFiniteNumber(value.line) || value.line < 1) return null
  const text = (v: unknown): string | undefined =>
    isNonEmptyString(v) && v.length <= MAX_BREAKPOINT_TEXT ? v : undefined
  const condition = text(value.condition)
  const hitCondition = text(value.hitCondition)
  const logMessage = text(value.logMessage)
  return {
    line: Math.floor(value.line),
    ...(value.enabled === false ? { enabled: false } : {}),
    ...(condition ? { condition } : {}),
    ...(hitCondition ? { hitCondition } : {}),
    ...(logMessage ? { logMessage } : {})
  }
}

/** Breakpoints per file: one file per path (`pathKey`), one entry per line, never an empty list. */
function sanitizeBreakpointFiles(value: unknown): SessionBreakpointFile[] | undefined {
  if (!Array.isArray(value)) return undefined
  const files: SessionBreakpointFile[] = []
  const seen = new Set<string>()
  for (const raw of value.slice(0, MAX_BREAKPOINT_FILES)) {
    if (!isRecord(raw) || !isAbsPath(raw.path) || !Array.isArray(raw.breakpoints)) continue
    const key = pathKey(raw.path)
    if (seen.has(key)) continue
    const lines = new Set<number>()
    const breakpoints: SessionBreakpoint[] = []
    for (const item of raw.breakpoints.slice(0, MAX_BREAKPOINTS_PER_FILE)) {
      const bp = sanitizeBreakpoint(item)
      if (!bp || lines.has(bp.line)) continue
      lines.add(bp.line)
      breakpoints.push(bp)
    }
    if (breakpoints.length === 0) continue
    seen.add(key)
    files.push({ path: raw.path, breakpoints })
  }
  return files
}

function sanitizeWatches(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((v): v is string => isNonEmptyString(v) && v.length <= MAX_WATCH_TEXT).slice(0, MAX_WATCHES)
}

/** Editor groups: indices into `tabs` already remapped; any error drops the whole field. */
/** Valid groups and, for each original group, its new index (`undefined` = dropped for being empty). */
function sanitizeGroups(
  value: unknown,
  remap: Map<number, number>,
  rawCount: number
): { groups: SessionEditorGroup[]; groupRemap: Map<number, number> } | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_EDITOR_GROUPS) return null
  const groups: SessionEditorGroup[] = []
  const groupRemap = new Map<number, number>()
  for (const [rawIndex, raw] of value.entries()) {
    if (!isRecord(raw) || !Array.isArray(raw.tabs)) return null
    const tabs: number[] = []
    for (const index of raw.tabs) {
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null
      // An index past the existing tabs is invalid; past the limit (`MAX_TABS`) it is a cut tab and only leaves the
      // group.
      if (index >= rawCount) return null
      // A tab dropped by the filter (or cut): it leaves the group, the rest stays valid.
      const mapped = remap.get(index)
      if (mapped !== undefined && !tabs.includes(mapped)) tabs.push(mapped)
    }
    let activeIndex: number | null = null
    if (raw.activeIndex !== null && raw.activeIndex !== undefined) {
      if (typeof raw.activeIndex !== 'number' || !Number.isInteger(raw.activeIndex)) return null
      const mapped = remap.get(raw.activeIndex)
      // An active tab outside the group is invalid; an active tab that was dropped becomes "none".
      if (mapped === undefined) {
        if (!raw.tabs.includes(raw.activeIndex) || raw.activeIndex < 0) return null
      } else if (tabs.includes(mapped)) activeIndex = mapped
      else return null
    }
    if (tabs.length === 0) continue
    groupRemap.set(rawIndex, groups.length)
    groups.push({ tabs, activeIndex })
  }
  return groups.length > 0 ? { groups, groupRemap } : null
}

/**
 * Validates what came from disk or from the renderer (untrusted): drops invalid tabs and paths and keeps the rest.
 * `null` if it is not even an object.
 */
export function sanitizeSession(value: unknown): WorkspaceSession | null {
  if (!isRecord(value)) return null

  const tabs: SessionTab[] = []
  // Original index -> new one, so the active tab survives the tabs dropped before it.
  const remap = new Map<number, number>()
  if (Array.isArray(value.tabs)) {
    for (const [i, raw] of value.tabs.slice(0, MAX_TABS).entries()) {
      const tab = sanitizeTab(raw)
      if (!tab) continue
      remap.set(i, tabs.length)
      tabs.push(tab)
    }
  }
  const activeIndex =
    typeof value.activeIndex === 'number' && Number.isInteger(value.activeIndex)
      ? (remap.get(value.activeIndex) ?? null)
      : null

  const expanded = Array.isArray(value.expanded)
    ? [...new Set(value.expanded.filter(isAbsPath))].slice(0, MAX_EXPANDED)
    : []

  const sanitizedGroups = sanitizeGroups(value.editorGroups, remap, Array.isArray(value.tabs) ? value.tabs.length : 0)
  const editorGroups = sanitizedGroups?.groups ?? null
  const groupRemap = sanitizedGroups?.groupRemap
  const activeGroup =
    groupRemap && typeof value.activeGroup === 'number' && Number.isInteger(value.activeGroup)
      ? (groupRemap.get(value.activeGroup) ?? null)
      : null
  // The grid points at the original groups: it follows the remapping (a dropped group leaves the grid).
  const rawLayout = Array.isArray(value.editorGroups)
    ? parseLayout(value.editorLayout, value.editorGroups.length)
    : null
  const editorLayout =
    rawLayout && groupRemap && editorGroups && editorGroups.length > 1
      ? mapLayout(rawLayout, (i) => groupRemap.get(i) ?? null)
      : null
  const ratio = value.editorSplitRatio
  const splitRatio = isFiniteNumber(ratio) ? Math.min(0.85, Math.max(0.15, ratio)) : null

  // Claude tabs: the active index is remapped like the editor tabs one (invalid ones go away).
  let claudeTabs: SessionClaudeTab[] | undefined
  let claudeActive: number | undefined
  if (Array.isArray(value.claudeTabs)) {
    claudeTabs = []
    const claudeRemap = new Map<number, number>()
    for (const [i, raw] of value.claudeTabs.slice(0, MAX_CLAUDE_TABS).entries()) {
      const tab = sanitizeClaudeTab(raw)
      if (!tab) continue
      claudeRemap.set(i, claudeTabs.length)
      claudeTabs.push(tab)
    }
    if (typeof value.claudeActive === 'number' && Number.isInteger(value.claudeActive))
      claudeActive = claudeRemap.get(value.claudeActive)
  }
  const breakpoints = sanitizeBreakpointFiles(value.breakpoints)
  const watches = sanitizeWatches(value.watches)

  const closedTabs = sanitizeClosedTabs(value.closedTabs)

  return {
    tabs,
    activeIndex,
    expanded,
    view: VIEWS.includes(value.view as SidebarView) ? (value.view as SidebarView) : 'explorer',
    sidebarVisible: value.sidebarVisible !== false,
    sidebarWidth: size(value.sidebarWidth, DEFAULT_SIDEBAR_WIDTH),
    terminalVisible: value.terminalVisible === true,
    panelHeight: size(value.panelHeight, DEFAULT_PANEL_HEIGHT),
    panelPosition: value.panelPosition === 'right' ? 'right' : 'bottom',
    panelWidth: size(value.panelWidth, DEFAULT_PANEL_WIDTH),
    ...(typeof value.claudeVisible === 'boolean' ? { claudeVisible: value.claudeVisible } : {}),
    ...(isFiniteNumber(value.claudeWidth) ? { claudeWidth: size(value.claudeWidth, DEFAULT_CLAUDE_WIDTH) } : {}),
    ...(claudeTabs ? { claudeTabs } : {}),
    ...(claudeActive !== undefined ? { claudeActive } : {}),
    ...(breakpoints ? { breakpoints } : {}),
    ...(watches ? { watches } : {}),
    ...(editorGroups ? { editorGroups } : {}),
    ...(editorGroups && activeGroup !== null && activeGroup < editorGroups.length && activeGroup >= 0
      ? { activeGroup }
      : {}),
    ...(editorGroups && editorLayout ? { editorLayout } : {}),
    ...(editorGroups && splitRatio !== null ? { editorSplitRatio: splitRatio } : {}),
    ...(closedTabs.length > 0 ? { closedTabs } : {})
  }
}
