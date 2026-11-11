// Code lens placement: a row of lenses above each line that has any, with that line's indentation.

/** Width (in columns) of the indentation of `text`, with tabs up to the next `tabSize` stop. */
export function indentColumns(text: string, tabSize: number): number {
  let columns = 0
  for (const ch of text) {
    if (ch === ' ') columns++
    else if (ch === '\t') columns += tabSize - (columns % tabSize)
    else break
  }
  return columns
}

/** Groups by line (in line order, and in the original order within each one). */
export function groupByLine<T>(items: readonly T[], lineOf: (item: T) => number): { line: number; items: T[] }[] {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const line = lineOf(item)
    const group = groups.get(line)
    if (group) group.push(item)
    else groups.set(line, [item])
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([line, list]) => ({ line, items: list }))
}
