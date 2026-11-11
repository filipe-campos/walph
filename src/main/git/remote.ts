import type { WebContents } from 'electron'
import { parseRemoteList, pickPublishRemote, pushArgs, type UpstreamTarget } from './remoteRefs'
import { git, runGit, type RunResult } from './run'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

export async function remoteNames(root: string): Promise<string[]> {
  return parseRemoteList(await git(root, ['remote']))
}

async function currentBranch(root: string): Promise<string> {
  try {
    return (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  } catch {
    throw new UserError(t().git.errors.detachedNoSync)
  }
}

/** Remote and full upstream ref of the branch (`branch.<name>.remote`/`merge`), or null if there is none. */
async function upstreamTarget(root: string, branch: string): Promise<UpstreamTarget | null> {
  try {
    const remote = (await git(root, ['config', '--get', `branch.${branch}.remote`])).trim()
    const ref = (await git(root, ['config', '--get', `branch.${branch}.merge`])).trim()
    return remote && ref ? { remote, ref } : null
  } catch {
    return null
  }
}

function output(result: RunResult): string {
  return `${result.stdout}${result.stderr}`.trim()
}

export async function pull(sender: WebContents, root: string): Promise<string> {
  const branch = await currentBranch(root)
  if (!(await upstreamTarget(root, branch))) throw new UserError(t().git.errors.noUpstream)
  return output(await runGit(root, ['pull', '--ff-only'], { owner: sender, context: 'pull' }))
}

export async function push(sender: WebContents, root: string, setUpstream: boolean): Promise<string> {
  const branch = await currentBranch(root)
  const upstream = await upstreamTarget(root, branch)
  if (!upstream && !setUpstream) throw new UserError(t().git.errors.noUpstream)
  const args = upstream ? pushArgs(upstream) : ['push', '-u', pickPublishRemote(await remoteNames(root)), branch]
  return output(await runGit(root, args, { owner: sender, context: 'push' }))
}

export async function sync(sender: WebContents, root: string): Promise<string> {
  const branch = await currentBranch(root)
  const upstream = await upstreamTarget(root, branch)
  if (!upstream) throw new UserError(t().git.errors.noUpstream)
  const pulled = output(await runGit(root, ['pull', '--ff-only'], { owner: sender, context: 'pull' }))
  const ahead = Number((await git(root, ['rev-list', '--count', '@{upstream}..HEAD'])).trim())
  if (!ahead) return pulled
  const pushed = output(await runGit(root, pushArgs(upstream), { owner: sender, context: 'push' }))
  return [pulled, pushed].filter(Boolean).join('\n')
}
