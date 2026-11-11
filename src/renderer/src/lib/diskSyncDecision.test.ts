import { describe, expect, it } from 'vitest'
import { decideDiskSync } from './diskSyncDecision'

describe('decideDiskSync', () => {
  it('a tab never loaded in the editor: nothing to do', () => {
    expect(decideDiskSync(null, false)).toBe('skip')
    expect(decideDiskSync(null, true)).toBe('skip')
  })

  it('disk equal to the base: dirty only clears the conflict, clean adopts the disk format', () => {
    expect(decideDiskSync(true, true)).toBe('clear-conflict')
    expect(decideDiskSync(true, false)).toBe('adopt-format')
  })

  it('disk different from the base: dirty becomes a conflict, clean reloads', () => {
    expect(decideDiskSync(false, true)).toBe('mark-conflict')
    expect(decideDiskSync(false, false)).toBe('reload')
  })
})
