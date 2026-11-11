import type { DirEntry, ExplorerAction } from '@shared/types'
import { t } from '@shared/i18n'
import { formatNumber } from '@shared/i18n/format'
import { basename, dirname, relativeTo, samePath } from './lib/path'
import { get, set } from './store'
import { attempt } from './attempt'
import {
  handleRemoved,
  handleRenamed,
  loadDir,
  notifyExplorerRenamed,
  revealInExplorer,
  selectExplorerPaths,
  setExplorerEdit,
  setExplorerSelected,
  toggleDir
} from './explorerActions'
import { outermostPaths } from './lib/explorerSelection'
import { refreshGit } from './gitActions'
import { confirmDialog } from './saveActions'
import { openFile } from './tabActions'
import { canCompareWithSelected, compareWithSelected, selectForCompare } from './compareActions'

const api = window.api

/** Click or Enter on a row: a folder toggles, a file opens in preview without stealing the tree focus. */
export function activateExplorerEntry(entry: DirEntry): void {
  if (entry.isDirectory) void toggleDir(entry.path)
  else openFile(entry.path, undefined, { preview: true, preserveFocus: true })
}

function announceRenamed(from: string, to: string): void {
  handleRenamed(from, to)
  notifyExplorerRenamed(from, to)
}

/** Paths the commands act on: the selection, or just the focused row when it is the only thing marked. */
function targetPaths(): string[] {
  const { explorerSelection, explorerSelected } = get()
  return explorerSelection.length ? explorerSelection : explorerSelected ? [explorerSelected] : []
}

/** Confirms and moves to the trash (context menu and Delete key). `true` = deleted. */
export async function deletePaths(paths: readonly string[]): Promise<boolean> {
  const targets = outermostPaths(paths)
  const first = targets[0]
  if (first === undefined) return false
  return attempt(
    async () => {
      const confirmed = await confirmDialog({
        message:
          targets.length === 1
            ? t().files.explorer.confirmTrash(basename(first))
            : t().files.explorer.confirmTrashMany(formatNumber(targets.length)),
        confirmLabel: t().files.contextMenu.moveToTrash,
        destructive: true
      })
      if (!confirmed) return false
      const dirs = new Set<string>()
      try {
        for (const path of targets) {
          await api.fs.trash(path)
          handleRemoved(path)
          dirs.add(dirname(path))
        }
      } finally {
        await Promise.all([...dirs].map((dir) => loadDir(dir)))
        void refreshGit()
      }
      return true
    },
    { fallback: false }
  )
}

/** Moves `from` into `dir`: open tabs follow the new path and both folders are reread. */
export async function moveEntry(from: string, dir: string): Promise<string | null> {
  return attempt(
    async () => {
      const to = await api.fs.move(from, dir)
      announceRenamed(from, to)
      await Promise.all([loadDir(dirname(from)), loadDir(dir)])
      void refreshGit()
      return to
    },
    { fallback: null }
  )
}

/** Moves several items into `dir` (dragging the selection), skipping those already in it. */
export async function moveEntries(from: readonly string[], dir: string): Promise<void> {
  for (const path of outermostPaths(from)) {
    if (!samePath(dirname(path), dir, window.api.platform)) await moveEntry(path, dir)
  }
}

/** Something to paste: something copied here or files copied in Finder (enables "Paste" in the context menu). */
async function canPasteInExplorer(): Promise<boolean> {
  if (get().explorerClipboard) return true
  return (await api.fs.clipboardFiles().catch(() => [] as string[])).length > 0
}

/** Folder that receives the paste: the selected one, or the selected file's folder (the root without a selection). */
export function explorerTargetDir(): string | null {
  const { root, explorerSelected: selected } = get()
  if (!root) return null
  if (!selected) return root
  if (selected === root) return root
  const entry = Object.values(get().dirs)
    .flat()
    .find((e) => e.path === selected)
  return entry?.isDirectory ? entry.path : dirname(selected)
}

// Native clipboard list right after copy/cut: only a change relative to it (a copy made outside the app) beats the
// internal clipboard. Without it, where `writeClipboardFiles` does not write (Linux/Windows), old OS files would be
// pasted instead of what the user just copied.
let nativeAtCopy: Promise<string[]> = Promise.resolve([])

/** Copies (or cuts) to the explorer clipboard; a copy also goes to the native clipboard, to paste in Finder. */
function copyToExplorerClipboard(paths: string[], mode: 'copy' | 'cut'): void {
  if (!paths.length) return
  set({ explorerClipboard: { paths, mode } })
  nativeAtCopy = (async () => {
    if (mode === 'copy') await api.fs.writeClipboardFiles(paths).catch(() => false)
    return api.fs.clipboardFiles().catch(() => [] as string[])
  })()
}

export function copySelection(mode: 'copy' | 'cut'): void {
  const { root } = get()
  copyToExplorerClipboard(outermostPaths(targetPaths().filter((p) => p !== root)), mode)
}

/** What to paste: the internal clipboard, unless a later copy was made outside the app (the native one changed). */
async function pasteSources(): Promise<{ paths: string[]; cut: boolean }> {
  const internal = get().explorerClipboard
  const [native, snapshot] = await Promise.all([
    api.fs.clipboardFiles().catch(() => [] as string[]),
    internal ? nativeAtCopy : Promise.resolve([] as string[])
  ])
  if (native.length && !sameList(native, snapshot)) return { paths: native, cut: false }
  return { paths: internal?.paths ?? [], cut: internal?.mode === 'cut' }
}

const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((p, i) => p === b[i])

/** Pastes into `dir` (default: the selection target): cut moves, copy duplicates with a free name. Selects the last. */
export async function pasteIntoExplorer(dir: string | null = explorerTargetDir()): Promise<void> {
  const { root } = get()
  if (!root || !dir) return
  await attempt(async () => {
    const { paths, cut } = await pasteSources()
    if (get().root !== root || !paths.length) return
    const added: string[] = []
    for (const src of paths) {
      const to = cut ? await moveEntry(src, dir) : await copyEntry(src, dir)
      if (to) added.push(to)
    }
    if (cut) set({ explorerClipboard: null })
    await finishAdd(root, dir, added)
  })
}

/** Copies `src` into `dir` without overwriting; `null` if it failed (the error was already shown). */
async function copyEntry(src: string, dir: string): Promise<string | null> {
  return attempt(() => api.fs.copy(src, dir), { fallback: null })
}

async function finishAdd(root: string, dir: string, added: string[]): Promise<void> {
  if (get().root !== root) return
  await toggleDir(dir, true)
  await loadDir(dir)
  void refreshGit()
  const last = added.at(-1)
  if (!last) return
  selectExplorerPaths(added)
  void revealInExplorer(last)
}

/** Duplicates the item next to it ("a copy.ts"). */
async function duplicateEntry(path: string): Promise<string | null> {
  const root = get().root
  if (!root || path === root) return null
  const dir = dirname(path)
  const copy = await copyEntry(path, dir)
  await finishAdd(root, dir, copy ? [copy] : [])
  return copy
}

export async function duplicateSelection(): Promise<void> {
  await duplicatePaths(targetPaths())
}

async function duplicatePaths(paths: readonly string[]): Promise<void> {
  const root = get().root
  const copies: string[] = []
  for (const path of outermostPaths(paths)) {
    const copy = await duplicateEntry(path)
    if (copy) copies.push(copy)
  }
  if (root && get().root === root && copies.length > 1) selectExplorerPaths(copies)
}

/** Files dropped from the OS onto the explorer: always a copy (Finder does not move). */
async function importFiles(sources: string[], dir: string): Promise<void> {
  const root = get().root
  if (!root) return
  const added: string[] = []
  for (const src of sources) {
    const to = await copyEntry(src, dir)
    if (to) added.push(to)
  }
  await finishAdd(root, dir, added)
}

export function revealPath(path: string): void {
  api.fs.reveal(path)
}

export function copyPathToClipboard(path: string): void {
  api.fs.copyPath(path)
}

/** The root cannot be renamed, deleted, cut, copied or duplicated. */
const ROOT_EXCLUDED: ReadonlySet<ExplorerAction> = new Set(['rename', 'delete', 'cut', 'copy', 'duplicate'])

/**
 * Native context menu of a row (`isRoot`: the open folder, with fewer actions). Clicking outside the selection replaces
 * it with the row; inside it, the actions apply to the whole selection.
 */
export async function showExplorerContextMenu(entry: DirEntry, isRoot = false): Promise<void> {
  if (!isRoot && !get().explorerSelection.includes(entry.path)) setExplorerSelected(entry.path)
  const targets = isRoot ? [entry.path] : targetPaths()
  await attempt(async () => {
    const action = await api.fs.showContextMenu(entry.isDirectory, {
      canPaste: await canPasteInExplorer(),
      canCompare: canCompareWithSelected(entry.path),
      selectionCount: targets.length
    })
    if (action && !(isRoot && ROOT_EXCLUDED.has(action))) await runExplorerAction(action, entry, targets)
  })
}

/** Files dropped from Finder become copies inside `dir`. */
export async function importDroppedFiles(files: Iterable<File>, dir: string): Promise<void> {
  const sources = [...files].map((f) => api.files.pathForFile(f)).filter(Boolean)
  if (sources.length) await importFiles(sources, dir)
}

async function runExplorerAction(action: ExplorerAction, entry: DirEntry, targets: string[]): Promise<void> {
  await attempt(async () => {
    switch (action) {
      case 'newFile':
      case 'newFolder':
        await toggleDir(entry.path, true)
        setExplorerEdit({ mode: action, dir: entry.path })
        break
      case 'rename':
        setExplorerEdit({ mode: 'rename', path: entry.path })
        break
      case 'delete':
        await deletePaths(targets)
        break
      case 'copyPath':
        copyPathToClipboard(targets.join('\n'))
        break
      case 'copyRelativePath': {
        // The workspace root becomes "." (relativeTo returns empty).
        const root = get().root
        copyPathToClipboard(targets.map((p) => (root ? relativeTo(root, p) || '.' : p)).join('\n'))
        break
      }
      case 'copy':
      case 'cut':
        copyToExplorerClipboard(outermostPaths(targets), action)
        break
      case 'paste':
        await pasteIntoExplorer(entry.isDirectory ? entry.path : dirname(entry.path))
        break
      case 'duplicate':
        await duplicatePaths(targets)
        break
      case 'reveal':
        revealPath(entry.path)
        break
      case 'selectForCompare':
        selectForCompare(entry.path)
        break
      case 'compareWithSelected':
        compareWithSelected(entry.path)
        break
    }
  })
}

/** Commits the explorer row being edited (create file/folder or rename). */
export async function submitEdit(value: string): Promise<void> {
  const edit = get().explorerEdit
  setExplorerEdit(null)
  const name = value.trim()
  if (!edit || !name) return
  await attempt(async () => {
    if (edit.mode === 'rename') {
      if (name === basename(edit.path)) return
      const target = await api.fs.rename(edit.path, name)
      announceRenamed(edit.path, target)
      await loadDir(dirname(edit.path))
    } else if (edit.mode === 'newFile') {
      const path = await api.fs.createFile(edit.dir, name)
      await loadDir(edit.dir)
      openFile(path)
    } else {
      const path = await api.fs.createDir(edit.dir, name)
      await loadDir(edit.dir)
      await toggleDir(path, true)
    }
  })
}
