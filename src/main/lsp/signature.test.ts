import { describe, expect, it } from 'vitest'
import { normalizeSignatureHelp } from './signature'

describe('normalizeSignatureHelp', () => {
  it('normalizes signatures, parameters by text and by offset', () => {
    const help = normalizeSignatureHelp({
      signatures: [
        {
          label: 'f(a: number, b: string)',
          documentation: 'doc',
          parameters: [{ label: [2, 11] }, { label: 'b: string', documentation: { kind: 'markdown', value: '*b*' } }]
        }
      ],
      activeSignature: 0,
      activeParameter: 1
    })
    expect(help).toEqual({
      signatures: [
        {
          label: 'f(a: number, b: string)',
          documentation: { kind: 'plaintext', value: 'doc' },
          parameters: [{ label: [2, 11] }, { label: 'b: string', documentation: { kind: 'markdown', value: '*b*' } }]
        }
      ],
      activeSignature: 0,
      activeParameter: 1
    })
  })

  it('an offset outside the label becomes empty without changing the indices', () => {
    const help = normalizeSignatureHelp({
      signatures: [{ label: 'f(a)', parameters: [{ label: [2, 99] }, { label: 'a' }] }]
    })!
    expect(help.signatures[0].parameters.map((p) => p.label)).toEqual(['', 'a'])
  })

  it('an out-of-range activeSignature falls back to 0; the signature activeParameter is kept', () => {
    const help = normalizeSignatureHelp({
      signatures: [{ label: 'a()', activeParameter: 2 }],
      activeSignature: 4,
      activeParameter: -1
    })!
    expect(help.activeSignature).toBe(0)
    expect(help.activeParameter).toBe(0)
    expect(help.signatures[0].activeParameter).toBe(2)
  })

  it('without valid signatures it is null', () => {
    expect(normalizeSignatureHelp({ signatures: [] })).toBeNull()
    expect(normalizeSignatureHelp({ signatures: [{ label: 3 }] })).toBeNull()
    expect(normalizeSignatureHelp(null)).toBeNull()
  })
})
