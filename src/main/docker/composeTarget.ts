import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { t } from '@shared/i18n'
import { isFile } from './compose'
import type { PsContainer } from './parsePs'
import { UserError } from '../errors'

export interface ComposeTarget {
  workingDir: string
  files: string[]
}

/** Project folder and files from the containers' labels; everything must exist. Throws with a translated message. */
export async function resolveComposeTarget(project: string, members: readonly PsContainer[]): Promise<ComposeTarget> {
  const workingDir = members.find((c) => c.workingDir)?.workingDir ?? null
  if (!workingDir || !isAbsolute(workingDir)) {
    throw new UserError(t().containers.errors.projectWithoutDir(project))
  }
  const isDir = await stat(workingDir).then(
    (s) => s.isDirectory(),
    () => false
  )
  if (!isDir) throw new UserError(t().containers.errors.projectDirNotFound(project, workingDir))
  const files = members.find((c) => c.configFiles.length > 0)?.configFiles ?? []
  for (const file of files) {
    if (!isAbsolute(file) || !(await isFile(file))) throw new UserError(t().containers.errors.composeFileNotFound(file))
  }
  return { workingDir, files }
}
