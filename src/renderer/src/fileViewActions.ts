import { t } from '@shared/i18n'
import { attempt } from './attempt'
import { basename } from './lib/path'
import { forcedEncodingFor, get, onRootChange } from './store'
import { activateGroup, openFile } from './tabActions'
import { notify } from './toasts'

// Disk images already read by the Markdown preview (path → data URL). The read goes through main, which only accepts
// files of the open folder.
const IMAGE_TTL_MS = 10_000
const IMAGE_CACHE_MAX = 60
interface CachedImage {
  at: number
  url: Promise<string>
  value?: string | undefined
}
const imageCache = new Map<string, CachedImage>()

/** Image of an image viewer: always reread (the watcher notice is what asks for the new read). */
export function readImage(path: string): Promise<string> {
  return window.api.fs.readImage(path)
}

/** Last data URL read for a Markdown image, even if expired (to paint immediately while the read is renewed). */
export function knownImage(path: string): string | undefined {
  return imageCache.get(path)?.value
}

/** Image referenced by a Markdown file: the same picture in several places or renders reads the disk once. */
export function readCachedImage(path: string): Promise<string> {
  const hit = imageCache.get(path)
  if (hit && Date.now() - hit.at < IMAGE_TTL_MS) return hit.url
  const url = window.api.fs.readImage(path)
  const entry: CachedImage = { at: Date.now(), url, value: hit?.value }
  imageCache.delete(path)
  imageCache.set(path, entry)
  url.then(
    (value) => {
      entry.value = value
    },
    // Failed: the next render tries again (the file may appear later).
    () => imageCache.get(path) === entry && imageCache.delete(path)
  )
  if (imageCache.size > IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value as string)
  return url
}

/** Text of a file in the tab's forced encoding (Markdown preview whose source is not loaded). */
export async function readSourceText(path: string): Promise<string> {
  return (await window.api.fs.readText(path, forcedEncodingFor(path))).text
}

/**
 * Opens in the editor a file targeted by a preview link: in another group (preferably the one showing the source
 * file), not over the `previewTabId` preview. A missing file becomes a notice.
 */
export async function openLinkedFile(path: string, previewTabId: string): Promise<void> {
  await attempt(async () => {
    if (!(await window.api.fs.exists(path))) {
      notify(t().editor.markdown.fileNotFound(basename(path)), 'info')
      return
    }
    const { editorGroups, tabs } = get()
    const mine = editorGroups.find((g) => g.tabIds.includes(previewTabId))
    const sourcePath = tabs.find((t) => t.id === previewTabId)?.path
    const sourceIds = new Set(tabs.filter((t) => t.kind === 'file' && t.path === sourcePath).map((t) => t.id))
    const others = editorGroups.filter((g) => g !== mine)
    const other = others.find((g) => g.tabIds.some((id) => sourceIds.has(id))) ?? others[0]
    if (other) activateGroup(other.id)
    openFile(path)
  })
}

export function startFileViewReactions(): () => void {
  return onRootChange(() => imageCache.clear())
}
