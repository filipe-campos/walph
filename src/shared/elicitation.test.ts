import { describe, expect, it } from 'vitest'
import { validateElicitationContent } from './elicitation'
import type { ClaudeElicitationField } from './types'

const base = (key: string, required = false) => ({ key, label: key, description: '', required })
const fields: ClaudeElicitationField[] = [
  { ...base('name', true), type: 'string', minLength: 2, maxLength: 5 },
  { ...base('mail'), type: 'string', format: 'email' },
  { ...base('site'), type: 'string', format: 'uri' },
  { ...base('day'), type: 'string', format: 'date' },
  { ...base('when'), type: 'string', format: 'date-time' },
  { ...base('age'), type: 'number', integer: true, minimum: 0, maximum: 120 },
  { ...base('score'), type: 'number', integer: false, maximum: 10 },
  { ...base('active'), type: 'boolean' },
  {
    ...base('color'),
    type: 'enum',
    multiple: false,
    options: [
      { value: 'r', label: 'R' },
      { value: 'g', label: 'G' }
    ]
  },
  {
    ...base('tags'),
    type: 'enum',
    multiple: true,
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' }
    ]
  }
]
const run = (content: unknown) => validateElicitationContent(fields, content)

describe('validateElicitationContent', () => {
  it('accepts valid values and drops unknown keys', () => {
    const content = {
      name: 'Ana',
      mail: 'a@b.co',
      site: 'https://x.com',
      day: '2024-02-29',
      when: '2024-05-01T10:00:00Z',
      age: 30,
      score: 9.5,
      active: false,
      color: 'g',
      tags: ['a', 'b']
    }
    expect(run({ ...content, tags: ['a', 'a', 'b'], intruder: 'x' })).toEqual({ ok: true, content })
  })

  it('missing/empty required gives required; empty optional is omitted', () => {
    expect(run({})).toEqual({ ok: false, errors: { name: 'required' } })
    expect(run({ name: '' })).toEqual({ ok: false, errors: { name: 'required' } })
    expect(run(undefined)).toEqual({ ok: false, errors: { name: 'required' } })
    expect(run({ name: 'Ana', mail: '', age: null })).toEqual({ ok: true, content: { name: 'Ana' } })
  })

  it('returns one code per field', () => {
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ name: 'A' }, 'name', 'minLength'],
      [{ name: 'Ana Maria' }, 'name', 'maxLength'],
      [{ name: 5 }, 'name', 'type'],
      [{ name: 'Ana', mail: 'no-at-sign' }, 'mail', 'email'],
      [{ name: 'Ana', site: 'no scheme' }, 'site', 'uri'],
      [{ name: 'Ana', day: '2023-02-29' }, 'day', 'date'],
      [{ name: 'Ana', day: '01/02/2024' }, 'day', 'date'],
      [{ name: 'Ana', when: '2024-05-01' }, 'when', 'dateTime'],
      [{ name: 'Ana', when: '2024-13-01T00:00:00Z' }, 'when', 'dateTime'],
      [{ name: 'Ana', age: 1.5 }, 'age', 'integer'],
      [{ name: 'Ana', age: -1 }, 'age', 'minimum'],
      [{ name: 'Ana', age: '3' }, 'age', 'type'],
      [{ name: 'Ana', score: 11 }, 'score', 'maximum'],
      [{ name: 'Ana', score: Infinity }, 'score', 'type'],
      [{ name: 'Ana', active: 'true' }, 'active', 'type'],
      [{ name: 'Ana', color: 'x' }, 'color', 'enum'],
      [{ name: 'Ana', tags: 'a' }, 'tags', 'enum'],
      [{ name: 'Ana', tags: ['a', 'z'] }, 'tags', 'enum']
    ]
    for (const [content, key, code] of cases) expect(run(content)).toEqual({ ok: false, errors: { [key]: code } })
  })

  it('collects errors from several fields', () => {
    expect(run({ mail: 'x', color: 'q' })).toEqual({
      ok: false,
      errors: { name: 'required', mail: 'email', color: 'enum' }
    })
  })

  it('content that is not an object uses the $ key', () => {
    expect(run('text')).toEqual({ ok: false, errors: { $: 'type' } })
    expect(run([1])).toEqual({ ok: false, errors: { $: 'type' } })
  })

  it('a required array cannot be empty', () => {
    const f: ClaudeElicitationField[] = [
      { ...base('t', true), type: 'enum', multiple: true, options: [{ value: 'a', label: 'A' }] }
    ]
    expect(validateElicitationContent(f, { t: [] })).toEqual({ ok: false, errors: { t: 'required' } })
    expect(validateElicitationContent(f, { t: ['a'] })).toEqual({ ok: true, content: { t: ['a'] } })
  })

  it('does not confuse inherited keys nor accept prototype keys', () => {
    const f: ClaudeElicitationField[] = [{ ...base('toString'), type: 'string' }]
    expect(validateElicitationContent(f, {})).toEqual({ ok: true, content: {} })
    const p: ClaudeElicitationField[] = [{ ...base('__proto__'), type: 'string' }]
    expect(validateElicitationContent(p, {})).toMatchObject({ ok: false })
  })
})
