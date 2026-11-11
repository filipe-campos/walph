// Window navigation history (back/forward). Leaf module: the store injects where to read "the current position" from
// and calls `recordNavigation` before the jumps it makes itself (clicking a problem); the rest lives in
// `lspNavigationActions.ts`.
import {
  emptyHistory,
  mapHistoryPaths,
  recordLocation,
  stepBack,
  stepForward,
  type NavHistory,
  type NavLocation
} from './lib/navigationHistory'
import { replacePrefix, isInside } from './lib/path'

let history: NavHistory = emptyHistory
let currentLocation: () => NavLocation | null = () => null

export function bindNavigationSource(source: () => NavLocation | null): void {
  currentLocation = source
}

/** Stores the current position: call before any jump (definition, reference, symbol, problem, go to line). */
export function recordNavigation(): void {
  const here = currentLocation()
  if (here) history = recordLocation(history, here)
}

/** Steps back/forward and returns the target (`null` if none). The caller opens the file at the position. */
export function stepNavigation(direction: 'back' | 'forward'): NavLocation | null {
  const step = (direction === 'back' ? stepBack : stepForward)(history, currentLocation())
  if (!step) return null
  history = step.history
  return step.target
}

/** Folder changed: the entries point to files of another folder. */
export function resetNavigation(): void {
  history = emptyHistory
}

/** File or folder renamed: the entries follow the new path. */
export function renameNavigationPaths(from: string, to: string): void {
  history = mapHistoryPaths(history, (path) => (isInside(from, path) ? replacePrefix(path, from, to) : path))
}
