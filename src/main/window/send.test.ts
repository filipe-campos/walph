import { describe, expect, it, vi } from 'vitest'
import { send } from './send'

function typeChecks(): void {
  // @ts-expect-error payload with the wrong type
  send(null as never, 'terminal:exit', 'id', 'zero')
  // @ts-expect-error missing argument
  send(null as never, 'terminal:exit', 'id')
  send(null as never, 'terminal:exit', 'id', 0)
}

describe('send', () => {
  it('compiles (the expected errors are in the @ts-expect-error)', () => {
    expect(typeof typeChecks).toBe('function')
  })

  it('delivers the payload to the live view', () => {
    const wc = { isDestroyed: () => false, send: vi.fn() }
    send(wc as never, 'terminal:exit', 'id', 0)
    expect(wc.send).toHaveBeenCalledWith('terminal:exit', 'id', 0)
  })

  it('ignores a destroyed view instead of throwing', () => {
    const wc = {
      isDestroyed: () => true,
      send: vi.fn(() => {
        throw new Error('Object has been destroyed')
      })
    }
    expect(() => send(wc as never, 'terminal:exit', 'id', 0)).not.toThrow()
    expect(wc.send).not.toHaveBeenCalled()
  })
})
