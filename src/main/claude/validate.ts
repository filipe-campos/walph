// Validation of the renderer messages (untrusted) for the `claude` API. Returns the typed value or throws.

import { isFiniteNumber, isRecord } from '@shared/guards'
import { t, type Messages } from '@shared/i18n'
import { isModelId } from '@shared/claudeModel'
import { isClaudeEffort, isClaudePermissionMode } from '@shared/claudeModes'
import { FORBIDDEN_KEYS } from '@shared/elicitation'
import { UserError } from '../errors'
import { MAX_FIELDS } from './elicitation'
import { MAX_ANSWER_LENGTH } from './question'
import type {
  ClaudeAttachment,
  ClaudeEditorContext,
  ClaudeEffort,
  ClaudeElicitationValue,
  ClaudeImage,
  ClaudePermissionResponse,
  ClaudePromptInput,
  ClaudeSelection,
  ClaudeStartOptions
} from '@shared/types'

const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

const MAX_ELICIT_TEXT = 100_000
const MAX_ELICIT_ITEMS = 100
const MAX_ELICIT_ITEM = 200

const MAX_PROMPT_CHARS = 400_000
const MAX_SELECTION_TEXT = 200_000
const MAX_OPEN_FILES = 500
const MAX_PATH = 4096
const MAX_ANSWER_KEYS = 16
const MAX_ANSWER_VALUES = 16

type Part = keyof Messages['claudeHost']['request']['parts']

const bad = (what: Part): never => {
  const request = t().claudeHost.request
  throw new UserError(request.invalid(request.parts[what]))
}
const str = (v: unknown, what: Part, max = MAX_PATH): string =>
  typeof v === 'string' && v.length <= max ? v : bad(what)
const path = (v: unknown, what: Part): string => (str(v, what) === '' ? bad(what) : (v as string))
const line = (v: unknown, what: Part): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v < 1e9 ? v : bad(what)

export const isPermissionMode = isClaudePermissionMode
const isEffort = isClaudeEffort

/** `null` = "auto" (the model's default effort). */
export function parseEffortOrNull(v: unknown): ClaudeEffort | null {
  if (v === null) return null
  return isEffort(v) ? v : bad('effort')
}

const MAX_DROPPED_PATHS = 200

/** Dragged file paths (`authorizeAttachments`): list of strings; the excess over the send limit is handled later. */
export function parseAttachmentPaths(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > MAX_DROPPED_PATHS) return bad('attachments')
  return v.map((p: unknown) => str(p, 'attachment'))
}

/** Session id accepted by the CLI (`resume`). */
export const isSessionId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(v)

/** Model switched mid-conversation (`setModel`): alias, `default` or full id. */
export function parseModel(v: unknown): string {
  if (!isModelId(v)) throw new UserError(t().claudeHost.conversation.invalidModel)
  return v
}

/** Background task id (`stopTask`); the conversation checks it against the current list. */
export function parseTaskId(v: unknown): string {
  return typeof v === 'string' && v !== '' && v.length <= 200 ? v : bad('task')
}

export function parseStartOptions(v: unknown): ClaudeStartOptions {
  if (v === undefined || v === null) return {}
  if (!isRecord(v)) return bad('options')
  const out: ClaudeStartOptions = {}
  if (v.resume !== undefined) {
    out.resume = isSessionId(v.resume) ? v.resume : bad('session')
  }
  if (v.model !== undefined) {
    out.model = isModelId(v.model) ? v.model : bad('model')
  }
  if (v.permissionMode !== undefined)
    out.permissionMode = isPermissionMode(v.permissionMode) ? v.permissionMode : bad('mode')
  if (v.effort !== undefined) out.effort = isEffort(v.effort) ? v.effort : bad('effort')
  return out
}

function parseSelection(v: unknown): ClaudeSelection | null {
  if (v === null || v === undefined) return null
  if (!isRecord(v)) return bad('selection')
  const startLine = line(v.startLine, 'selection')
  const endLine = line(v.endLine, 'selection')
  return { path: path(v.path, 'selection'), startLine, endLine, text: str(v.text, 'selection', MAX_SELECTION_TEXT) }
}

export function parsePromptInput(v: unknown): ClaudePromptInput {
  if (!isRecord(v)) return bad('message')
  if (!Array.isArray(v.attachments) || !Array.isArray(v.images)) return bad('attachments')
  const attachments: ClaudeAttachment[] = v.attachments.map((a: unknown) => {
    if (!isRecord(a)) return bad('attachment')
    const out: ClaudeAttachment = { path: path(a.path, 'attachment') }
    if (a.startLine !== undefined) out.startLine = line(a.startLine, 'attachment')
    if (a.endLine !== undefined) out.endLine = line(a.endLine, 'attachment')
    return out
  })
  const images: ClaudeImage[] = v.images.map((i: unknown) => {
    if (!isRecord(i) || typeof i.mediaType !== 'string' || !IMAGE_TYPES.includes(i.mediaType)) return bad('image')
    return { mediaType: i.mediaType as ClaudeImage['mediaType'], data: str(i.data, 'image', Number.MAX_SAFE_INTEGER) }
  })
  return {
    text: str(v.text, 'text', MAX_PROMPT_CHARS),
    attachments,
    images,
    activeFile: v.activeFile === null || v.activeFile === undefined ? null : path(v.activeFile, 'activeFile'),
    selection: parseSelection(v.selection)
  }
}

export function parseResponse(v: unknown): ClaudePermissionResponse {
  if (!isRecord(v)) return bad('response')
  if (v.behavior === 'deny') {
    return { behavior: 'deny', ...(typeof v.message === 'string' ? { message: v.message.slice(0, 4000) } : {}) }
  }
  if (v.behavior === 'allow') {
    const out: ClaudePermissionResponse = { behavior: 'allow' }
    if (v.always === true || v.always === 'workspace') out.always = v.always
    if (v.mode === 'default' || v.mode === 'acceptEdits') out.mode = v.mode
    return out
  }
  if (v.behavior === 'skip') return { behavior: 'skip' }
  if (v.behavior === 'answer') {
    // Only the shape here; `buildAnswerInput` (claude/question.ts) checks it against the request questions.
    if (!isRecord(v.answers)) return bad('answers')
    const entries = Object.entries(v.answers)
    if (entries.length > MAX_ANSWER_KEYS) return bad('answers')
    const answers: Record<string, string[]> = {}
    for (const [key, values] of entries) {
      if (key.length > 100 || !Array.isArray(values) || values.length > MAX_ANSWER_VALUES) return bad('answers')
      answers[key] = values.map((value: unknown) => str(value, 'answers', MAX_ANSWER_LENGTH))
    }
    return { behavior: 'answer', answers }
  }
  if (v.behavior === 'elicitation') {
    if (v.action !== 'accept' && v.action !== 'decline' && v.action !== 'cancel') return bad('response')
    if (v.content === undefined) return { behavior: 'elicitation', action: v.action }
    // Only the shape (flat and bounded); `validateElicitationContent` checks it against the request fields.
    if (!isRecord(v.content)) return bad('response')
    const entries = Object.entries(v.content)
    if (entries.length > MAX_FIELDS) return bad('response')
    const content: Record<string, ClaudeElicitationValue> = {}
    for (const [key, value] of entries) {
      if (key.length > 100 || FORBIDDEN_KEYS.includes(key)) return bad('response')
      if (typeof value === 'string') content[key] = str(value, 'response', MAX_ELICIT_TEXT)
      else if (isFiniteNumber(value)) content[key] = value
      else if (typeof value === 'boolean') content[key] = value
      else if (Array.isArray(value) && value.length <= MAX_ELICIT_ITEMS)
        content[key] = value.map((item: unknown) => str(item, 'response', MAX_ELICIT_ITEM))
      else return bad('response')
    }
    return { behavior: 'elicitation', action: v.action, content }
  }
  return bad('response')
}

export function parseEditorContext(v: unknown): ClaudeEditorContext {
  if (!isRecord(v) || !Array.isArray(v.openFiles)) return bad('editorContext')
  return {
    activeFile: v.activeFile === null || v.activeFile === undefined ? null : path(v.activeFile, 'activeFile'),
    selection: parseSelection(v.selection),
    openFiles: v.openFiles.slice(0, MAX_OPEN_FILES).map((f: unknown) => {
      if (!isRecord(f)) return bad('tab')
      return { path: path(f.path, 'tab'), dirty: f.dirty === true }
    })
  }
}

export function parseRewind(v: unknown): { code: boolean; conversation: boolean } {
  if (!isRecord(v) || typeof v.code !== 'boolean' || typeof v.conversation !== 'boolean') return bad('checkpoint')
  return { code: v.code, conversation: v.conversation }
}
