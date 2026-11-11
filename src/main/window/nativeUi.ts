// Native dialogs and menus repeated by the handlers. "No window" policy: a dialog requested on behalf of a view needs
// its window; if it is gone, nothing is shown and the result is "cancelled" (never a loose dialog on screen). Only a
// null `wc` (macOS without a window, e.g. Open Folder from the menu) shows the dialog without a parent window.

import {
  dialog,
  Menu,
  type BaseWindow,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type WebContents
} from 'electron'
import { t } from '@shared/i18n'
import { omitUndefined } from '@shared/omitUndefined'
import { windowOf } from './windows'

async function withParent<T>(wc: WebContents | null, show: (win?: BaseWindow) => Promise<T>): Promise<T | null> {
  if (wc === null) return show()
  const win = windowOf(wc)
  return win ? show(win) : null
}

/** Index of the chosen button, or `null` if no dialog was shown (no window). */
export async function showMessageBoxFor(wc: WebContents | null, options: MessageBoxOptions): Promise<number | null> {
  const result = await withParent(wc, (win) =>
    win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)
  )
  return result?.response ?? null
}

/** Chosen paths; `null` = cancelled or no window. */
export async function showOpenDialogFor(wc: WebContents | null, options: OpenDialogOptions): Promise<string[] | null> {
  const result = await withParent(wc, (win) =>
    win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
  )
  return !result || result.canceled || result.filePaths.length === 0 ? null : result.filePaths
}

/** Chosen path; `null` = cancelled or no window. */
export async function showSaveDialogFor(wc: WebContents | null, options: SaveDialogOptions): Promise<string | null> {
  const result = await withParent(wc, (win) =>
    win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
  )
  return !result || result.canceled || !result.filePath ? null : result.filePath
}

export interface ConfirmOptions {
  message: string
  detail?: string | undefined
  confirmLabel: string
  /** Default: "Cancel". */
  cancelLabel?: string
  /** `warning` (default) for a destructive action; `question` for neutral confirmations. */
  type?: 'warning' | 'question'
}

/** Confirm/Cancel where Enter and Esc cancel, so no risky action is accepted by accident. */
export async function confirmDestructive(wc: WebContents | null, options: ConfirmOptions): Promise<boolean> {
  const response = await showMessageBoxFor(wc, {
    type: options.type ?? 'warning',
    message: options.message,
    ...omitUndefined({ detail: options.detail }),
    buttons: [options.confirmLabel, options.cancelLabel ?? t().common.cancel],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })
  return response === 0
}

export interface PickFolderOptions {
  title?: string
  buttonLabel?: string
}

/** "Choose folder" dialog. `null` = cancelled (or the view no longer has a window). */
export async function pickFolder(wc: WebContents | null, opts: PickFolderOptions = {}): Promise<string | null> {
  const paths = await showOpenDialogFor(wc, { ...opts, properties: ['openDirectory', 'createDirectory'] })
  return paths?.[0] ?? null
}

type ChoiceItem<T> = Omit<MenuItemConstructorOptions, 'click' | 'type'> & { value: T }
export type ChoiceEntry<T> = ChoiceItem<T> | { type: 'separator' }

/** Context menu popup that resolves with the `value` of the clicked item, or `null` if closed without a choice. */
export function popupChoice<T>(wc: WebContents, items: ChoiceEntry<T>[]): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let chosen: T | null = null
    const template = items.map((entry): MenuItemConstructorOptions => {
      if (!('value' in entry)) return { type: 'separator' }
      const { value, ...rest } = entry
      return { ...rest, click: () => (chosen = value) }
    })
    // The `click` runs before the `callback` (menu close), so `chosen` is already set here.
    Menu.buildFromTemplate(template).popup({
      ...omitUndefined({ window: windowOf(wc) ?? undefined }),
      callback: () => resolve(chosen)
    })
  })
}
