// Prompt box drafts per conversation and the history of sent messages (↑). Kept out of the action modules so the store
// can save them in the workspace session without a circular import.

export interface Draft {
  text: string
  history: string[]
}

const drafts = new Map<string, Draft>()
/** History of sent messages (↑): applies to the whole folder, not just the conversation. */
let sentHistory: string[] = []
let onChange: () => void = () => {}

/** Whoever saves the session wants to know when a draft changes (the store registers `scheduleSessionSave`). */
export function setDraftListener(listener: () => void): void {
  onChange = listener
}

export function getDraft(id: string): Draft {
  return drafts.get(id) ?? { text: '', history: sentHistory }
}

export function draftText(id: string): string {
  return drafts.get(id)?.text ?? ''
}

export function saveDraftText(id: string, text: string): void {
  const before = drafts.get(id)?.text ?? ''
  drafts.set(id, { text, history: sentHistory })
  if (text !== before) onChange()
}

export function deleteDraft(id: string): void {
  if (drafts.delete(id)) onChange()
}

/** The draft follows the conversation when its id changes (tab reopened by `resume`). */
export function moveDraft(from: string, to: string): void {
  const draft = drafts.get(from)
  if (!draft) return
  drafts.delete(from)
  drafts.set(to, draft)
}

export function getSentHistory(): string[] {
  return sentHistory
}

export function setSentHistory(history: string[]): void {
  sentHistory = history
}

export function forgetDrafts(): void {
  drafts.clear()
  sentHistory = []
}
