export interface IdleHooks {
  /** Idle time before sleeping (ms); 0 turns it off. */
  idleMs(): number
  /**
   * Process alive, stopped and without a pending request, background task or MCP login; the policy adds what it knows.
   */
  parked(): boolean
  /** The session exists on disk: only then does `resume` work on relaunch. */
  persisted(): boolean
  /** The deadline expired: puts the conversation to sleep. */
  sleep(): void
}

/**
 * Idle policy of a conversation: when the CLI process may sleep. It knows neither processes nor the SDK: only the
 * timer, the actions in progress (`send`, `rewind`, MCP) and the schedules the `Stop` hook reports.
 */
export class IdlePolicy {
  private timer: NodeJS.Timeout | undefined
  private busyOps = 0
  private scheduledWork = false
  private crons = false

  constructor(private readonly hooks: IdleHooks) {}

  /** The CLI has work that wakes it on its own (`/loop`, CronCreate, ScheduleWakeup, background task). */
  get scheduled(): boolean {
    return this.scheduledWork
  }

  /** The part of `scheduled` that is a schedule (`/loop`, cron): tells the automatic turn marker apart. */
  get hasCrons(): boolean {
    return this.crons
  }

  /** `Stop` hook of the last turn: sleeping would kill the process and, with it, the schedule. */
  noteStop(hasCrons: boolean, hasBackgroundTasks: boolean): void {
    this.crons = hasCrons
    this.scheduledWork = hasCrons || hasBackgroundTasks
    this.update()
  }

  /** The schedules died with the previous process; the next `Stop` says what the new one has. */
  resetSchedule(): void {
    this.scheduledWork = false
    this.crons = false
  }

  /** A long action in progress: the conversation does not sleep in the middle of it. */
  begin(): void {
    this.busyOps++
    this.hold()
  }

  end(): void {
    this.busyOps--
    this.update()
  }

  /** Suspends the deadline without rearming it (open request, restart). */
  hold(): void {
    clearTimeout(this.timer)
  }

  dispose(): void {
    clearTimeout(this.timer)
  }

  isQuiescent(): boolean {
    return this.hooks.parked() && !this.scheduledWork && this.busyOps === 0
  }

  canSleep(): boolean {
    return this.hooks.persisted() && this.isQuiescent()
  }

  /** (Re)arms the idle deadline: only applies with the conversation really stopped. */
  update(): void {
    clearTimeout(this.timer)
    const ms = this.hooks.idleMs()
    if (ms <= 0 || !this.canSleep()) return
    this.timer = setTimeout(() => this.hooks.sleep(), ms)
    this.timer.unref()
  }
}
