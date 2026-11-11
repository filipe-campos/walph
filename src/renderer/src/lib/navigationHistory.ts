// Navigation history (back/forward), as in VS Code: each jump (definition, reference, symbol, problem, go to
// line) records the position it left from. Pure and immutable: the state lives in `navigationState.ts`.

export interface NavLocation {
  path: string
  /** 1-based. */
  line: number
  /** 0-based (like `Reveal.column`). */
  column: number
}

export interface NavHistory {
  back: NavLocation[]
  forward: NavLocation[]
}

export const NAV_LIMIT = 50
/**
 * Positions in the same file up to this many lines apart count as the same place (short jumps do not fill the stack).
 */
const NAV_NEAR_LINES = 5

export const emptyHistory: NavHistory = { back: [], forward: [] }

function isNear(a: NavLocation, b: NavLocation): boolean {
  return a.path === b.path && Math.abs(a.line - b.line) <= NAV_NEAR_LINES
}

const same = (a: NavLocation, b: NavLocation): boolean =>
  a.path === b.path && a.line === b.line && a.column === b.column

/** Pushes `from` (the place about to be jumped from) onto "back" and clears "forward". Neighboring entries merge. */
export function recordLocation(history: NavHistory, from: NavLocation): NavHistory {
  const back = [...history.back]
  const top = back[back.length - 1]
  if (top && isNear(top, from)) back[back.length - 1] = from
  else back.push(from)
  return { back: back.slice(-NAV_LIMIT), forward: [] }
}

export interface NavStep {
  history: NavHistory
  target: NavLocation
}

/** Goes back one step; `current` (where the user is) goes to "forward". `null` if there is nowhere to go back to. */
export function stepBack(history: NavHistory, current: NavLocation | null): NavStep | null {
  const back = [...history.back]
  // Drops entries identical to the current place: going back has to change position.
  for (let last = back.at(-1); current && last && same(last, current); last = back.at(-1)) back.pop()
  const target = back.pop()
  if (!target) return null
  const forward = current ? [...history.forward, current].slice(-NAV_LIMIT) : history.forward
  return { history: { back, forward }, target }
}

/** Goes forward one step; `current` goes back to "back". `null` if there is nowhere to go forward to. */
export function stepForward(history: NavHistory, current: NavLocation | null): NavStep | null {
  const forward = [...history.forward]
  for (let last = forward.at(-1); current && last && same(last, current); last = forward.at(-1)) forward.pop()
  const target = forward.pop()
  if (!target) return null
  const back = current ? [...history.back, current].slice(-NAV_LIMIT) : history.back
  return { history: { back, forward }, target }
}

/** File renamed or moved: the entries follow the new path. */
export function mapHistoryPaths(history: NavHistory, map: (path: string) => string): NavHistory {
  const fix = (l: NavLocation): NavLocation => {
    const path = map(l.path)
    return path === l.path ? l : { ...l, path }
  }
  return { back: history.back.map(fix), forward: history.forward.map(fix) }
}
