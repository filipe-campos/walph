import { t } from '@shared/i18n'
import { formatNumber } from '@shared/i18n/format'
import type { ExplorerAction } from '@shared/types'
import type { ChoiceEntry } from '../window/nativeUi'

/** Number of selected items from the renderer (untrusted): an integer >= 1, otherwise 1. */
export function parseSelectionCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 1 ? raw : 1
}

export interface ExplorerMenuOptions {
  isDir: boolean
  canPaste: boolean
  canCompare: boolean
  selectionCount: number
  platform: NodeJS.Platform
}

/** Explorer context menu. With several items, what only makes sense for one (create, rename, compare) is disabled. */
export function buildExplorerMenu(o: ExplorerMenuOptions): ChoiceEntry<ExplorerAction>[] {
  const m = t().files.contextMenu
  const titles = t().commands.titles
  const multi = o.selectionCount > 1
  const revealLabel =
    o.platform === 'darwin' ? m.revealFinder : o.platform === 'win32' ? m.revealExplorer : m.revealOther

  return [
    ...(o.isDir
      ? [
          { label: m.newFile, value: 'newFile' as const, enabled: !multi },
          { label: m.newFolder, value: 'newFolder' as const, enabled: !multi },
          { type: 'separator' as const }
        ]
      : []),
    { label: m.copy, value: 'copy' },
    { label: m.cut, value: 'cut' },
    { label: m.paste, value: 'paste', enabled: o.canPaste },
    { label: m.duplicate, value: 'duplicate' },
    { type: 'separator' },
    { label: m.rename, value: 'rename', enabled: !multi },
    { label: multi ? m.moveItemsToTrash(formatNumber(o.selectionCount)) : m.moveToTrash, value: 'delete' },
    { type: 'separator' },
    { label: m.copyPath, value: 'copyPath' },
    { label: m.copyRelativePath, value: 'copyRelativePath' },
    { label: revealLabel, value: 'reveal', enabled: !multi },
    ...(o.isDir
      ? []
      : [
          { type: 'separator' as const },
          { label: titles['editor.selectForCompare'], value: 'selectForCompare' as const, enabled: !multi },
          {
            label: titles['editor.compareWithSelected'],
            value: 'compareWithSelected' as const,
            enabled: o.canCompare && !multi
          }
        ])
  ]
}
