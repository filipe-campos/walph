// X/Y pairs of `git status --porcelain` that indicate a merge conflict (both sides touched the file).
const CONFLICT = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

export function isConflictStatus(index: string, workingDir: string): boolean {
  return CONFLICT.has(index + workingDir)
}
