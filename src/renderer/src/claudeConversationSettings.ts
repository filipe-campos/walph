// Conversation permission mode, model and effort: applied right away and undone if main refuses.
import type { ClaudeEffort, ClaudePermissionMode } from '@shared/types'
import { attempt } from './attempt'
import {
  bridge,
  failed,
  findConversation,
  liveConversationId,
  optimisticPatch,
  updateConversation
} from './claudeState'

export function setConversationMode(id: string, mode: ClaudePermissionMode): void {
  const before = findConversation(id)?.permissionMode
  if (!before || before === mode) return
  const undo = optimisticPatch(
    id,
    (c) => ({ ...c, permissionMode: mode }),
    (c) => c.permissionMode === mode,
    { permissionMode: before }
  )
  // Dormant: local state only (the resume uses the chosen mode).
  const live = liveConversationId(id)
  if (!live) return
  void attempt(() => bridge.setPermissionMode(live, mode), { format: failed, onError: undo })
}

export function setConversationModel(id: string, model: string): void {
  const conv = findConversation(id)
  if (!conv || conv.model === model) return
  const before = conv.model
  // An effort the new model does not accept goes back to its default.
  const efforts = conv.models.find((m) => m.value === model)?.efforts ?? []
  const beforeEffort = conv.effort
  const resetEffort = !conv.dormant && !!conv.effort && !efforts.includes(conv.effort)
  const undoModel = optimisticPatch(
    id,
    (c) => ({ ...c, model, effort: resetEffort ? null : c.effort }),
    (c) => c.model === model,
    { model: before }
  )
  const live = liveConversationId(id)
  if (!live) return
  // The CLI keeps the old effort when switching models: what the panel shows as "default" must hold there too.
  void attempt(
    async () => {
      await bridge.setModel(live, model)
      if (resetEffort) await bridge.setEffort(live, null)
    },
    {
      format: failed,
      onError: () => {
        undoModel()
        if (resetEffort) updateConversation(id, (c) => (c.effort === null ? { ...c, effort: beforeEffort } : c))
      }
    }
  )
}

/** `null` = auto: the model's default effort. */
export function setConversationEffort(id: string, effort: ClaudeEffort | null): void {
  const before = findConversation(id)?.effort ?? null
  const undo = optimisticPatch(
    id,
    (c) => ({ ...c, effort }),
    (c) => c.effort === effort,
    { effort: before }
  )
  const live = liveConversationId(id)
  if (!live) return
  void attempt(() => bridge.setEffort(live, effort), { format: failed, onError: undo })
}
