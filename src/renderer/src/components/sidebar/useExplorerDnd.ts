import { useEffect, useState, type DragEvent } from 'react'
import { EXPLORER_DRAG_TYPE, moveTargetDirAll } from '../../lib/explorerTree'
import { dirname } from '../../lib/path'
import { useStore } from '../../store'
import { setExplorerDrag, toggleDir } from '../../explorerActions'
import { outermostPaths } from '../../lib/explorerSelection'
import { importDroppedFiles, moveEntries } from '../../explorerFsActions'

type DragHandler = (e: DragEvent<HTMLElement>) => void

interface ExplorerDnd {
  /** Folder that would receive the dropped item (highlight), or null. */
  dropDir: string | null
  /** Drag handlers for the tree element. */
  handlers: {
    onDragStart: DragHandler
    onDragEnd: DragHandler
    onDragOver: DragHandler
    onDragLeave: DragHandler
    onDrop: DragHandler
  }
}

function rowTargetOf(e: DragEvent<HTMLElement>): { path: string; isDirectory: boolean } | null {
  const row = (e.target as Element).closest<HTMLElement>('[data-path]')
  return row?.dataset.path ? { path: row.dataset.path, isDirectory: row.dataset.folder !== undefined } : null
}

// File dragged from the OS (Finder): always copies, to the folder under the cursor or the file's folder (root on empty
// space).
function isExternalDrag(e: DragEvent<HTMLElement>): boolean {
  return e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(EXPLORER_DRAG_TYPE)
}

function dropTargetOf(root: string | null, e: DragEvent<HTMLElement>): string | null | undefined {
  if (!root) return undefined
  if (isExternalDrag(e)) {
    const target = rowTargetOf(e)
    return !target ? root : target.isDirectory ? target.path : dirname(target.path)
  }
  const dragged = useStore.getState().explorerDrag
  if (!dragged.length || !e.dataTransfer.types.includes(EXPLORER_DRAG_TYPE)) return undefined
  return moveTargetDirAll(root, rowTargetOf(e), dragged, window.api.platform)
}

/** Drag to move (or copy from the OS): highlighted target folder + automatic opening of a collapsed folder. */
export function useExplorerDnd(root: string | null): ExplorerDnd {
  const [dropDir, setDropDir] = useState<string | null>(null)

  useEffect(() => {
    if (!dropDir || dropDir === root || useStore.getState().expanded[dropDir]) return
    const timer = setTimeout(() => void toggleDir(dropDir, true), 600)
    return () => clearTimeout(timer)
  }, [dropDir, root])

  return {
    dropDir,
    handlers: {
      onDragStart: (e) => {
        const row = (e.target as Element).closest<HTMLElement>('[data-path]')
        if (!row?.dataset.path) return
        // Dragging a selected row takes the whole selection; outside it, only the row.
        const { explorerSelection } = useStore.getState()
        setExplorerDrag(
          explorerSelection.includes(row.dataset.path) ? outermostPaths(explorerSelection) : [row.dataset.path]
        )
        e.dataTransfer.setData(EXPLORER_DRAG_TYPE, row.dataset.path)
        e.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: () => {
        setExplorerDrag([])
        setDropDir(null)
      },
      onDragOver: (e) => {
        const dir = dropTargetOf(root, e)
        if (dir === undefined) return
        // Invalid target (itself, a descendant, the current folder): without preventDefault the cursor shows
        // "forbidden".
        if (dir) {
          e.preventDefault()
          e.dataTransfer.dropEffect = isExternalDrag(e) ? 'copy' : 'move'
        }
        setDropDir(dir)
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropDir(null)
      },
      onDrop: (e) => {
        const dir = dropTargetOf(root, e)
        if (dir === undefined) return
        e.preventDefault()
        e.stopPropagation()
        if (isExternalDrag(e)) {
          setDropDir(null)
          if (dir) void importDroppedFiles(e.dataTransfer.files, dir)
          return
        }
        const from = useStore.getState().explorerDrag
        setExplorerDrag([])
        setDropDir(null)
        if (dir && from.length) void moveEntries(from, dir)
      }
    }
  }
}
