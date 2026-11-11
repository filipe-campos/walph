import { describe, expect, it } from 'vitest'
import {
  parseAttachmentPaths,
  parseEditorContext,
  parseEffortOrNull,
  parseModel,
  parseTaskId,
  parsePromptInput,
  parseResponse,
  parseRewind,
  parseStartOptions
} from './validate'

const prompt = { text: 'hi', attachments: [], images: [], activeFile: null, selection: null }

describe('parseStartOptions', () => {
  it('accepts empty and valid options', () => {
    expect(parseStartOptions(undefined)).toEqual({})
    expect(parseStartOptions({ resume: 'abc-123', model: 'opus', permissionMode: 'plan', effort: 'high' })).toEqual({
      resume: 'abc-123',
      model: 'opus',
      permissionMode: 'plan',
      effort: 'high'
    })
  })
  it('rejects values outside the contract', () => {
    expect(() => parseStartOptions({ resume: '../x' })).toThrow('inválido')
    expect(() => parseStartOptions({ model: 'a b' })).toThrow()
    expect(() => parseStartOptions({ permissionMode: 'dontAsk' })).toThrow()
    expect(() => parseStartOptions({ effort: 'ultra' })).toThrow()
    expect(() => parseStartOptions('x')).toThrow()
  })
})

describe('parsePromptInput', () => {
  it('accepts the full shape', () => {
    const input = parsePromptInput({
      ...prompt,
      attachments: [{ path: '/p/a.ts', startLine: 1, endLine: 5 }],
      images: [{ mediaType: 'image/png', data: 'AAAA' }],
      activeFile: '/p/a.ts',
      selection: { path: '/p/a.ts', startLine: 2, endLine: 3, text: 'x' }
    })
    expect(input.attachments[0]).toEqual({ path: '/p/a.ts', startLine: 1, endLine: 5 })
    expect(input.selection?.startLine).toBe(2)
  })
  it('rejects garbage', () => {
    expect(() => parsePromptInput(null)).toThrow()
    expect(() => parsePromptInput({ ...prompt, text: 1 })).toThrow()
    expect(() => parsePromptInput({ ...prompt, attachments: [{ path: '' }] })).toThrow()
    expect(() => parsePromptInput({ ...prompt, attachments: [{ path: '/a', startLine: 0 }] })).toThrow()
    expect(() => parsePromptInput({ ...prompt, images: [{ mediaType: 'image/svg+xml', data: 'x' }] })).toThrow()
    expect(() => parsePromptInput({ ...prompt, selection: { path: '/a', startLine: 1, endLine: 1 } })).toThrow()
    expect(() => parsePromptInput({ text: 'x' })).toThrow()
  })
})

describe('parseResponse - elicitation', () => {
  it('accepts actions and flat content', () => {
    expect(parseResponse({ behavior: 'elicitation', action: 'decline' })).toEqual({
      behavior: 'elicitation',
      action: 'decline'
    })
    const content = { a: 'x', n: 2, b: false, l: ['p', 'q'] }
    expect(parseResponse({ behavior: 'elicitation', action: 'accept', content })).toEqual({
      behavior: 'elicitation',
      action: 'accept',
      content
    })
  })

  it('rejects invalid action, shape and limits', () => {
    const bad = (v: unknown) => expect(() => parseResponse(v)).toThrow('inválido')
    bad({ behavior: 'elicitation', action: 'perhaps' })
    bad({ behavior: 'elicitation' })
    bad({ behavior: 'elicitation', action: 'accept', content: 'x' })
    bad({ behavior: 'elicitation', action: 'accept', content: { a: null } })
    bad({ behavior: 'elicitation', action: 'accept', content: { a: { b: 1 } } })
    bad({ behavior: 'elicitation', action: 'accept', content: { a: NaN } })
    bad({ behavior: 'elicitation', action: 'accept', content: { a: 'x'.repeat(100_001) } })
    bad({ behavior: 'elicitation', action: 'accept', content: { a: Array(101).fill('x') } })
    bad({ behavior: 'elicitation', action: 'accept', content: { a: ['x'.repeat(201)] } })
    bad({ behavior: 'elicitation', action: 'accept', content: { a: [1] } })
    bad({
      behavior: 'elicitation',
      action: 'accept',
      content: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']))
    })
    bad({ behavior: 'elicitation', action: 'accept', content: JSON.parse('{"__proto__":"x"}') })
  })
})

describe('parseResponse', () => {
  it('allow/deny', () => {
    expect(parseResponse({ behavior: 'allow', always: true, mode: 'acceptEdits' })).toEqual({
      behavior: 'allow',
      always: true,
      mode: 'acceptEdits'
    })
    expect(parseResponse({ behavior: 'allow', mode: 'plan' })).toEqual({ behavior: 'allow' })
    expect(parseResponse({ behavior: 'allow', always: 'workspace' })).toEqual({
      behavior: 'allow',
      always: 'workspace'
    })
    expect(parseResponse({ behavior: 'allow', always: 'user' })).toEqual({ behavior: 'allow' })
    expect(parseResponse({ behavior: 'deny', message: 'no' })).toEqual({ behavior: 'deny', message: 'no' })
    expect(() => parseResponse({ behavior: 'maybe' })).toThrow()
  })
  it('answer/skip of the questions', () => {
    expect(parseResponse({ behavior: 'skip', extra: 1 })).toEqual({ behavior: 'skip' })
    expect(parseResponse({ behavior: 'answer', answers: { q1: ['A'], q2: ['B', 'free text'] } })).toEqual({
      behavior: 'answer',
      answers: { q1: ['A'], q2: ['B', 'free text'] }
    })
    expect(() => parseResponse({ behavior: 'answer' })).toThrow()
    expect(() => parseResponse({ behavior: 'answer', answers: { q1: 'A' } })).toThrow()
    expect(() => parseResponse({ behavior: 'answer', answers: { q1: [1] } })).toThrow()
    expect(() => parseResponse({ behavior: 'answer', answers: { q1: ['x'.repeat(5000)] } })).toThrow()
  })
})

describe('parseEditorContext / parseRewind', () => {
  it('validates context and checkpoint', () => {
    expect(parseEditorContext({ activeFile: null, selection: null, openFiles: [{ path: '/a', dirty: 1 }] })).toEqual({
      activeFile: null,
      selection: null,
      openFiles: [{ path: '/a', dirty: false }]
    })
    expect(() => parseEditorContext({ activeFile: null })).toThrow()
    expect(parseRewind({ code: true, conversation: false })).toEqual({ code: true, conversation: false })
    expect(() => parseRewind({ code: 1 })).toThrow()
  })
})

describe('permission modes and effort', () => {
  it('accepts auto and bypassPermissions as a mode (main decides the bypass)', () => {
    expect(parseStartOptions({ permissionMode: 'auto' })).toEqual({ permissionMode: 'auto' })
    expect(parseStartOptions({ permissionMode: 'bypassPermissions' })).toEqual({ permissionMode: 'bypassPermissions' })
  })
  it('effort accepts null (auto) and rejects the rest', () => {
    expect(parseEffortOrNull(null)).toBeNull()
    expect(parseEffortOrNull('xhigh')).toBe('xhigh')
    expect(() => parseEffortOrNull(undefined)).toThrow('inválido')
    expect(() => parseEffortOrNull('ultra')).toThrow('inválido')
  })
  it('dragged paths: list of strings, with a cap', () => {
    expect(parseAttachmentPaths(['/a', '/b'])).toEqual(['/a', '/b'])
    expect(() => parseAttachmentPaths('x')).toThrow('inválido')
    expect(() => parseAttachmentPaths([1])).toThrow('inválido')
    expect(() => parseAttachmentPaths(Array.from({ length: 201 }, () => '/a'))).toThrow('inválido')
  })
})

describe('parseModel', () => {
  it('accepts alias, default and full id', () => {
    for (const ok of ['opus', 'default', 'claude-opus-4-1[1m]', 'anthropic.claude:v1/x'])
      expect(parseModel(ok)).toBe(ok)
  })
  it.each([[''], ['with space'], ['-flag'], ['a,b'], ['a'.repeat(201)], [42], [null]])('rejects %j', (value) => {
    expect(() => parseModel(value)).toThrow('Modelo inválido.')
  })
})

describe('parseTaskId', () => {
  it('accepts non-empty text and rejects the rest', () => {
    expect(parseTaskId('a1')).toBe('a1')
    for (const bad of ['', 42, undefined, 'x'.repeat(201)]) expect(() => parseTaskId(bad)).toThrow('inválido')
  })
})
