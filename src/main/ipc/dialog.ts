import { t } from '@shared/i18n'
import type { UnsavedChoice } from '@shared/types'
import { parseConfirmOptions } from '../dialog/confirmOptions'
import { confirmDestructive, showMessageBoxFor } from '../window/nativeUi'
import { buildUnsavedMessage, parseFileNames } from '../dialog/unsavedMessage'
import { handle } from './typed'

const CHOICES: UnsavedChoice[] = ['save', 'dontSave', 'cancel']

export function registerDialogHandlers(): void {
  handle('dialog:confirmUnsaved', async (e, fileNames: unknown): Promise<UnsavedChoice> => {
    const names = parseFileNames(fileNames)
    if (!names) return 'cancel'
    const { message, detail } = buildUnsavedMessage(names)
    const response = await showMessageBoxFor(e.sender, {
      type: 'warning',
      message,
      detail,
      buttons: [t().common.save, t().common.dontSave, t().common.cancel],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    return (response === null ? undefined : CHOICES[response]) ?? 'cancel'
  })

  handle('dialog:confirm', async (e, options: unknown): Promise<boolean> => {
    const parsed = parseConfirmOptions(options)
    if (!parsed) return false
    return confirmDestructive(e.sender, {
      type: parsed.destructive ? 'warning' : 'question',
      message: parsed.message,
      detail: parsed.detail,
      confirmLabel: parsed.confirmLabel
    })
  })
}
