import { describe, expect, it } from 'vitest'
import { enabledModes, modeInfo, nextPermissionMode } from './claudeModes'

describe('nextPermissionMode', () => {
  it('cycles through the enabled modes, without Bypass permissions by default', () => {
    expect(nextPermissionMode('default')).toBe('acceptEdits')
    expect(nextPermissionMode('acceptEdits')).toBe('plan')
    expect(nextPermissionMode('plan')).toBe('auto')
    expect(nextPermissionMode('auto')).toBe('default')
  })
  it('includes Bypass permissions only with the setting', () => {
    expect(nextPermissionMode('auto', 1, true)).toBe('bypassPermissions')
    expect(nextPermissionMode('bypassPermissions', 1, true)).toBe('default')
    expect(nextPermissionMode('default', -1, true)).toBe('bypassPermissions')
  })
  it('goes back in the opposite direction', () => {
    expect(nextPermissionMode('default', -1)).toBe('auto')
    expect(nextPermissionMode('plan', -1)).toBe('acceptEdits')
  })
  it('a mode outside the list starts from the first', () => {
    expect(nextPermissionMode('bypassPermissions')).toBe('acceptEdits')
    expect(modeInfo('plan').label).toBe('Plan')
  })
})

describe('enabledModes', () => {
  it('hides bypass without the setting', () => {
    expect(enabledModes(false).map((m) => m.mode)).not.toContain('bypassPermissions')
    expect(enabledModes(true).map((m) => m.mode)).toContain('bypassPermissions')
  })
  it('acceptEdits and auto labels are distinct', () => {
    expect(modeInfo('acceptEdits').short).not.toBe(modeInfo('auto').short)
  })
})
