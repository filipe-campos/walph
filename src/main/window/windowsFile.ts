import { flattenControl } from '@shared/controlChars'
import { isFiniteNumber, isNonEmptyString, isRecord } from '@shared/guards'
import { isAbsolute } from 'node:path'
import { samePath } from '@shared/pathCompare'

export interface SavedBounds {
  x: number
  y: number
  width: number
  height: number
}

/** A workspace (tab) of a saved window. */
export interface SavedWorkspace {
  /** Folder; `null` = empty view (welcome screen). */
  root: string | null
  /** Last known branch (shown on the tab while the workspace is dormant). */
  branch: string | null
  /** Notifications muted; absent = no. */
  muted?: boolean
}

/** A window of the last session, in `<userData>/windows.json` (version 2). */
export interface SavedWindow {
  workspaces: SavedWorkspace[]
  /** Index of the active workspace in `workspaces`. */
  active: number
  bounds: SavedBounds | null
  maximized: boolean
}

export const WINDOWS_FILE_VERSION = 2
const MAX_WINDOWS = 20
const MAX_WORKSPACES_PER_WINDOW = 50
const MAX_WORKSPACES_TOTAL = 200
const MAX_BRANCH_LENGTH = 200
const MIN_WIDTH = 200
const MIN_HEIGHT = 150

function sanitizeBounds(value: unknown): SavedBounds | null {
  if (!isRecord(value)) return null
  const nums = [value.x, value.y, value.width, value.height]
  if (!nums.every(isFiniteNumber)) return null
  const [x, y, width, height] = nums.map(Math.round) as [number, number, number, number]
  return width >= MIN_WIDTH && height >= MIN_HEIGHT ? { x, y, width, height } : null
}

/** Branch from disk or the renderer: single-line text with limited length, or `null`. */
export function sanitizeBranch(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = flattenControl(value).trim()
  return clean === '' || clean.length > MAX_BRANCH_LENGTH ? null : clean
}

/** `undefined` = invalid entry (discarded); `null` = empty view. */
function sanitizeRoot(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  return isNonEmptyString(value) && isAbsolute(value) ? value : undefined
}

/**
 * Reads `windows.json`. Accepts v2 (`workspaces` per window) and migrates v1 (one `root` per window = one workspace).
 * Discards invalid entries and folders repeated across the whole file (a folder never stays in two workspaces), limits
 * counts and keeps `active` inside the list.
 */
export function sanitizeWindows(value: unknown, platform: string = process.platform): SavedWindow[] {
  const raw = isRecord(value) && Array.isArray(value.windows) ? (value.windows as unknown[]) : []
  const result: SavedWindow[] = []
  const seen: string[] = []
  let total = 0
  const taken = (root: string): boolean => seen.some((r) => samePath(r, root, platform))

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const w = item as Record<string, unknown>
    const workspaces: SavedWorkspace[] = []
    let active = 0

    if (Array.isArray(w.workspaces)) {
      const rawActive = typeof w.active === 'number' && Number.isInteger(w.active) ? w.active : 0
      let activeKept = -1
      let hasEmpty = false
      for (const [i, entry] of w.workspaces.entries()) {
        if (typeof entry !== 'object' || entry === null) continue
        if (workspaces.length >= MAX_WORKSPACES_PER_WINDOW || total + workspaces.length >= MAX_WORKSPACES_TOTAL) break
        const e = entry as Record<string, unknown>
        const root = sanitizeRoot(e.root)
        if (root === undefined) continue
        if (root === null) {
          // More than one empty view in the same window is useless.
          if (hasEmpty) continue
          hasEmpty = true
        } else if (taken(root) || workspaces.some((x) => x.root !== null && samePath(x.root, root, platform))) continue
        if (i === rawActive) activeKept = workspaces.length
        workspaces.push({
          root,
          branch: root === null ? null : sanitizeBranch(e.branch),
          // Only `true` counts; the file is untrusted and stays lean when there is no mute.
          ...(e.muted === true ? { muted: true } : {})
        })
      }
      active = activeKept === -1 ? Math.min(Math.max(rawActive, 0), Math.max(workspaces.length - 1, 0)) : activeKept
    } else {
      // v1: one folder per window; an invalid folder discards the window.
      const root = sanitizeRoot(w.root)
      if (root === undefined) continue
      if (root !== null && taken(root)) continue
      workspaces.push({ root, branch: null })
    }

    if (workspaces.length === 0) continue
    for (const ws of workspaces) if (ws.root !== null) seen.push(ws.root)
    total += workspaces.length
    result.push({ workspaces, active, bounds: sanitizeBounds(w.bounds), maximized: w.maximized === true })
    if (result.length >= MAX_WINDOWS) break
  }
  return result
}

/**
 * Restore plan of a window: removes the folders that vanished from disk, adjusts the active one and ensures at least
 * one workspace (an empty view when nothing is left).
 */
export function planRestore(saved: SavedWindow, exists: (root: string) => boolean): SavedWindow {
  const kept: Array<{ ws: SavedWorkspace; index: number }> = []
  for (const [index, ws] of saved.workspaces.entries()) {
    if (ws.root === null || exists(ws.root)) kept.push({ ws, index })
  }
  if (kept.length === 0) return { ...saved, workspaces: [{ root: null, branch: null }], active: 0 }
  const found = kept.findIndex((k) => k.index === saved.active)
  const active = found === -1 ? Math.min(Math.max(saved.active, 0), kept.length - 1) : found
  return { ...saved, workspaces: kept.map((k) => k.ws), active }
}

/**
 * Removes from a saved window the workspaces whose folder already has an owner (another concurrent restore, or the
 * user opened it before the async check finished). `null` = the window only had already open folders and must not be
 * recreated.
 */
export function skipOwnedRoots(saved: SavedWindow, owned: (root: string) => boolean): SavedWindow | null {
  const hasFree = saved.workspaces.some((ws) => ws.root === null || !owned(ws.root))
  if (!hasFree) return null
  return planRestore(saved, (root) => !owned(root))
}

const MIN_VISIBLE_WIDTH = 100
const MIN_VISIBLE_HEIGHT = 50

/** `true` if a usable part of the window falls inside some work area (disconnected monitor = outside). */
export function isVisibleOnSomeDisplay(bounds: SavedBounds, workAreas: readonly SavedBounds[]): boolean {
  return workAreas.some((area) => {
    const width = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const height = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return width >= MIN_VISIBLE_WIDTH && height >= MIN_VISIBLE_HEIGHT
  })
}
