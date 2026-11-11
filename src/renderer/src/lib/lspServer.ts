// Finds which language server handles a file, by the extensions main reports in `LspServerStatus`.
import type { LspServerStatus } from '@shared/types'
import { basename } from './path'

/** Lowercase extension, with a dot (`.ts`); empty if the file has none (`Makefile`, `.gitignore`). */
export function fileExtension(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

export function serverForPath(statuses: LspServerStatus[], path: string | undefined | null): LspServerStatus | null {
  if (!path) return null
  const ext = fileExtension(path)
  if (!ext) return null
  return statuses.find((s) => s.extensions.includes(ext)) ?? null
}
