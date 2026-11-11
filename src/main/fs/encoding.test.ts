import { describe, expect, it } from 'vitest'
import type { TextEncoding } from '@shared/types'
import { decodeText, detectEncoding, encodeText, hasUtf16Bom, isTextEncoding } from './encoding'

const all: TextEncoding[] = ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'windows1252', 'iso88591']

describe('detectEncoding', () => {
  it('detects by the BOM', () => {
    expect(detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toBe('utf8bom')
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x61, 0]))).toBe('utf16le')
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0, 0x61]))).toBe('utf16be')
  })
  it('without BOM (or empty) is utf8, no heuristic', () => {
    expect(detectEncoding(Buffer.from('olá'))).toBe('utf8')
    expect(detectEncoding(Buffer.alloc(0))).toBe('utf8')
    expect(detectEncoding(Buffer.from([0xe9]))).toBe('utf8')
    expect(detectEncoding(Buffer.from([0xef, 0xbb]))).toBe('utf8')
  })
  it('hasUtf16Bom', () => {
    expect(hasUtf16Bom(Buffer.from([0xff, 0xfe]))).toBe(true)
    expect(hasUtf16Bom(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
  })
})

describe('isTextEncoding', () => {
  it('validates the list', () => {
    expect(all.every(isTextEncoding)).toBe(true)
    expect(isTextEncoding('latin1')).toBe(false)
    expect(isTextEncoding(undefined)).toBe(false)
  })
})

describe('decodeText', () => {
  it('strips the BOM of the matching encoding', () => {
    expect(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61]), 'utf8bom')).toBe('a')
    expect(decodeText(Buffer.from([0xff, 0xfe, 0x61, 0]), 'utf16le')).toBe('a')
    expect(decodeText(Buffer.from([0xfe, 0xff, 0, 0x61]), 'utf16be')).toBe('a')
  })
  it('forcing utf8 over a file with BOM keeps the BOM in the text', () => {
    expect(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61]), 'utf8')).toBe('﻿a')
  })
  it('Latin-1 and 1252 differ at 0x80', () => {
    expect(decodeText(Buffer.from([0x80]), 'windows1252')).toBe('€')
    expect(decodeText(Buffer.from([0x80]), 'iso88591')).toBe('\u0080')
    expect(decodeText(Buffer.from([0xe9, 0xff]), 'iso88591')).toBe('éÿ')
  })
  it('empty', () => {
    for (const enc of all) expect(decodeText(Buffer.alloc(0), enc)).toBe('')
  })
})

describe('encodeText', () => {
  it('writes the BOMs', () => {
    expect([...encodeText('a', 'utf8bom')]).toEqual([0xef, 0xbb, 0xbf, 0x61])
    expect([...encodeText('a', 'utf16le')]).toEqual([0xff, 0xfe, 0x61, 0])
    expect([...encodeText('a', 'utf16be')]).toEqual([0xfe, 0xff, 0, 0x61])
    expect([...encodeText('a', 'utf8')]).toEqual([0x61])
  })
  it('empty file: only the BOM (or nothing)', () => {
    expect(encodeText('', 'utf8').length).toBe(0)
    expect(encodeText('', 'windows1252').length).toBe(0)
    expect(encodeText('', 'utf16be').length).toBe(2)
  })
  it('round trip, with a surrogate pair', () => {
    const text = 'olá ñ 😀 日本\r\nfim'
    for (const enc of ['utf8', 'utf8bom', 'utf16le', 'utf16be'] as const) {
      const buf = encodeText(text, enc)
      expect(decodeText(buf, detectEncoding(buf) === 'utf8' ? 'utf8' : enc)).toBe(text)
    }
    expect(encodeText('😀', 'utf16be').subarray(2).toString('hex')).toBe('d83dde00')
    expect(encodeText('😀', 'utf16le').subarray(2).toString('hex')).toBe('3dd800de')
  })
  it('Windows-1252: especiais', () => {
    const text = '€ “aspas” Š é'
    const buf = encodeText(text, 'windows1252')
    expect(buf[0]).toBe(0x80)
    expect(buf[2]).toBe(0x93)
    expect(decodeText(buf, 'windows1252')).toBe(text)
    const all256 = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
    expect(encodeText(decodeText(all256, 'windows1252'), 'windows1252').equals(all256)).toBe(true)
    expect(encodeText(decodeText(all256, 'iso88591'), 'iso88591').equals(all256)).toBe(true)
  })
  it('a missing character throws in pt-BR with the line', () => {
    expect(() => encodeText('a\nb\n€', 'iso88591')).toThrow('O caractere "€" (linha 3) não existe em ISO-8859-1.')
    expect(() => encodeText('日', 'windows1252')).toThrow('"日" (linha 1) não existe em Windows-1252')
    expect(() => encodeText('x😀', 'windows1252')).toThrow('"😀"')
    expect(() => encodeText('\u0081', 'windows1252')).not.toThrow()
    expect(() => encodeText('\u0080', 'windows1252')).toThrow()
  })
  it('a lone surrogate in UTF-8/16 throws; a valid pair does not', () => {
    for (const enc of ['utf8', 'utf8bom', 'utf16le', 'utf16be'] as const) {
      expect(() => encodeText('a\nb\ud800', enc)).toThrow('(linha 2)')
      expect(() => encodeText('\udc00', enc)).toThrow()
      expect(() => encodeText('😀', enc)).not.toThrow()
    }
  })
})
