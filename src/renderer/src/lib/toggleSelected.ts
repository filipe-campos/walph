/** Toggles `path` in the selection (the selection order is kept: the first selected comes first). */
export function toggleSelected(selected: readonly string[], path: string): string[] {
  return selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path]
}
