import { git } from './run'

/** Output of `rev-list --parents -n 1`: `<commit> <parent>…`. */
export function parseParents(out: string): string[] {
  return out.trim().split(' ').slice(1)
}

/** Parents of commit `rev` (empty = root commit). Rejects if `rev` does not resolve to a commit. */
export async function parentsOf(top: string, rev: string): Promise<string[]> {
  return parseParents(await git(top, ['rev-list', '--parents', '-n', '1', `${rev}^{commit}`, '--']))
}
