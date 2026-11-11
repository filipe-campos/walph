import { t } from '@shared/i18n'
import type { ClaudeError } from '@shared/types'
import type { Run } from './run'

/** Interrupting without the turn ending within this deadline = the CLI hung (e.g. a stuck tool): we end the process. */
const INTERRUPT_DEADLINE_MS = 8000

interface InterruptHooks {
  isWorking(): boolean
  /** The conversation's current process. */
  current(): Run | null
  /** The turn did not end within the deadline: the conversation fails. */
  stuck(error: ClaudeError): void
}

/** "Stop" the turn in progress: counts the interrupted `result`s and watches the CLI deadline. */
export class Interrupts {
  /** The user interrupted the turn in progress: its `result` counts as neither failure nor completion. */
  private pendingResults = 0
  /** The current turn's interruption was already counted (several `interrupt()` calls count as one). */
  private marked = false
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly hooks: InterruptHooks) {}

  /** An interrupted turn's `result` is yet to arrive. */
  get hasPending(): boolean {
    return this.pendingResults > 0
  }

  async request(run: Run): Promise<void> {
    clearTimeout(this.timer)
    if (this.hooks.isWorking() && !this.marked) {
      this.marked = true
      this.pendingResults++
    }
    // Without a turn in progress there is nothing to wait for: the deadline only applies while working.
    if (this.hooks.isWorking()) {
      this.timer = setTimeout(() => {
        if (run === this.hooks.current() && this.hooks.isWorking()) {
          this.hooks.stuck({ code: 'process', message: t().claudeHost.conversation.interruptTimeout })
        }
      }, INTERRUPT_DEADLINE_MS)
    }
    try {
      await run.query.interrupt()
    } catch {
      // The deadline above ends the process if the turn does not finish.
    }
  }

  /** The turn ended (or the conversation is about to start another): releases the deadline. */
  clearTimer(): void {
    clearTimeout(this.timer)
  }

  /**
   * A turn's `result` arrived. That of an interrupted turn comes later (even after a new `send`): hence a counter.
   */
  turnEnded(): void {
    clearTimeout(this.timer)
    if (this.pendingResults > 0) this.pendingResults--
    this.marked = false
  }
}
