import { describe, expect, it } from 'vitest'
import { extractCommandOutput, isCommandWrapperText, parseCompactMetadata } from './commandOutput'

describe('extractCommandOutput', () => {
  it('extracts stdout from a string', () => {
    expect(extractCommandOutput('<local-command-stdout>Total: 10k</local-command-stdout>')).toBe('Total: 10k')
  })
  it('reads text blocks, joins stdout and stderr and strips ANSI', () => {
    const out = extractCommandOutput([
      { type: 'text', text: '<local-command-stdout>\u001b[1mbold\u001b[0m</local-command-stdout>' },
      { type: 'text', text: '<local-command-stderr>failed</local-command-stderr>' }
    ])
    expect(out).toBe('bold\nfailed')
  })
  it('requires the anchored markup: a quote mid-text, a mismatched close or mixed blocks do not count', () => {
    expect(extractCommandOutput('see <local-command-stdout>x</local-command-stdout> ok')).toBeNull()
    expect(extractCommandOutput('<local-command-stdout>x</local-command-stderr>')).toBeNull()
    expect(
      extractCommandOutput([
        { type: 'text', text: '<local-command-stdout>x</local-command-stdout>' },
        { type: 'tool_result', tool_use_id: 't', content: 'y' }
      ])
    ).toBeNull()
  })
  it('cleans \\r and controls, keeping \\n and \\t', () => {
    expect(extractCommandOutput('<local-command-stdout>a\r\nb\rc\u0007\td\u0000</local-command-stdout>')).toBe(
      'a\nb\nc\td'
    )
  })
  it('null when there is no markup or the content is empty', () => {
    expect(extractCommandOutput('hi')).toBeNull()
    expect(extractCommandOutput('<local-command-stdout></local-command-stdout>')).toBeNull()
    expect(extractCommandOutput(undefined)).toBeNull()
  })
  it('truncates huge outputs', () => {
    const out = extractCommandOutput(`<local-command-stdout>${'a'.repeat(50_000)}</local-command-stdout>`)
    expect(out!.length).toBeLessThan(21_000)
    expect(out).toContain('truncada')
  })
})

describe('parseCompactMetadata', () => {
  it('validates trigger and pre_tokens', () => {
    expect(parseCompactMetadata({ trigger: 'manual', pre_tokens: 1234 })).toEqual({
      trigger: 'manual',
      preTokens: 1234
    })
    expect(parseCompactMetadata({ trigger: 'x', pre_tokens: -1 })).toEqual({ trigger: 'auto', preTokens: null })
    expect(parseCompactMetadata(null)).toEqual({ trigger: 'auto', preTokens: null })
  })
})

describe('isCommandWrapperText', () => {
  it('recognizes transcript command wrappers', () => {
    for (const t of [
      '<command-name>/cost</command-name>',
      '<command-message>x',
      '<command-args></command-args>',
      '<local-command-stdout>x'
    ]) {
      expect(isCommandWrapperText(t)).toBe(true)
    }
    expect(isCommandWrapperText('<commands> foo')).toBe(false)
    expect(isCommandWrapperText('hi')).toBe(false)
  })
})
