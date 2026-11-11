import { describe, expect, it } from 'vitest'
import type { ClaudeModelOption } from '@shared/types'
import { currentModelOption, modelChipName } from './claudeModelName'

const opt = (o: Partial<ClaudeModelOption> & { value: string }): ClaudeModelOption => ({
  displayName: o.value,
  description: '',
  efforts: [],
  ...o
})

describe('modelChipName', () => {
  it('shows the model family behind "Default (recommended)"', () => {
    const def = opt({ value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5 · Most capable' })
    expect(modelChipName('default', def)).toBe('Opus')
    expect(modelChipName('default', { ...def, resolvedModel: 'claude-sonnet-5-5' })).toBe('Sonnet')
  })
  it('reads the family from the full init id', () => {
    expect(modelChipName('claude-opus-5-5[1m]', undefined)).toBe('Opus')
    expect(modelChipName('claude-haiku-5-5', opt({ value: 'haiku' }))).toBe('Haiku')
  })
  it('uses the display name without parentheses when it does not recognize the family', () => {
    expect(modelChipName('x', opt({ value: 'x', displayName: 'Experimental (beta)' }))).toBe('Experimental')
    expect(modelChipName('', undefined)).toBe('Padrão')
  })
})

describe('currentModelOption', () => {
  it('matches by alias or by the resolved id', () => {
    const models = [opt({ value: 'opus', resolvedModel: 'claude-opus-5-5' }), opt({ value: 'sonnet' })]
    expect(currentModelOption('sonnet', models)?.value).toBe('sonnet')
    expect(currentModelOption('claude-opus-5-5', models)?.value).toBe('opus')
    expect(currentModelOption('claude-x', models)).toBeUndefined()
  })
  it('falls back to the family when init brings an id that no option lists', () => {
    const def = opt({ value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5 · Most capable' })
    const models = [def, opt({ value: 'sonnet', displayName: 'Sonnet' })]
    expect(currentModelOption('claude-opus-5-5[1m]', models)?.value).toBe('default')
    expect(currentModelOption('claude-sonnet-5-5', models)?.value).toBe('sonnet')
    expect(
      currentModelOption('claude-opus-5-5[1m]', [opt({ value: 'opus', resolvedModel: 'claude-opus-5-5' })])?.value
    ).toBe('opus')
  })
})
