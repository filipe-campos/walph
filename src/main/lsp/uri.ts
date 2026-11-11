import { fileURLToPath, pathToFileURL } from 'node:url'
import { posix, win32 } from 'node:path'
import { pathTail } from '@shared/pathCompare'

const isWin = (platform: string): boolean => platform === 'win32'

/** `file://` URI of the absolute path (spaces, `#`, accents and Windows drives encoded by Node). */
export function pathToUri(path: string, platform: string = process.platform): string {
  return pathToFileURL(path, { windows: isWin(platform) }).href
}

/** Native path of the `file://` URI, or `null` if it is not a valid file URI (`untitled:`, `zipfile:`…). */
export function uriToPath(uri: string, platform: string = process.platform): string | null {
  if (!uri.startsWith('file:')) return null
  try {
    return fileURLToPath(uri, { windows: isWin(platform) })
  } catch {
    return null
  }
}

/**
 * Path spelling the renderer uses: the server returns `c:\\proj\\a.ts` (lowercase drive) or another case on macOS,
 * and the renderer compares paths by strict equality. Open document → the path it was opened with; inside the
 * folder → the folder prefix as the window knows it + the rest as it came; outside it → as it came.
 */
export function canonicalPath(
  path: string,
  root: string | null,
  openPath: (path: string) => string | undefined,
  platform: string = process.platform
): string {
  const open = openPath(path)
  if (open) return open
  const rest = root ? pathTail(root, path, { platform }) : null
  if (!root || !rest) return path
  return rest.length === 0 ? root : (isWin(platform) ? win32 : posix).join(root, ...rest)
}
