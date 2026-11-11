import { randomUUID } from 'node:crypto'
import { t } from '@shared/i18n'
import type { ClaudeError, ClaudeMessage } from '@shared/types'
import { classifyFailure } from '../errors'
import type { Sdk } from '../sdk'
import type { ConversationData } from './data'
import type { Run } from './run'
import { UserError } from '../../errors'

interface RewindScope {
  code: boolean
  conversation: boolean
}

interface RewindResult {
  filesChanged: string[]
  messages?: ClaudeMessage[]
}

/** What the checkpoints need from the conversation that owns them. */
interface CheckpointHost {
  getRoot(): string | null
  loadSdk(): Promise<Sdk>
  /** Displayed session title (base of the copy's title). */
  title(): string
  isWorking(): boolean
  /** Throws `closed` if the conversation no longer accepts actions. */
  assertOpen(): void
  beginBusy(): void
  endBusy(): void
  ensureRun(): Promise<Run>
  /**
   * The process steps aside so the conversation is reread from the chosen point: cancels requests and waits for it to
   * exit.
   */
  discardRun(run: Run): Promise<void>
  relaunch(resumeAt: string | undefined, fresh: boolean): Promise<void>
  fail(error: ClaudeError): void
  /** The rewind to the start created another session: the owner copies the Walph metadata. */
  sessionIdChanged(from: string, to: string): void
}

/** Rewind (files and/or conversation) and fork of the session. */
export class Checkpoints {
  /**
   * Rewind in progress: the CLI is about to be replaced, so another `rewind` (two launches = an orphan CLI) or a `send`
   * (accepted by a process about to die) are refused until it finishes.
   */
  private rewinding: Promise<unknown> | null = null

  constructor(
    private readonly host: CheckpointHost,
    private readonly data: ConversationData
  ) {}

  get isRewinding(): boolean {
    return this.rewinding !== null
  }

  /**
   * Duplicates the session (the SDK `forkSession`) and returns the new `sessionId`; the renderer opens it with
   * `start({ resume })`. The copy's title is "<title> (copy)" (passed to the SDK so `claude --resume` shows the same).
   */
  async fork(): Promise<string> {
    const root = this.host.getRoot()
    if (!root) throw new UserError(t().claudeHost.conversation.openFolder)
    if (this.data.transcript.length === 0) throw new UserError(t().claudeHost.conversation.nothingToFork)
    if (!this.data.persisted) throw new UserError(t().claudeHost.conversation.forkAfterFirstReply)
    const sdk = await this.host.loadSdk()
    const base = this.host.title().slice(0, 190)
    try {
      const { sessionId } = await sdk.forkSession(this.data.sessionId, {
        dir: root,
        title: t().claudeHost.conversation.copyTitle(base)
      })
      return sessionId
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        throw new UserError(t().claudeHost.conversation.nothingToFork, { cause: err })
      }
      throw new UserError(t().claudeHost.conversation.forkFailed(text.replace(/\.$/, '')), { cause: err })
    }
  }

  async rewind(messageUuid: string, what: RewindScope): Promise<RewindResult> {
    this.host.assertOpen()
    if (this.rewinding) throw new UserError(t().claudeHost.conversation.rewinding)
    this.host.beginBusy()
    const done = this.rewindNow(messageUuid, what)
    this.rewinding = done
    try {
      return await done
    } finally {
      this.rewinding = null
      this.host.endBusy()
    }
  }

  private async rewindNow(messageUuid: string, what: RewindScope): Promise<RewindResult> {
    const data = this.data
    const index = data.transcript.findIndex((m) => m.uuid === messageUuid && m.role === 'user' && m.checkpoint)
    if (index === -1) throw new UserError(t().claudeHost.conversation.noCheckpoint)
    if (!what.code && !what.conversation) return { filesChanged: [] }
    // A turn in progress would be trampled by the restore.
    if (this.host.isWorking()) throw new UserError(t().claudeHost.conversation.interruptBeforeRewind)
    // While dormant, the CLI starts first: it is the one that restores the files and rereads the session.
    const run = await this.host.ensureRun()

    let filesChanged: string[] = []
    if (what.code) {
      const result = await run.query.rewindFiles(messageUuid)
      if (!result.canRewind) throw new UserError(t().claudeHost.conversation.rewindFilesFailed)
      filesChanged = result.filesChanged ?? []
    }
    if (!what.conversation) return { filesChanged }

    const kept = data.transcript.slice(0, index)
    const before = kept[kept.length - 1]
    await this.host.discardRun(run)
    data.transcript = kept
    data.hadResult = false
    data.resumeAtOnWake = before?.uuid
    if (!before) {
      const from = data.sessionId
      data.sessionId = randomUUID()
      data.persisted = false
      // The new process's `init` carries the new `sessionId` to the renderer.
      this.host.sessionIdChanged(from, data.sessionId)
    }
    try {
      await this.host.relaunch(before?.uuid, !before)
    } catch (err) {
      // Without a process the conversation is useless: it closes for good instead of becoming a zombie.
      this.host.fail(classifyFailure(err))
      throw err
    }
    return { filesChanged, messages: [...kept] }
  }
}
