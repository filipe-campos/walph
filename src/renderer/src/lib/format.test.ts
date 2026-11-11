import { describe, expect, it } from 'vitest'
import { formatBytes } from './format'

describe('format', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB')
    expect(formatBytes(7.7 * 1024 ** 3)).toBe('7,7 GB')
    expect(formatBytes(NaN)).toBe('0 B')
  })
})
