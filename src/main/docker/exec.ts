import type { WebContents } from 'electron'
import { resolveContainerRef } from './refs'
import { specFor } from './run'
import { viewOf } from './viewState'

/**
 * For the terminal: `docker exec -it -- <id> sh` with the `docker.path` executable. `ref` = hex id or name from this
 * view's last `list()`. Throws with a translated message.
 */
export async function dockerExecCommand(
  sender: WebContents,
  ref: unknown
): Promise<{ file: string; args: string[]; env: Record<string, string> }> {
  const id = resolveContainerRef(ref, viewOf(sender).ps)
  const spec = await specFor(sender)
  return { file: spec.file, args: ['exec', '-it', '--', id, 'sh'], env: spec.env }
}
