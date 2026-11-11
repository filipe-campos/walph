// Single source of Claude's permission and effort mode lists: conversation, validation and session use these lists
// and the guards instead of repeating the literals. `claudeModes.test.ts` checks that they cover the whole types.

import type { ClaudePermissionMode } from './settings'
import type { ClaudeEffort } from './types'

/** The modes the panel offers (the SDK's `dontAsk` is left out). */
export const CLAUDE_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'bypassPermissions'
] as const satisfies readonly ClaudePermissionMode[]

/** From lowest to highest effort. */
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly ClaudeEffort[]

export const isClaudePermissionMode = (v: unknown): v is ClaudePermissionMode =>
  typeof v === 'string' && (CLAUDE_PERMISSION_MODES as readonly string[]).includes(v)

export const isClaudeEffort = (v: unknown): v is ClaudeEffort =>
  typeof v === 'string' && (CLAUDE_EFFORTS as readonly string[]).includes(v)
