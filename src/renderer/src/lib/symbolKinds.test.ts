import { describe, expect, it } from 'vitest'
import { completionKindName, iconForSymbolKind, iconForType, symbolKindName } from './symbolKinds'

describe('symbolKinds', () => {
  it('maps CompletionItemKind to the kind name', () => {
    expect(completionKindName(2)).toBe('method')
    expect(completionKindName(5)).toBe('field')
    expect(completionKindName(20)).toBe('enum-member')
    expect(completionKindName(25)).toBe('type-parameter')
  })

  it('uses text for a missing or unknown kind', () => {
    expect(completionKindName(undefined)).toBe('text')
    expect(completionKindName(0)).toBe('text')
    expect(completionKindName(99)).toBe('text')
  })

  it('maps SymbolKind to the kind name', () => {
    expect(symbolKindName(5)).toBe('class')
    expect(symbolKindName(12)).toBe('function')
    expect(symbolKindName(26)).toBe('type-parameter')
    expect(symbolKindName(99)).toBe('')
  })

  it('returns the codicon and the color group', () => {
    expect(iconForType('method')).toEqual({ icon: 'codicon-symbol-method', group: 'function' })
    expect(iconForType('class').group).toBe('type')
    expect(iconForType('variable').group).toBe('variable')
    expect(iconForSymbolKind(11)).toEqual({ icon: 'codicon-symbol-interface', group: 'type' })
  })

  it('understands the CodeMirror kinds and falls back to a neutral icon', () => {
    expect(iconForType('type').icon).toBe('codicon-symbol-class')
    expect(iconForType('keyword').icon).toBe('codicon-symbol-keyword')
    expect(iconForType(undefined).icon).toBe('codicon-symbol-misc')
    expect(iconForType('nothing').icon).toBe('codicon-symbol-misc')
  })
})
