import { describe, expect, it } from 'vitest'
import { createDapParser, DapFramingError, encodeDapMessage } from './framing'

describe('DAP framing', () => {
  it('reads whole, split and concatenated messages', () => {
    const parser = createDapParser()
    const a = encodeDapMessage({ seq: 1, type: 'event', event: 'initialized' })
    const b = encodeDapMessage({ seq: 2, type: 'event', event: 'output', body: { output: 'olá ✓' } })
    const both = Buffer.concat([a, b])
    expect(parser.feed(both.subarray(0, 10))).toEqual([])
    expect(parser.feed(both.subarray(10, a.length + 5))).toEqual([{ seq: 1, type: 'event', event: 'initialized' }])
    expect(parser.feed(both.subarray(a.length + 5))).toEqual([
      { seq: 2, type: 'event', event: 'output', body: { output: 'olá ✓' } }
    ])
  })

  it('a large body in many chunks comes out whole, together with the next message', () => {
    const parser = createDapParser()
    const big = encodeDapMessage({ text: 'x'.repeat(50_000) })
    const next = encodeDapMessage({ seq: 2 })
    const all = Buffer.concat([big, next])
    const out: unknown[] = []
    for (let i = 0; i < all.length; i += 1000) out.push(...parser.feed(all.subarray(i, i + 1000)))
    expect(out).toEqual([{ text: 'x'.repeat(50_000) }, { seq: 2 }])
  })

  it('counts UTF-8 bytes, not characters', () => {
    const encoded = encodeDapMessage({ text: 'ação' })
    const header = encoded.toString('ascii', 0, encoded.indexOf('\r\n'))
    expect(header).toBe(`Content-Length: ${Buffer.byteLength(JSON.stringify({ text: 'ação' }))}`)
  })

  it('accepts extra headers and any name casing', () => {
    const body = JSON.stringify({ ok: true })
    const raw = Buffer.from(`content-length: ${body.length}\r\nContent-Type: application/json\r\n\r\n${body}`)
    expect(createDapParser().feed(raw)).toEqual([{ ok: true }])
  })

  it('rejects a header without length, a message too large and broken JSON', () => {
    expect(() => createDapParser().feed(Buffer.from('X: 1\r\n\r\n{}'))).toThrow(DapFramingError)
    expect(() => createDapParser(10).feed(Buffer.from('Content-Length: 11\r\n\r\n'))).toThrow(DapFramingError)
    expect(() => createDapParser().feed(Buffer.from('Content-Length: 3\r\n\r\n{x}'))).toThrow(DapFramingError)
  })

  it('rejects an endless header', () => {
    expect(() => createDapParser().feed(Buffer.alloc(9000, 65))).toThrow(DapFramingError)
  })
})
