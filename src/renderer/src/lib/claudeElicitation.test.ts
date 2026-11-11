import { describe, expect, it } from 'vitest'
import type { ClaudeElicitationField } from '@shared/types'
import {
  buildContent,
  elicitationMessage,
  initialDrafts,
  urlHost,
  validateAll,
  validateField
} from './claudeElicitation'

const base = { description: '', required: false }
const text = (over: Partial<Extract<ClaudeElicitationField, { type: 'string' }>> = {}): ClaudeElicitationField => ({
  key: 'name',
  label: 'Nome',
  ...base,
  type: 'string',
  ...over
})

describe('initialDrafts', () => {
  it('fills in the defaults', () => {
    const fields: ClaudeElicitationField[] = [
      text({ default: 'Ana' }),
      { key: 'n', label: 'N', ...base, type: 'number', integer: true, default: 3 },
      { key: 'b', label: 'B', ...base, type: 'boolean' },
      {
        key: 'e',
        label: 'E',
        ...base,
        type: 'enum',
        multiple: false,
        options: [{ value: 'a', label: 'A' }],
        default: 'a'
      },
      { key: 'm', label: 'M', ...base, type: 'enum', multiple: true, options: [], default: ['x'] }
    ]
    expect(initialDrafts(fields)).toEqual({ name: 'Ana', n: '3', b: false, e: 'a', m: ['x'] })
  })
})

describe('validateField', () => {
  it('required', () => {
    expect(validateField(text({ required: true }), '  ')).toBe('Campo obrigatório.')
    expect(validateField(text(), '')).toBeNull()
    expect(
      validateField(
        { key: 'e', label: 'E', description: '', required: true, type: 'enum', multiple: true, options: [] },
        []
      )
    ).toBe('Escolha uma opção.')
  })

  it('text length and formats', () => {
    expect(validateField(text({ minLength: 3 }), 'ab')).toBe('Use pelo menos 3 caracteres.')
    expect(validateField(text({ maxLength: 2 }), 'abc')).toBe('Use no máximo 2 caracteres.')
    expect(validateField(text({ format: 'email' }), 'a@b')).toBe('E-mail inválido.')
    expect(validateField(text({ format: 'email' }), 'a@b.co')).toBeNull()
    expect(validateField(text({ format: 'uri' }), 'not a url')).toMatch(/inválido/)
    expect(validateField(text({ format: 'uri' }), 'https://x.com')).toBeNull()
    expect(validateField(text({ format: 'date' }), '2026-10-20')).toBeNull()
    expect(validateField(text({ format: 'date' }), '20/10/2026')).toBe('Data inválida.')
  })

  it('number: integer, minimum and maximum', () => {
    const f = (over = {}): ClaudeElicitationField => ({
      key: 'n',
      label: 'N',
      ...base,
      type: 'number',
      integer: true,
      minimum: 1,
      maximum: 5,
      ...over
    })
    expect(validateField(f(), 'abc')).toBe('Digite um número.')
    expect(validateField(f(), '2.5')).toBe('Digite um número inteiro.')
    expect(validateField(f(), '0')).toBe('O valor mínimo é 1.')
    expect(validateField(f(), '6')).toBe('O valor máximo é 5.')
    expect(validateField(f(), '3')).toBeNull()
    expect(validateField(f({ integer: false }), '2,5')).toBeNull()
  })

  it('enum only accepts the options', () => {
    const e: ClaudeElicitationField = {
      key: 'e',
      label: 'E',
      ...base,
      type: 'enum',
      multiple: false,
      options: [{ value: 'a', label: 'A' }]
    }
    expect(validateField(e, 'b')).toBe('Opção inválida.')
    expect(validateField(e, 'a')).toBeNull()
  })
})

describe('buildContent', () => {
  const fields: ClaudeElicitationField[] = [
    text({ required: true }),
    text({ key: 'note' }),
    { key: 'age', label: 'Idade', ...base, type: 'number', integer: true },
    { key: 'ok', label: 'Ok', ...base, type: 'boolean' },
    { key: 'tags', label: 'Tags', ...base, type: 'enum', multiple: true, options: [{ value: 'a', label: 'A' }] }
  ]

  it('builds the content and omits empty optional fields (boolean always goes in)', () => {
    expect(buildContent(fields, { name: ' Ana ', note: '', age: '30', ok: true, tags: ['a'] })).toEqual({
      name: ' Ana ',
      age: 30,
      ok: true,
      tags: ['a']
    })
    expect(buildContent(fields, { name: 'x', note: '', age: '', ok: false, tags: [] })).toEqual({
      name: 'x',
      ok: false
    })
  })

  it('returns null with an invalid field and validateAll lists the errors', () => {
    const drafts = { name: '', note: '', age: 'x', ok: false, tags: [] }
    expect(buildContent(fields, drafts)).toBeNull()
    expect(validateAll(fields, drafts)).toEqual({ name: 'Campo obrigatório.', age: 'Digite um número.' })
  })

  it('date-time becomes ISO', () => {
    const f = [text({ key: 'when', format: 'date-time' })]
    const out = buildContent(f, { when: '2026-10-20T10:30' })
    expect(out?.when).toBe(new Date('2026-10-20T10:30').toISOString())
  })
})

describe('urlHost', () => {
  it('host with port; invalid = null', () => {
    expect(urlHost('https://auth.example.com:8443/login?x=1')).toBe('auth.example.com:8443')
    expect(urlHost('nothing')).toBeNull()
  })
})

describe('rule shared with main', () => {
  it('messages by code use the field limits', () => {
    expect(elicitationMessage(text({ minLength: 4 }), 'minLength')).toBe('Use pelo menos 4 caracteres.')
    expect(elicitationMessage(text(), 'required')).toBe('Campo obrigatório.')
    expect(elicitationMessage(text({ format: 'date-time' }), 'dateTime')).toBe('Data e hora inválidas.')
  })

  it('the sent content is the normalized one (multiple enum without repeats; a nonexistent date is invalid)', () => {
    const tags: ClaudeElicitationField = {
      key: 'tags',
      label: 'Tags',
      ...base,
      type: 'enum',
      multiple: true,
      options: [{ value: 'a', label: 'A' }]
    }
    expect(buildContent([tags], { tags: ['a', 'a'] })).toEqual({ tags: ['a'] })
    expect(validateField(text({ format: 'date' }), '2026-02-31')).toBe('Data inválida.')
  })
})
