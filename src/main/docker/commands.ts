import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import type { DockerInfo, DockerInspect, DockerLogLine } from '@shared/types'
import { getSenderRoot } from '../window/windows'
import { composeProjectArgs, findComposeFile } from './compose'
import { resolveComposeTarget } from './composeTarget'
import { DockerError, classifyDockerFailure } from './errors'
import { buildInvestigationPrompt, formatLogs } from './investigation'
import { parseComposeRequest, parseContainerAction } from './validate'
import { parseInfo } from './parseInfo'
import { parseInspect } from './parseInspect'
import { parseLogLine } from './parseLogs'
import { fetchPs, invalidatePs } from './ps'
import { resolveContainerRef } from './refs'
import { ACTION_TIMEOUT_MS, COMPOSE_TIMEOUT_MS, run } from './run'
import { viewOf } from './viewState'
import { UserError } from '../errors'

export async function info(sender: WebContents): Promise<DockerInfo> {
  try {
    const [{ stdout, stderr }, context] = await Promise.all([
      run(sender, ['info', '--format', '{{json .}}']),
      run(sender, ['context', 'show']).then(
        (r) => r.stdout.trim() || null,
        () => null
      )
    ])
    return parseInfo(stdout, stderr, context)
  } catch (err) {
    if (err instanceof DockerError) return err.info
    return classifyDockerFailure({ message: (err as Error).message })
  }
}

export async function containerAction(sender: WebContents, ref: unknown, action: unknown): Promise<void> {
  const verb = parseContainerAction(action)
  const id = resolveContainerRef(ref, viewOf(sender).ps)
  try {
    await run(sender, [verb, '--', id], { timeout: ACTION_TIMEOUT_MS })
  } finally {
    // Even on failure the state may have changed: the next list cannot come from the cache older than the action.
    invalidatePs()
  }
}

export async function composeAction(sender: WebContents, projectArg: unknown, actionArg: unknown): Promise<void> {
  try {
    const { project, action } = parseComposeRequest(projectArg, actionArg)
    let members = viewOf(sender).ps.filter((c) => c.project === project)
    if (members.length === 0) members = (await fetchPs(sender, 0)).filter((c) => c.project === project)
    if (members.length === 0) throw new UserError(t().containers.errors.projectNotFound(project))
    const { workingDir, files } = await resolveComposeTarget(project, members)
    await run(sender, composeProjectArgs(project, workingDir, files, action), {
      cwd: workingDir,
      timeout: COMPOSE_TIMEOUT_MS,
      lastErrorLine: true
    })
  } finally {
    invalidatePs()
  }
}

export async function composeUpWorkspace(sender: WebContents): Promise<void> {
  try {
    const root = getSenderRoot(sender)
    const file = await findComposeFile(root)
    if (!root || !file) throw new UserError(t().containers.errors.noWorkspaceCompose)
    await run(sender, ['compose', '-f', file, 'up', '-d'], {
      cwd: root,
      timeout: COMPOSE_TIMEOUT_MS,
      lastErrorLine: true
    })
  } finally {
    invalidatePs()
  }
}

export async function inspectOf(sender: WebContents, ref: unknown): Promise<DockerInspect> {
  const id = resolveContainerRef(ref, viewOf(sender).ps)
  const { stdout } = await run(sender, ['inspect', '--', id])
  return parseInspect(stdout)
}

export async function investigationPrompt(sender: WebContents, ref: unknown): Promise<string> {
  const id = resolveContainerRef(ref, viewOf(sender).ps)
  const [inspect, logs] = await Promise.all([
    inspectOf(sender, id),
    run(sender, ['logs', '--tail', '100', '--timestamps', '--', id])
  ])
  const parse = (text: string, stream: DockerLogLine['stream']): DockerLogLine[] =>
    text
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => parseLogLine(l, stream))
  return buildInvestigationPrompt(inspect, formatLogs(parse(logs.stdout, 'stdout'), parse(logs.stderr, 'stderr')))
}
