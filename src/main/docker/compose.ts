import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { DockerComposeAction } from '@shared/types'

/** Files `docker compose` looks for in the folder, in Compose's own order of preference. */
export const COMPOSE_FILE_NAMES = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'] as const

const VERBS: Record<DockerComposeAction, string[]> = {
  up: ['up', '-d'],
  restart: ['restart'],
  stop: ['stop']
}

export function isComposeAction(v: unknown): v is DockerComposeAction {
  return v === 'up' || v === 'restart' || v === 'stop'
}

/** `docker compose` arguments of a project (directory and files already checked by the caller). */
export function composeProjectArgs(
  project: string,
  workingDir: string,
  files: readonly string[],
  action: DockerComposeAction
): string[] {
  return [
    'compose',
    '--project-directory',
    workingDir,
    ...files.flatMap((f) => ['-f', f]),
    '-p',
    project,
    ...VERBS[action]
  ]
}

export async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false
  )
}

/** First compose file (in Compose order) that exists in `root`. */
export async function findComposeFile(root: string | null): Promise<string | null> {
  if (!root) return null
  for (const name of COMPOSE_FILE_NAMES) {
    const candidate = join(root, name)
    if (await isFile(candidate)) return candidate
  }
  return null
}
