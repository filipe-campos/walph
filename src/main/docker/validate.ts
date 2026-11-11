import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { DockerComposeAction, DockerContainerAction } from '@shared/types'
import { isComposeAction } from './compose'
import { COMPOSE_PROJECT } from './refs'
import { UserError } from '../errors'

const CONTAINER_ACTIONS = new Set<string>(['start', 'stop', 'restart'])

/** `docker:list` options: only `background: true` counts (a background list accepts an older cache). */
export function parseListOptions(value: unknown): { background: boolean } {
  return {
    background: isRecord(value) && value.background === true
  }
}

export function parseContainerAction(value: unknown): DockerContainerAction {
  if (typeof value !== 'string' || !CONTAINER_ACTIONS.has(value))
    throw new UserError(t().containers.errors.invalidAction)
  return value as DockerContainerAction
}

/** Compose project (safe name for `-p`) + known action; the rest of the resolution is done in main. */
export function parseComposeRequest(
  project: unknown,
  action: unknown
): { project: string; action: DockerComposeAction } {
  if (typeof project !== 'string' || !COMPOSE_PROJECT.test(project) || !isComposeAction(action)) {
    throw new UserError(t().containers.errors.invalidComposeProject)
  }
  return { project, action }
}
