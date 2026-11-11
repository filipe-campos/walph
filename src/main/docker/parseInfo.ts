import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { DockerInfo } from '@shared/types'
import { classifyDockerFailure } from './errors'

/**
 * `docker info --format '{{json .}}'` + stderr. With the daemon down Docker 27 exits with code 0, prints JSON with an
 * empty `ServerVersion` (and `ServerErrors`) and the "Cannot connect…" only on stderr: empty version = daemon down.
 */
export function parseInfo(stdout: string, stderr: string, context: string | null): DockerInfo {
  let data: Record<string, unknown> = {}
  try {
    const raw: unknown = JSON.parse(stdout)
    if (isRecord(raw)) data = raw
  } catch {
    // handled below
  }
  const serverErrors = Array.isArray(data.ServerErrors)
    ? data.ServerErrors.filter((e): e is string => typeof e === 'string')
    : []
  const version = typeof data.ServerVersion === 'string' ? data.ServerVersion : ''
  if (version === '' || serverErrors.length > 0) {
    const failure = classifyDockerFailure({ stderr: `${stderr}\n${serverErrors.join('\n')}` })
    // Without recognizable text, an empty version is still daemon down.
    return failure.reason === 'error' && Object.keys(data).length > 0
      ? { ok: false, reason: 'daemonDown', message: t().containers.errors.daemonDown }
      : failure.reason === 'error'
        ? { ok: false, reason: 'error', message: t().containers.errors.unexpectedInfo }
        : failure
  }
  return {
    ok: true,
    context,
    version,
    memTotal: typeof data.MemTotal === 'number' ? data.MemTotal : 0,
    cpus: typeof data.NCPU === 'number' ? data.NCPU : 0
  }
}
