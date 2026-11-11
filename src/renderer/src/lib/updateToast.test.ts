import { describe, expect, it, vi } from 'vitest'
import { updateToast, UPDATE_TOAST_KEY } from './updateToast'

const install = vi.fn()

describe('updateToast', () => {
  it('progress does not expire and stays dismissible (no bar)', () => {
    for (const kind of ['checking', 'downloading'] as const) {
      const t = updateToast({ kind, message: 'x' }, { install })
      expect(t.key).toBe(UPDATE_TOAST_KEY)
      expect(t.duration).toBeUndefined()
      expect(t.progress).toBeUndefined()
    }
  })
  it('upToDate and error expire', () => {
    expect(updateToast({ kind: 'upToDate', message: 'x' }, { install }).duration).toBe(4000)
    const e = updateToast({ kind: 'error', message: 'x' }, { install })
    expect(e.tone).toBe('error')
    expect(e.duration).toBe(8000)
  })
  it('downloaded offers to restart and stays until dismissed', () => {
    const t = updateToast({ kind: 'downloaded', message: 'x', version: '1.2.3' }, { install })
    expect(t.duration).toBeUndefined()
    expect(t.description).toContain('reinicia')
    t.actions?.[0].onClick()
    expect(install).toHaveBeenCalled()
  })
})
