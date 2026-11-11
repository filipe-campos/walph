import { randomUUID } from 'node:crypto'
import { t } from '@shared/i18n'
import type { ClaudeConversationStatus, ClaudeMessage, ClaudePromptInput } from '@shared/types'
import { loadAttachments } from '../attachments'
import type { PathCheck } from '../../fs/pathAllowlist'
import { buildUserContent } from '../buildPrompt'
import { ConversationError } from '../conversationError'
import { contextOfTexts } from '../ideContext'
import { normalizeContent } from '../normalizeMessage'
import type { Run, RunManager } from './run'
import { UserError } from '../../errors'

/** What sending a prompt needs from the conversation that owns it. */
export interface SendHost {
  readonly runs: Pick<RunManager, 'open' | 'current'>
  getRoot(): string | null
  verifyAttachment(path: string): Promise<PathCheck>
  isClosed(): boolean
  isRewinding(): boolean
  status(): ClaudeConversationStatus
  /** While dormant, the CLI starts now (with `resume`). */
  ensureRun(): Promise<Run>
  beginBusy(): void
  endBusy(): void
  /** A new turn started: the previous interrupt's deadline no longer applies. */
  clearInterruptTimer(): void
  emitMessage(message: ClaudeMessage): void
  /** The first prompt gives the session its automatic title. */
  firstPrompt(text: string): void
  setWorking(): void
}

export function sendPrompt(host: SendHost, input: ClaudePromptInput): Promise<string> {
  const root = host.getRoot()
  if (!host.runs.open || !root) return Promise.reject(new ConversationError('closed'))
  // Synchronous rejection (no `await`): the send ack keeps its order and the renderer shows the error like any other.
  if (host.isRewinding()) return Promise.reject(new UserError(t().claudeHost.conversation.rewinding))
  const before = host.runs.current
  host.beginBusy()
  // Returns the `sendNow` promise directly (no `await`/`finally` in the way): the send ack reaches the renderer
  // before the events the CLI emits next, as it did before idle sleep.
  const sent = sendNow(host, root, before, input)
  void sent.catch(() => undefined).finally(() => host.endBusy())
  return sent
}

async function sendNow(host: SendHost, root: string, before: Run | null, input: ClaudePromptInput): Promise<string> {
  const loaded = await loadAttachments(root, input.attachments, host.verifyAttachment)
  // The conversation may have closed or restarted (rewind) during the wait. With the CLI alive it waits for nothing but
  // the attachments (each extra `await` delays the ack relative to the events).
  const run = host.runs.current ?? (await host.ensureRun())
  if (host.isClosed() || host.runs.current !== run || (before && before !== run))
    throw new UserError(t().claudeHost.conversation.closedOrRestarted)
  // Freshly launched process: the turn only starts with the MCPs connected. After that there is no `await` here.
  if (!run.mcp.settled) {
    await run.mcp.ready
    if (host.isClosed() || host.runs.current !== run) throw new UserError(t().claudeHost.conversation.closedOrRestarted)
  }
  // A rewind started while this send waited for attachments/MCP: the turn would run over files being restored.
  if (host.isRewinding()) throw new UserError(t().claudeHost.conversation.rewinding)
  host.clearInterruptTimer()
  const blocks = buildUserContent(input, loaded)
  const uuid = randomUUID()
  const wasBusy = host.status() === 'working'

  // What the user sees in the list: what they typed and the images (the attachments and context go only to Claude).
  let shown = normalizeContent(
    blocks.filter((b) => b.type === 'image' || b.text === input.text),
    'user'
  )
  // Message with attachments only: shows what was cited instead of an empty bubble.
  if (shown.length === 0) shown = [{ type: 'text', text: loaded.map((a) => `@${a.path}`).join(' ') }]
  const context = contextOfTexts(blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])))
  host.emitMessage({
    uuid,
    role: 'user',
    blocks: shown,
    parentToolUseId: null,
    checkpoint: true,
    timestamp: Date.now(),
    ...(context ? { context } : {})
  })
  host.firstPrompt(input.text)
  host.setWorking()
  run.input.push({
    type: 'user',
    message: { role: 'user', content: blocks },
    parent_tool_use_id: null,
    uuid,
    ...(wasBusy ? { priority: 'later' as const } : {})
  })
  return uuid
}
