import { describe, expect, it } from 'vitest'
import { MAX_TOOL_RESULT_CHARS, truncateToolOutput } from './textLimits'

describe('truncateToolOutput', () => {
  it('keeps short output and truncates the long one with a notice', () => {
    expect(truncateToolOutput('ok')).toBe('ok')
    const out = truncateToolOutput('x'.repeat(MAX_TOOL_RESULT_CHARS + 50))
    expect(out.startsWith('x'.repeat(MAX_TOOL_RESULT_CHARS))).toBe(true)
    expect(out).toContain('50 caracteres omitidos')
  })
})
