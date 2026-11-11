// Claude box attachments: readable size, chips and what goes in the send.
import type { ClaudeAttachment, ClaudeAttachmentFile, ClaudeImage } from '@shared/types'

interface FileChip {
  kind: 'file'
  key: number
  path: string
  name: string
  size: number
}

export interface ImageChip {
  kind: 'image'
  key: number
  image: ClaudeImage
  name: string
  /** Bytes; 0 if unknown. */
  size: number
}

export type Chip = FileChip | ImageChip

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

let seq = 0

/** File validated by main → chip: an image becomes a thumbnail (`ClaudeImage`), the rest keeps the path. */
export function chipFromFile(file: ClaudeAttachmentFile): Chip {
  if (file.image) return { kind: 'image', key: ++seq, image: file.image, name: file.name, size: file.size }
  return { kind: 'file', key: ++seq, path: file.path, name: file.name, size: file.size }
}

export function imageChip(image: ClaudeImage, name: string, size: number): ImageChip {
  return { kind: 'image', key: ++seq, image, name, size }
}

/** Appends chips without repeating the same path. */
export function addChips(list: readonly Chip[], added: readonly Chip[]): Chip[] {
  const next = [...list]
  for (const chip of added) {
    if (chip.kind === 'file' && next.some((c) => c.kind === 'file' && c.path === chip.path)) continue
    next.push(chip)
  }
  return next
}

/** Files of the chips + mentions in the text, without repeating a whole file already cited. */
export function mergeAttachments(
  files: readonly ClaudeAttachment[],
  mentions: readonly ClaudeAttachment[]
): ClaudeAttachment[] {
  const out: ClaudeAttachment[] = [...mentions]
  for (const file of files) {
    if (out.some((a) => a.path === file.path && a.startLine === undefined)) continue
    out.push({ path: file.path })
  }
  return out
}
