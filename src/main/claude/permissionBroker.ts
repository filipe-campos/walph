// Permission requests of a conversation: the SDK `canUseTool` and `onElicitation` become a card in the panel, and the
// renderer's answer (`respond`) goes back to Claude. Also here: the edit diff, the plan text and the IDE `openDiff`.

import { t } from '@shared/i18n'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CanUseTool, OnElicitation, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { validateElicitationContent } from '@shared/elicitation'
import { omitUndefined } from '@shared/omitUndefined'
import type {
  ClaudeEvent,
  ClaudePermissionMode,
  ClaudePermissionRequest,
  ClaudePermissionResponse
} from '@shared/types'
import { resolveInsideRoot } from '../fs/paths'
import { declinedNotice, declinedUrlNotice, normalizeElicitation } from './elicitation'
import {
  allowRulesOf,
  canAllowInWorkspace,
  retargetToSession,
  saveWorkspaceRules as writeWorkspaceRules
} from './localPermissions'
import { isResponseValidFor } from './permissionResponse'
import { EDIT_TOOLS, editTargetPath, proposeEdit } from './proposeEdit'
import { SKIP_MESSAGE, buildAnswerInput, normalizeQuestions } from './question'
import { readTextDetailedOrNull, readTextOrNull, writeTextAtomic } from './safePath'
import type { SessionInput } from './sessionStatus'

const MAX_EDIT_FILE_BYTES = 2 * 1024 * 1024
const MAX_OPEN_DIFF_CHARS = 5 * 1024 * 1024

/** What the broker needs from the conversation that owns it. */
export interface PermissionHost {
  readonly id: string
  emit(event: ClaudeEvent): void
  isClosed(): boolean
  getRoot(): string | null
  /** The CLI plans folder (`~/.claude/plans`); the default is computed from the home. */
  plansDir(): string | undefined
  openExternal(url: string): Promise<void>
  /** Feeds the session status (request open/answered). */
  applySession(input: SessionInput): void
  /** A request opened: the conversation does not sleep while waiting for the answer. */
  holdIdle(): void
  /** A request closed: the idle deadline applies again. */
  refreshIdle(): void
  /** The approved plan chose the run's mode. */
  adoptPermissionMode(mode: ClaudePermissionMode): void
}

interface Pending {
  request: ClaudePermissionRequest
  resolve(response: ClaudePermissionResponse | null): void
}

/** Content equality ignoring line endings (`null` = file does not exist). */
function sameText(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n')
}

export class PermissionBroker {
  private readonly pending = new Map<string, Pending>()

  constructor(private readonly host: PermissionHost) {}

  get pendingCount(): number {
    return this.pending.size
  }

  /** `false` = answer refused (the request stays pending); `true` = accepted or the request no longer exists. */
  respond(requestId: string, response: ClaudePermissionResponse): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) return true
    // The renderer decides from the return value whether it keeps or restores the card.
    if (!isResponseValidFor(entry.request, response)) return false
    this.pending.delete(requestId)
    entry.resolve(response)
    return true
  }

  cancelAllPending(): void {
    for (const [requestId, entry] of [...this.pending]) {
      this.pending.delete(requestId)
      this.host.emit({ type: 'permissionCancelled', id: this.host.id, requestId })
      entry.resolve(null)
    }
  }

  /** Emits the request and waits for the renderer's answer; `null` = cancelled (interrupted, closed, aborted). */
  private ask(request: ClaudePermissionRequest, signal?: AbortSignal): Promise<ClaudePermissionResponse | null> {
    return new Promise((resolve) => {
      const requestId = request.requestId
      const onAbort = (): void => {
        const entry = this.pending.get(requestId)
        if (!entry) return
        this.pending.delete(requestId)
        this.host.emit({ type: 'permissionCancelled', id: this.host.id, requestId })
        entry.resolve(null)
      }
      this.pending.set(requestId, {
        request,
        resolve: (response) => {
          signal?.removeEventListener('abort', onAbort)
          this.host.applySession({ type: 'permissionDone', requestId })
          resolve(response)
          this.host.refreshIdle()
        }
      })
      this.host.holdIdle()
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      this.host.emit({ type: 'permission', id: this.host.id, request })
      this.host.applySession({ type: 'permission', requestId, question: request.kind === 'question' })
    })
  }

  /** Request from an MCP server: a card in the panel (form) or opening a page (URL). Unsupported ones are declined. */
  readonly onElicitation: OnElicitation = async (request, { signal }) => {
    if (this.host.isClosed()) return { action: 'cancel' }
    const normalized = normalizeElicitation(request)
    if (!normalized.ok) {
      const notice = request.mode === 'url' ? declinedUrlNotice(request.serverName) : declinedNotice(request.serverName)
      this.host.emit({ type: 'notice', id: this.host.id, message: notice })
      return { action: 'decline' }
    }
    const asked = { ...normalized.request, requestId: randomUUID() }
    const response = await this.ask(asked, signal)
    if (!response || response.behavior !== 'elicitation' || response.action === 'cancel') return { action: 'cancel' }
    if (response.action === 'decline') return { action: 'decline' }
    if (asked.mode === 'url') {
      try {
        // The URL was already validated (`http(s)`) by `normalizeElicitation`; main opens it, never the renderer.
        if (asked.url) await this.host.openExternal(asked.url)
      } catch {
        // Accepting without the page having opened would leave the server waiting for a login nobody will do.
        this.host.emit({
          type: 'notice',
          id: this.host.id,
          message: t().claudeHost.permissions.openBrowserFailed(asked.serverName)
        })
        return { action: 'cancel' }
      }
      return { action: 'accept' }
    }
    const checked = validateElicitationContent(asked.fields, response.content)
    return checked.ok ? { action: 'accept', content: checked.content } : { action: 'decline' }
  }

  readonly canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
    if (this.host.isClosed()) return { behavior: 'deny', message: 'The conversation was closed.', interrupt: true }
    const requestId = randomUUID()
    const cancelled: PermissionResult = {
      behavior: 'deny',
      message: 'The request was cancelled by the user.',
      interrupt: true
    }
    const deny = (response: ClaudePermissionResponse, what: string): PermissionResult => {
      const comment = response.behavior === 'deny' ? response.message?.trim() : undefined
      return {
        behavior: 'deny',
        message: comment ? `The user rejected ${what}. User comment: ${comment}` : `The user rejected ${what}.`
      }
    }

    // A question to the user does not depend on the permission mode: it applies even in bypass. A `permissions.allow`
    // rule and an `allow` hook without `updatedInput` do NOT skip this path: in the CLI (2.1.302)
    // `AskUserQuestion.requiresUserInteraction()` is true and becomes `ask` before rules/mode (only a hook with
    // `updatedInput` waives it, and a hook is repo code).
    if (toolName === 'AskUserQuestion') {
      const normalized = normalizeQuestions(input)
      if (!normalized.ok) {
        return {
          behavior: 'deny',
          message: `Invalid AskUserQuestion input: ${normalized.error} Fix it or ask in plain text.`
        }
      }
      const response = await this.ask({ kind: 'question', requestId, questions: normalized.questions }, options.signal)
      if (!response) return cancelled
      if (response.behavior === 'answer') {
        const built = buildAnswerInput(input, normalized.questions, response.answers)
        if (built.ok) return { behavior: 'allow', updatedInput: built.updatedInput }
      }
      return { behavior: 'deny', message: SKIP_MESSAGE }
    }

    const plan = toolName === 'ExitPlanMode' ? await this.planText(input) : null
    if (plan !== null) {
      const response = await this.ask({ kind: 'plan', requestId, plan }, options.signal)
      if (!response) return cancelled
      if (response.behavior !== 'allow') return deny(response, 'the plan')
      const mode = response.mode ?? 'default'
      this.host.adoptPermissionMode(mode)
      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: [{ type: 'setMode', mode, destination: 'session' }]
      }
    }

    if (EDIT_TOOLS.has(toolName)) {
      const edit = await this.editRequest(requestId, toolName, input)
      if (edit) {
        const response = await this.ask(edit, options.signal)
        if (!response) return cancelled
        return response.behavior === 'allow' ? { behavior: 'allow', updatedInput: input } : deny(response, 'this edit')
      }
    }

    const response = await this.ask(
      {
        kind: 'tool',
        requestId,
        toolName,
        title: options.title ?? t().claudeHost.conversation.toolTitle(toolName),
        ...omitUndefined({ description: options.description }),
        input,
        canAlwaysAllow: !options.suppressAlwaysAllowRule && (options.suggestions?.length ?? 0) > 0,
        canAllowInWorkspace: canAllowInWorkspace(options.suggestions, options.suppressAlwaysAllowRule)
      },
      options.signal
    )
    if (!response) return cancelled
    if (response.behavior !== 'allow') return deny(response, 'this tool call')
    const suggestions = options.suggestions ?? []
    if (options.suppressAlwaysAllowRule || suggestions.length === 0 || !response.always) {
      return { behavior: 'allow', updatedInput: input }
    }
    if (response.always === 'workspace') {
      // No `allow` rule to save: falls back to "this call only" (the renderer does not offer the button then).
      if (!canAllowInWorkspace(suggestions, false)) return { behavior: 'allow', updatedInput: input }
      await this.saveWorkspaceRules(allowRulesOf(suggestions))
    }
    // "Always allow" applies only to the session: the CLI must not write the rule to a file on its own (the
    // suggestions usually come with `localSettings`), so everything goes with the `session` destination.
    return { behavior: 'allow', updatedInput: input, updatedPermissions: retargetToSession(suggestions) }
  }

  /**
   * Saves the rules via `saveWorkspaceRules` (`localPermissions.ts`). Does not throw: the call stays allowed for the
   * session (the user already decided) and the failure becomes a `notice` event explaining that the rule was not saved,
   * without going through the session status (it is not a conversation failure).
   */
  private async saveWorkspaceRules(rules: string[]): Promise<void> {
    try {
      await writeWorkspaceRules(() => this.host.getRoot(), rules)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      this.host.emit({
        type: 'notice',
        id: this.host.id,
        message: t().claudeHost.permissions.saveRuleFailed(reason.replace(/\.$/, ''))
      })
    }
  }

  /** Plan text: `input.plan`, or the `planFilePath` file if it is under the CLI plans folder. */
  private async planText(input: Record<string, unknown>): Promise<string | null> {
    if (typeof input.plan === 'string') return input.plan
    if (typeof input.planFilePath !== 'string') return null
    try {
      const dir = this.host.plansDir() ?? join(homedir(), '.claude', 'plans')
      const path = await resolveInsideRoot(dir, input.planFilePath)
      return await readTextOrNull(path, MAX_EDIT_FILE_BYTES)
    } catch {
      return null
    }
  }

  /** `edit` request for Edit/MultiEdit/Write; `null` (generic card instead) if the diff cannot be computed. */
  private async editRequest(
    requestId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<ClaudePermissionRequest | null> {
    const root = this.host.getRoot()
    const target = editTargetPath(input)
    if (!root || !target) return null
    try {
      const path = await resolveInsideRoot(root, target)
      const file = await readTextDetailedOrNull(path, MAX_EDIT_FILE_BYTES)
      // UTF-16: we cannot guarantee the CLI writes the same as the diff shows; generic card.
      if (file && (file.encoding === 'utf16le' || file.encoding === 'utf16be')) return null
      const original = file?.text ?? null
      const proposal = proposeEdit(toolName, { ...input, file_path: path }, original)
      if (!proposal.ok) return null
      return {
        kind: 'edit',
        requestId,
        toolName,
        path,
        original: original ?? '',
        proposed: proposal.proposed,
        isNewFile: original === null
      }
    } catch {
      return null
    }
  }

  /**
   * IDE `openDiff`: the user reviews the diff and, if they accept, main writes it (without overwriting what changed on
   * disk).
   */
  async openDiff(
    filePath: string,
    newContents: string
  ): Promise<{ accepted: boolean; message?: string; changed?: boolean }> {
    const root = this.host.getRoot()
    if (!root) throw new Error('No folder is open in the IDE.')
    if (newContents.length > MAX_OPEN_DIFF_CHARS) throw new Error('Content too large for the diff.')
    const path = await resolveInsideRoot(root, filePath)
    const file = await readTextDetailedOrNull(path, MAX_EDIT_FILE_BYTES)
    const original = file?.text ?? null
    const response = await this.ask({
      kind: 'edit',
      requestId: randomUUID(),
      toolName: 'openDiff',
      path,
      original: original ?? '',
      proposed: newContents,
      isNewFile: original === null
    })
    if (!response || response.behavior === 'deny') {
      return {
        accepted: false,
        ...omitUndefined({ message: response?.behavior === 'deny' ? response.message?.trim() : 'cancelled' })
      }
    }
    // The disk may have changed while the user reviewed the diff: does not overwrite work they did not see.
    const current = await readTextDetailedOrNull(path, MAX_EDIT_FILE_BYTES)
    if (!sameText(current?.text ?? null, original)) return { accepted: false, changed: true }
    // Keeps the file's encoding as it is now (BOM/UTF-16); a new file = UTF-8.
    await writeTextAtomic(root, path, newContents, current?.encoding)
    return { accepted: true }
  }
}
