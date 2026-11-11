import { describe, expect, it } from 'vitest'
import type { ClaudeModelOption } from '@shared/types'
import { currentModelOption, family, isModelId } from './claudeModel'

const opt = (value: string, extra: Partial<ClaudeModelOption> = {}): ClaudeModelOption => ({
  value,
  displayName: value,
  description: '',
  efforts: [],
  ...extra
})

describe('family', () => {
  it.each([
    ['claude-opus-4-1', 'Opus'],
    ['claude-sonnet-4-5[1m]', 'Sonnet'],
    ['CLAUDE-HAIKU-3', 'Haiku'],
    ['Opus 4 (1M context)', 'Opus'],
    ['Uses the SONNET model', 'Sonnet']
  ])('%s -> %s', (text, expected) => expect(family(text)).toBe(expected))

  it('returns null without a recognizable family or without text', () => {
    expect(family('gpt-4')).toBeNull()
    expect(family('')).toBeNull()
    expect(family(undefined)).toBeNull()
    expect(family('claude-opusx')).toBe('Opus')
    expect(family('megaopus')).toBeNull()
  })
})

describe('currentModelOption', () => {
  const models = [
    opt('default', { resolvedModel: 'claude-opus-4-1', displayName: 'Default (Opus)' }),
    opt('sonnet', { resolvedModel: 'claude-sonnet-4-5' }),
    opt('haiku')
  ]

  it('without a model list returns undefined', () => {
    expect(currentModelOption('opus', undefined)).toBeUndefined()
  })

  it('matches by alias (value)', () => {
    expect(currentModelOption('sonnet', models)?.value).toBe('sonnet')
  })

  it('an empty model only matches an option with an empty value', () => {
    expect(currentModelOption('', models)).toBeUndefined()
    const withEmpty = [...models, opt('')]
    expect(currentModelOption('', withEmpty)?.value).toBe('')
  })

  it('matches by the full resolved id', () => {
    expect(currentModelOption('claude-sonnet-4-5', models)?.value).toBe('sonnet')
  })

  it('ignores the [1m] suffix of the id coming from init', () => {
    expect(currentModelOption('claude-sonnet-4-5[1m]', models)?.value).toBe('sonnet')
    expect(currentModelOption('claude-opus-4-1[1m]', models)?.value).toBe('default')
  })

  it('falls back to the family: option whose value equals the family', () => {
    expect(currentModelOption('claude-haiku-9', models)?.value).toBe('haiku')
  })

  it('falls back to the family deduced from resolvedModel/displayName/description', () => {
    const list = [opt('x', { displayName: 'Opus custom' })]
    expect(currentModelOption('claude-opus-9', list)?.value).toBe('x')
    const byDescription = [opt('y', { description: 'Most capable Sonnet' })]
    expect(currentModelOption('claude-sonnet-9', byDescription)?.value).toBe('y')
  })

  it('the "default" model does not fall back to the family and only matches by value', () => {
    expect(currentModelOption('default', models)?.value).toBe('default')
    expect(currentModelOption('default', [opt('sonnet')])).toBeUndefined()
  })

  it('an unknown id without a family returns undefined', () => {
    expect(currentModelOption('gpt-4', models)).toBeUndefined()
  })
})

describe('isModelId', () => {
  it.each([
    'opus',
    'default',
    'claude-opus-4-1',
    'claude-opus-4-1[1m]',
    'us.anthropic.claude-x:0',
    'a/b',
    'claude-sonnet-4@20250514',
    'us.anthropic.claude-sonnet-4-20250514-v1:0',
    'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-20250514-v1:0'
  ])('accepts %s', (id) => expect(isModelId(id)).toBe(true))
  it.each(['', ' opus', 'a b', '-m', '.x', 'a,b', 'a;b', '@x', 'a@ b', 'a\nb', 'a'.repeat(201), 42, null, undefined])(
    'rejects %j',
    (id) => expect(isModelId(id)).toBe(false)
  )
  it('accepts 200 characters', () => expect(isModelId('a'.repeat(200))).toBe(true))
})
