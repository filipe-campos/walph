import { describe, expect, it } from 'vitest'
import { LogBuffer } from './logBuffer'

describe('LogBuffer', () => {
  it('keeps the lines in order and returns a copy', () => {
    const log = new LogBuffer()
    const entry = log.push('ts', 'info', 'started')
    expect(entry).toMatchObject({ server: 'ts', level: 'info', message: 'started' })
    const snapshot = log.snapshot()
    snapshot.push(entry)
    expect(log.snapshot()).toHaveLength(1)
  })

  it('drops the oldest beyond the limit', () => {
    const log = new LogBuffer()
    for (let i = 0; i < 2005; i++) log.push('ts', 'info', `line ${i}`)
    const lines = log.snapshot()
    expect(lines).toHaveLength(2000)
    expect(lines[0].message).toBe('line 5')
    expect(lines.at(-1)?.message).toBe('line 2004')
  })
})
