// Bridge between commands/actions (outside React) and the mounted prompt boxes: insert text and focus without going
// through the store. Each conversation has its own box (mounted and hidden); the request waits for the active
// conversation's box to exist.
import { get } from './store'

export interface PromptHandle {
  focus(): void
  /** Inserts at the cursor (or at the end). */
  insert(text: string): void
  /** Replaces the whole text (e.g. returning the message of a checkpoint). */
  setText(text: string): void
  hasFocus(): boolean
}

const handles = new Map<string, PromptHandle>()
let pending: { insert: string[]; focus: boolean } | null = null

function activeHandle(): PromptHandle | undefined {
  const id = get().claude.activeId
  return id ? handles.get(id) : undefined
}

function flushPending(): void {
  const handle = activeHandle()
  if (!handle || !pending) return
  const { insert, focus } = pending
  pending = null
  for (const text of insert) handle.insert(text)
  if (focus) handle.focus()
}

/** Registers a conversation's box; returns the unregister function. */
export function registerPrompt(id: string, handle: PromptHandle): () => void {
  handles.set(id, handle)
  flushPending()
  return () => {
    if (handles.get(id) === handle) handles.delete(id)
  }
}

/** Focuses the active conversation's box (waits for it to exist if the conversation is still opening). */
export function focusPrompt(): void {
  const handle = activeHandle()
  if (handle) return handle.focus()
  pending = { insert: pending?.insert ?? [], focus: true }
}

/** Inserts text into the active conversation's box and focuses it. */
export function insertIntoPrompt(text: string): void {
  const handle = activeHandle()
  if (handle) {
    handle.insert(text)
    handle.focus()
    return
  }
  pending = { insert: [...(pending?.insert ?? []), text], focus: true }
}

/** Replaces the text of conversation `id`'s box. */
export function setPromptText(id: string, text: string): void {
  handles.get(id)?.setText(text)
}

/** Returns a text to conversation `id`'s box (without focus), if it is mounted: a message that could not be sent. */
export function restorePromptText(id: string, text: string): void {
  handles.get(id)?.insert(text)
}

/** Is the focus in the active conversation's prompt box? (⌘Esc toggles between it and the editor.) */
export function promptHasFocus(): boolean {
  return activeHandle()?.hasFocus() ?? false
}

/** Discards requests that were waiting for a box (e.g. the folder changed). */
export function resetPromptRequests(): void {
  pending = null
}
