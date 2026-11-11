import { describe, expect, it } from 'vitest'
import { CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES, isClaudeEffort, isClaudePermissionMode } from './claudeModes'
import type { ClaudePermissionMode } from './settings'
import type { ClaudeEffort } from './types'

// The `Record` type requires every key: a new value in the type breaks compilation until it is added here and to
// the list.
const allModes: Record<ClaudePermissionMode, true> = {
  default: true,
  acceptEdits: true,
  plan: true,
  auto: true,
  bypassPermissions: true
}
const allEfforts: Record<ClaudeEffort, true> = { low: true, medium: true, high: true, xhigh: true, max: true }

describe('Claude mode and effort lists', () => {
  it('cover exactly the types', () => {
    expect([...CLAUDE_PERMISSION_MODES].sort()).toEqual(Object.keys(allModes).sort())
    expect([...CLAUDE_EFFORTS].sort()).toEqual(Object.keys(allEfforts).sort())
  })

  it('efforts go from lowest to highest', () => {
    expect(CLAUDE_EFFORTS).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })

  it.each(CLAUDE_PERMISSION_MODES)('isClaudePermissionMode accepts %s', (mode) => {
    expect(isClaudePermissionMode(mode)).toBe(true)
  })

  it.each([undefined, null, 3, '', 'dontAsk', 'Plan'])('isClaudePermissionMode rejects %s', (value) => {
    expect(isClaudePermissionMode(value)).toBe(false)
  })

  it.each(CLAUDE_EFFORTS)('isClaudeEffort accepts %s', (effort) => {
    expect(isClaudeEffort(effort)).toBe(true)
  })

  it.each([undefined, null, 3, '', 'ultra', 'HIGH'])('isClaudeEffort rejects %s', (value) => {
    expect(isClaudeEffort(value)).toBe(false)
  })
})
