import { isAbsolute, resolve } from 'node:path'

/** Directory read from the shell, or the initial one when the read failed or did not return an absolute path. */
export function cwdOrInitial(cwd: string | null, initialCwd: string): string {
  return cwd && isAbsolute(cwd) ? cwd : initialCwd
}

/**
 * Where to look for a path clicked in the terminal. Absolute: itself. Relative: each base, without repetition, in the
 * given order (shell cwd → window folder → initial cwd: npm scripts run at the package root and the shell may be in a
 * subfolder).
 */
export function linkCandidates(expanded: string, bases: readonly string[]): string[] {
  if (isAbsolute(expanded)) return [expanded]
  return [...new Set(bases)].map((base) => resolve(base, expanded))
}
