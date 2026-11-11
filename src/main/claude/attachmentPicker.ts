import { t } from '@shared/i18n'
import type { WebContents } from 'electron'
import type { ClaudeAttachmentResult } from '@shared/types'
import { confirmDestructive, showOpenDialogFor } from '../window/nativeUi'
import { getWindowRoot } from '../window/windows'
import { collectAttachments } from './attachments'
import { allowAttachment } from './registry'
import { UserError } from '../errors'

/** The paperclip: the dialog belongs to main, so what it picks is allowed for this view even outside the folder. */
export async function pickAttachments(wc: WebContents, root: string): Promise<ClaudeAttachmentResult> {
  const filePaths = await showOpenDialogFor(wc, {
    title: t().claudeHost.attachments.pickTitle,
    properties: ['openFile', 'multiSelections']
  })
  if (!filePaths) return { files: [], rejected: [] }
  // The folder may have changed while the dialog was open.
  if (getWindowRoot(wc) !== root) throw new UserError(t().claudeHost.attachments.folderChangedPick)
  return collectAttachments(
    root,
    filePaths,
    () => Promise.resolve(true),
    (path) => allowAttachment(wc, path)
  )
}

/** Drag and drop: inside the folder goes straight through; outside ones ask for ONE native confirmation. */
export function authorizeAttachments(wc: WebContents, root: string, paths: string[]): Promise<ClaudeAttachmentResult> {
  return collectAttachments(
    root,
    paths,
    async (outside) => {
      const texts = t().claudeHost.attachments
      return confirmDestructive(wc, {
        type: 'question',
        message: texts.outsideQuestion,
        detail: `${outside.slice(0, 10).join('\n')}${outside.length > 10 ? `\n${texts.outsideMore(outside.length - 10)}` : ''}\n\n${texts.outsideWarning}`,
        confirmLabel: texts.attach
      })
    },
    (path) => allowAttachment(wc, path)
  )
}
