import type { LspApplyEditRequest, LspWorkspaceEdit } from '@shared/types'

export interface ApplyEditResult {
  applied: boolean
  failureReason?: string
}

interface ApplyEditBrokerOptions {
  timeoutMs: number
  emitRequest(request: LspApplyEditRequest): void
  /** Main gave up waiting for the answer to request `id`. */
  emitCancelled(id: number): void
}

interface Pending {
  resolve(result: ApplyEditResult): void
  timer: NodeJS.Timeout
}

/** Server `workspace/applyEdit`: the renderer applies, answers via `resolve`; no answer in time is `applied: false`. */
export class ApplyEditBroker {
  private seq = 0
  private readonly pending = new Map<number, Pending>()

  constructor(private readonly options: ApplyEditBrokerOptions) {}

  request(edit: LspWorkspaceEdit, label?: string): Promise<ApplyEditResult> {
    const id = ++this.seq
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ applied: false, failureReason: 'Walph did not respond in time.' })
        // The renderer may still be applying: tell it to abort before writing.
        this.options.emitCancelled(id)
      }, this.options.timeoutMs)
      this.pending.set(id, { resolve, timer })
      this.options.emitRequest({ id, ...(label !== undefined ? { label } : {}), edit })
    })
  }

  /** Unknown id (already expired) is ignored. */
  resolve(id: number, applied: boolean, failureReason?: string): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    clearTimeout(pending.timer)
    pending.resolve(applied ? { applied: true } : { applied: false, ...(failureReason ? { failureReason } : {}) })
  }

  /** Folder/window ended: everything that was waiting for an answer becomes "not applied". */
  dropAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ applied: false, failureReason: reason })
      this.pending.delete(id)
      this.options.emitCancelled(id)
    }
  }
}
