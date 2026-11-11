import { t } from '@shared/i18n'
import { UserError } from '../errors'

export interface UpstreamTarget {
  remote: string
  ref: string
}

/** Output of `git remote`: one name per line. */
export function parseRemoteList(out: string): string[] {
  return out.split('\n').filter(Boolean)
}

/**
 * `<remote>/<branch>` split into its parts. The remote can have `/` in its name, so the longest among the
 * real remotes wins.
 */
export function splitRemoteBranch(remotes: string[], name: string): { remote: string; branch: string } | null {
  const remote = remotes.filter((r) => name.startsWith(`${r}/`)).sort((a, b) => b.length - a.length)[0]
  return remote ? { remote, branch: name.slice(remote.length + 1) } : null
}

/** Remote to publish a new branch: `origin`, or the only existing one. */
export function pickPublishRemote(remotes: string[]): string {
  if (remotes.length === 0) throw new UserError(t().git.errors.noRemote)
  if (remotes.includes('origin')) return 'origin'
  const [only] = remotes
  if (remotes.length === 1 && only !== undefined) return only
  throw new UserError(t().git.errors.ambiguousRemote)
}

/** Explicit push to the upstream: does not depend on `push.default` (a `fix` tracking `origin/main` or `matching`). */
export function pushArgs(upstream: UpstreamTarget): string[] {
  if (upstream.remote === '.') throw new UserError(t().git.errors.localUpstream)
  return ['push', upstream.remote, `HEAD:${upstream.ref}`]
}
