import { imageMimeType } from '@shared/imageTypes'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

/** Size limit of a Markdown preview image (becomes base64 in memory in the renderer). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** Validates type and size; returns the MIME or throws with a message for the user. */
export function assertReadableImage(path: string, info: { isFile: boolean; size: number }): string {
  const mime = imageMimeType(path)
  if (!mime) throw new UserError(t().files.errors.imageUnsupported)
  if (!info.isFile) throw new UserError(t().files.errors.notAFile)
  if (info.size > MAX_IMAGE_BYTES) throw new UserError(t().files.errors.imageTooLarge)
  return mime
}

export function toDataUrl(mime: string, data: Buffer): string {
  return `data:${mime};base64,${data.toString('base64')}`
}
