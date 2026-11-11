import { describe, expect, it } from 'vitest'
import { asLiveId, liveClaudeApi, liveId } from './claudeIds'

describe('liveId', () => {
  it('rejects the dormant tab id', () => {
    expect(liveId('dormant:abc')).toBeNull()
  })

  it('accepts the main id as is', () => {
    expect(liveId('c1')).toBe('c1')
    expect(asLiveId('c2')).toBe('c2')
  })
})

describe('liveClaudeApi', () => {
  it('forwards each call to the current bridge, read only on use', () => {
    let calls = 0
    const bridge = { close: (id: string) => `closed ${id}` } as never
    const live = liveClaudeApi(() => {
      calls++
      return bridge
    })
    expect(calls).toBe(0)
    expect((live as unknown as { close(id: string): string }).close('c1')).toBe('closed c1')
    expect(calls).toBe(1)
  })
})
