import { describe, expect, it } from 'vitest'
import { createSoundGate } from './soundGate'

describe('createSoundGate', () => {
  it('plays the first and ignores those arriving within the interval', () => {
    const gate = createSoundGate(1000)
    expect(gate.allow(5000)).toBe(true)
    expect(gate.allow(5200)).toBe(false)
    expect(gate.allow(5999)).toBe(false)
    expect(gate.allow(6000)).toBe(true)
  })

  it('a refused request does not extend the interval', () => {
    const gate = createSoundGate(1000)
    gate.allow(0)
    gate.allow(900)
    expect(gate.allow(1000)).toBe(true)
  })
})
