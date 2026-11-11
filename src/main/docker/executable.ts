import { t } from '@shared/i18n'
import { buildChildEnv } from '../env/childEnv'
import { resolveExecutable } from '../env/executable'
import { effectivePath } from '../env/loginShell'

const messages = {
  notFound: (value: string) => t().containers.errors.executableNotFound(value),
  windowsScript: (file: string) => t().containers.errors.scriptNotExecutable(file)
}

/**
 * `docker.path` → absolute path. Empty = `docker` in the PATH; a bare name is looked up in the PATH (the login one
 * included); an absolute path must exist. Throws with `code: 'ENOENT'` (the "Docker not found" error) when not found.
 */
export function pickDockerExecutable(
  setting: string,
  pathVar: string,
  platform: string = process.platform,
  isFile?: (path: string) => boolean
): string {
  return resolveExecutable(setting.trim() || 'docker', pathVar, { messages, platform, isFile })
}

export interface DockerSpec {
  file: string
  /** Process environment: inherited + login shell PATH, without `ELECTRON_RUN_AS_NODE`. */
  env: Record<string, string>
}

export async function resolveDockerSpec(setting: string): Promise<DockerSpec> {
  const pathVar = await effectivePath()
  const file = pickDockerExecutable(setting, pathVar)
  // No hints ("What's next") polluting the output we parse.
  const env = buildChildEnv(process.env, { DOCKER_CLI_HINTS: 'false' }, pathVar)
  return { file, env }
}
