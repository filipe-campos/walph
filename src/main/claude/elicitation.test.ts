import { describe, expect, it } from 'vitest'
import type { ClaudeElicitationField } from '@shared/types'
import { declinedNotice, declinedUrlNotice, httpUrl, normalizeElicitation, plainText } from './elicitation'

const form = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  normalizeElicitation({
    serverName: 'docs',
    message: 'Fill in',
    mode: 'form',
    requestedSchema: { type: 'object', properties, ...extra }
  })

const fieldsOf = (r: ReturnType<typeof form>): ClaudeElicitationField[] => {
  if (!r.ok) throw new Error(r.reason)
  return r.request.fields
}

describe('plainText', () => {
  it('strips controls, trims and truncates', () => {
    expect(plainText('a\u0000b\nc\u001b[31m', 50)).toBe('a b c [31m')
    expect(plainText('x'.repeat(10), 5)).toBe('xxxx…')
    expect(plainText(42, 5)).toBe('')
  })
  it('keeps line breaks when asked', () => {
    expect(plainText('a\r\nb\u0007c', 50, true)).toBe('a\nbc')
  })
})

describe('httpUrl', () => {
  it('accepts only http(s)', () => {
    expect(httpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(httpUrl('http://localhost:3000')).toBe('http://localhost:3000/')
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'mailto:a@b.c', '/relative', '', 7, undefined])
      expect(httpUrl(bad)).toBeNull()
    expect(httpUrl(`https://x.com/${'a'.repeat(9000)}`)).toBeNull()
  })
})

describe('normalizeElicitation - header', () => {
  it('cleans and truncates the texts, title falls back to displayName', () => {
    const r = normalizeElicitation({
      serverName: 'my\nserver',
      message: 'm'.repeat(5000),
      displayName: 'Short\u0000Name',
      mode: 'form'
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.request.serverName).toBe('my server')
    expect(r.request.message).toHaveLength(2000)
    expect(r.request.title).toBe('Short Name')
    expect(r.request.fields).toEqual([])
  })

  it('no mode means form; an unknown mode is declined', () => {
    expect(normalizeElicitation({ serverName: 's', message: 'x' })).toMatchObject({ ok: true })
    expect(normalizeElicitation({ serverName: 's', message: 'x', mode: 'voice' })).toMatchObject({ ok: false })
    expect(normalizeElicitation(null)).toMatchObject({ ok: false })
  })
})

describe('normalizeElicitation - url', () => {
  it('http(s) becomes a url request without fields', () => {
    const r = normalizeElicitation({
      serverName: 's',
      message: 'Sign in',
      mode: 'url',
      url: 'https://auth.example.com/x'
    })
    expect(r).toMatchObject({ ok: true, request: { mode: 'url', url: 'https://auth.example.com/x', fields: [] } })
  })
  it('a URL that is not http(s) is declined', () => {
    for (const url of ['file:///x', 'javascript:1', 'not a url', undefined])
      expect(normalizeElicitation({ serverName: 's', message: 'x', mode: 'url', url })).toMatchObject({ ok: false })
  })
})

describe('normalizeElicitation - fields', () => {
  it('string with format, limits and default', () => {
    const [f] = fieldsOf(
      form(
        { email: { type: 'string', title: 'E-mail', format: 'email', minLength: 3, maxLength: 80, default: 'a@b.co' } },
        { required: ['email'] }
      )
    )
    expect(f).toEqual({
      key: 'email',
      label: 'E-mail',
      description: '',
      required: true,
      type: 'string',
      format: 'email',
      minLength: 3,
      maxLength: 80,
      default: 'a@b.co'
    })
  })

  it('an unknown format is ignored, label falls back to the key', () => {
    const [f] = fieldsOf(form({ host: { type: 'string', format: 'hostname', description: 'x\ny' } }))
    expect(f).toMatchObject({ key: 'host', label: 'host', description: 'x y', required: false, type: 'string' })
    expect(f).not.toHaveProperty('format')
  })

  it('number and integer', () => {
    const fields = fieldsOf(
      form({ n: { type: 'number', minimum: 0, maximum: 1.5, default: 1 }, i: { type: 'integer', default: 3 } })
    )
    expect(fields[0]).toMatchObject({ type: 'number', integer: false, minimum: 0, maximum: 1.5, default: 1 })
    expect(fields[1]).toMatchObject({ type: 'number', integer: true, default: 3 })
  })

  it('boolean', () => {
    expect(fieldsOf(form({ b: { type: 'boolean', default: true } }))[0]).toMatchObject({
      type: 'boolean',
      default: true
    })
  })

  it('enum with enumNames, oneOf and array of enum/anyOf', () => {
    const fields = fieldsOf(
      form({
        a: { type: 'string', enum: ['x', 'y'], enumNames: ['Ex', 'Why'], default: 'y' },
        b: {
          type: 'string',
          oneOf: [
            { const: 'p', title: 'Pea' },
            { const: 'q', title: 'Cue' }
          ],
          default: 'zzz'
        },
        c: { type: 'array', items: { type: 'string', enum: ['m', 'n'] }, default: ['m', 'outside'] },
        d: { type: 'array', items: { anyOf: [{ const: 'k', title: 'Kay' }] } }
      })
    )
    expect(fields[0]).toMatchObject({
      type: 'enum',
      multiple: false,
      options: [
        { value: 'x', label: 'Ex' },
        { value: 'y', label: 'Why' }
      ],
      default: 'y'
    })
    expect(fields[1]).toMatchObject({
      multiple: false,
      options: [
        { value: 'p', label: 'Pea' },
        { value: 'q', label: 'Cue' }
      ]
    })
    expect(fields[1]).not.toHaveProperty('default')
    expect(fields[2]).toMatchObject({ multiple: true, default: ['m'] })
    expect(fields[3]).toMatchObject({ multiple: true, options: [{ value: 'k', label: 'Kay' }] })
  })

  it('required only applies to existing keys', () => {
    const fields = fieldsOf(form({ a: { type: 'string' }, b: { type: 'string' } }, { required: ['b', 'ghost'] }))
    expect(fields.map((f) => f.required)).toEqual([false, true])
  })

  it('declines formats the panel does not show', () => {
    const cases: Record<string, unknown>[] = [
      { o: { type: 'object', properties: {} } },
      { x: { type: 'null' } },
      { x: { type: 'string', enum: [] } },
      { x: { type: 'string', enum: ['a', 'a'] } },
      { x: { type: 'string', enum: [1, 2] } },
      { x: { type: 'array', items: { type: 'object' } } },
      { x: { type: 'array' } },
      { x: 'text' },
      { x: {} }
    ]
    for (const properties of cases) expect(form(properties)).toMatchObject({ ok: false })
  })

  it('declines a schema that is not an object and too many fields', () => {
    expect(normalizeElicitation({ serverName: 's', message: '', requestedSchema: { type: 'array' } })).toMatchObject({
      ok: false
    })
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, { type: 'string' }]))
    expect(form(many)).toMatchObject({ ok: false })
    const ok = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, { type: 'string' }]))
    expect(form(ok)).toMatchObject({ ok: true })
  })

  it('declines an enum with too many options', () => {
    const values = Array.from({ length: 101 }, (_, i) => `v${i}`)
    expect(form({ x: { type: 'string', enum: values } })).toMatchObject({ ok: false })
  })
})

describe('notices', () => {
  it('pt-BR texts with the cleaned name', () => {
    expect(declinedNotice('x\ny')).toBe(
      'O servidor MCP "x y" pediu dados num formato que o Walph não mostra; o pedido foi recusado.'
    )
    expect(declinedUrlNotice('s')).toContain('http(s)')
    expect(declinedNotice(undefined)).toContain('"MCP"')
  })
})

describe('extra protections', () => {
  it('a URL with user/password is declined', () => {
    expect(httpUrl('https://google.com@evil.example/')).toBeNull()
    expect(httpUrl('https://user:pw@example.com/')).toBeNull()
  })
  it('keys that touch the prototype decline the form', () => {
    for (const key of ['__proto__', 'constructor', 'prototype'])
      expect(
        normalizeElicitation({
          serverName: 's',
          message: '',
          requestedSchema: { type: 'object', properties: JSON.parse(`{"${key}":{"type":"string"}}`) }
        })
      ).toMatchObject({ ok: false })
  })
})
