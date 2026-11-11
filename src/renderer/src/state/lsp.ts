import type { LspState } from '../types/lsp'

export function scopedLspState(): LspState {
  return { diagnostics: {}, lspStatuses: [], references: null, hierarchy: null }
}
