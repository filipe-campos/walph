/** A server with no open document shuts down after this. */
export const LSP_NO_DOCS_MS = 2 * 60_000
/** A workspace hidden for this long shuts down all its servers (the documents stay in the mirror). */
export const LSP_INACTIVE_MS = 10 * 60_000

export interface IdleHooks {
  /** Open documents that server `id` handles now. */
  docCount(id: string): number
  /** Shuts down only the server process; the document mirror stays. */
  stopServer(id: string): void
  /** Shuts down every server of the inactive view. */
  hibernate(): void
}

/**
 * Idle policy of a view's servers. Knows neither processes nor Electron: only timers. Reopening is lazy and belongs
 * to the manager (any request/open/change, or the view becoming active again).
 */
export class IdleController {
  private active = true
  private readonly noDocs = new Map<string, NodeJS.Timeout>()
  private inactiveTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly hooks: IdleHooks,
    private readonly opts: { noDocsMs?: number; inactiveMs?: number } = {}
  ) {}

  get isActive(): boolean {
    return this.active
  }

  /** The document set of server `id` may have changed: arms or cancels the "no documents" deadline. */
  serverTouched(id: string): void {
    const previous = this.noDocs.get(id)
    if (previous) clearTimeout(previous)
    this.noDocs.delete(id)
    if (this.hooks.docCount(id) > 0) return
    const timer = setTimeout(() => {
      this.noDocs.delete(id)
      // Recheck: a document may have arrived without going through `serverTouched`.
      if (this.hooks.docCount(id) === 0) this.hooks.stopServer(id)
    }, this.opts.noDocsMs ?? LSP_NO_DOCS_MS)
    this.noDocs.set(id, timer)
  }

  /** The view became (or stopped being) the window's active one. */
  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    if (active) this.clearInactive()
    else this.armInactive()
  }

  /** There was use (request, open, change) while the view is hidden: the deadline restarts. */
  used(): void {
    if (!this.active) this.armInactive()
  }

  dispose(): void {
    this.clearInactive()
    for (const t of this.noDocs.values()) clearTimeout(t)
    this.noDocs.clear()
  }

  private armInactive(): void {
    this.clearInactive()
    this.inactiveTimer = setTimeout(() => {
      this.inactiveTimer = null
      this.hooks.hibernate()
    }, this.opts.inactiveMs ?? LSP_INACTIVE_MS)
  }

  private clearInactive(): void {
    if (this.inactiveTimer) clearTimeout(this.inactiveTimer)
    this.inactiveTimer = null
  }
}
