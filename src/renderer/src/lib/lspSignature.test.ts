import { describe, expect, it } from 'vitest'
import type { LspSignatureHelp } from '@shared/types'
import { activeSignature, splitSignature } from './lspSignature'

const sig = {
  label: 'foo(a: string, b: number): void',
  parameters: [{ label: 'a: string' }, { label: 'b: number' }]
}

describe('splitSignature', () => {
  it('highlights the active parameter by text', () => {
    expect(splitSignature(sig, 1)).toEqual({ before: 'foo(a: string, ', active: 'b: number', after: '): void' })
  })

  it('highlights by range', () => {
    const s = {
      label: 'foo(a, b)',
      parameters: [{ label: [4, 5] as [number, number] }, { label: [7, 8] as [number, number] }]
    }
    expect(splitSignature(s, 0)).toEqual({ before: 'foo(', active: 'a', after: ', b)' })
  })

  it('without a valid parameter returns everything in before', () => {
    expect(splitSignature(sig, 5)).toEqual({ before: sig.label, active: '', after: '' })
    expect(splitSignature({ ...sig, parameters: [{ label: 'x' }] }, 0).active).toBe('')
    expect(splitSignature({ ...sig, parameters: [{ label: [90, 99] }] }, 0).active).toBe('')
  })
})

describe('activeSignature', () => {
  const help: LspSignatureHelp = {
    signatures: [sig, { ...sig, activeParameter: 0 }],
    activeSignature: 1,
    activeParameter: 1
  }

  it('the signature activeParameter wins over the help one', () => {
    expect(activeSignature(help)?.parameter).toBe(0)
    expect(activeSignature({ ...help, activeSignature: 0 })?.parameter).toBe(1)
  })

  it('a signature outside the list falls back to the first; an empty list is null', () => {
    expect(activeSignature({ ...help, activeSignature: 9 })?.signature).toBe(help.signatures[0])
    expect(activeSignature({ signatures: [], activeSignature: 0, activeParameter: 0 })).toBeNull()
  })
})
