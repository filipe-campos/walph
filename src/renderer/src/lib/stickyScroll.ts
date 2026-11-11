// Which header lines stay pinned at the top of the editor (sticky scroll). Pure: the caller says which scopes
// enclose each line (syntax tree / folds).

/** A foldable scope: the header line and the last line of the block (1-based). */
export interface Scope {
  header: number
  end: number
}

/**
 * Headers (from the outside in) to show with `topLine` at the top of the screen. Each pinned line covers one text line,
 * so the scopes are the ones that enclose the line right below the pinned strip; a scope leaves when its last line
 * reaches the line it would take. `scopesAt` returns the scopes that contain the line, from the outside in.
 */
export function stickyLines(scopesAt: (line: number) => Scope[], topLine: number, max: number): number[] {
  if (max <= 0) return []
  let lines: number[] = []
  // The pinned strip pushes the probed line down, which may change the scopes: repeats until it settles.
  for (let round = 0; round <= max; round++) {
    const probe = topLine + lines.length
    const next: number[] = []
    for (const scope of scopesAt(probe)) {
      if (next.length >= max) break
      if (scope.header < probe && scope.end > topLine + next.length) next.push(scope.header)
    }
    if (next.length === lines.length && next.every((line, i) => line === lines[i])) break
    lines = next
  }
  return lines
}

/** Merges scopes from different sources: one per header line (the longest), from the outside in. */
export function mergeScopes(scopes: Scope[]): Scope[] {
  const byHeader = new Map<number, Scope>()
  for (const scope of scopes) {
    const known = byHeader.get(scope.header)
    if (!known || scope.end > known.end) byHeader.set(scope.header, scope)
  }
  return [...byHeader.values()].sort((a, b) => a.header - b.header)
}
