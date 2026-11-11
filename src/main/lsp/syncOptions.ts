import { isRecord } from '@shared/guards'

/** How the server wants to receive the documents (`capabilities.textDocumentSync` of `initialize`). */
export interface SyncOptions {
  openClose: boolean
  /** 0 = nothing, 1 = full text on every change, 2 = incremental. */
  change: 0 | 1 | 2
  save: boolean
  /** `didSave` with the whole text. */
  includeText: boolean
}

/** Without the capability we assume the common case: open/close, incremental, `didSave` without text. */
const DEFAULTS: SyncOptions = { openClose: true, change: 2, save: true, includeText: false }

export function parseSyncOptions(sync: unknown): SyncOptions {
  if (typeof sync === 'number') {
    const change = sync === 1 || sync === 2 ? sync : 0
    // The numeric form does not announce `save`: the server only asked for the sync kind.
    return { openClose: true, change, save: false, includeText: false }
  }
  if (sync && typeof sync === 'object') {
    const s = sync as { openClose?: unknown; change?: unknown; save?: unknown }
    const change = s.change === 1 || s.change === 2 ? s.change : 0
    const save = s.save
    return {
      openClose: s.openClose === true,
      change,
      save: save === true || isRecord(save),
      includeText: isRecord(save) && save.includeText === true
    }
  }
  return DEFAULTS
}
