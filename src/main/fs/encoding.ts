import type { TextEncoding } from '@shared/types'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

const TEXT_ENCODINGS: readonly TextEncoding[] = ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'windows1252', 'iso88591']

export function isTextEncoding(value: unknown): value is TextEncoding {
  return typeof value === 'string' && (TEXT_ENCODINGS as readonly string[]).includes(value)
}

/** Name for the error messages. */
const LABELS: Record<Exclude<TextEncoding, 'utf8bom'>, string> = {
  utf8: 'UTF-8',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  windows1252: 'Windows-1252',
  iso88591: 'ISO-8859-1'
}

const encodingLabel = (encoding: TextEncoding): string =>
  encoding === 'utf8bom' ? t().files.utf8bom : LABELS[encoding]

/** Windows-1252 0x80–0x9F; `0` = undefined byte, which WHATWG (and this code) maps to the same C1 code point. */
const CP1252_HIGH: readonly number[] = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0, 0,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178
]
function cp1252CodePoint(b: number): number {
  if (b < 0x80 || b >= 0xa0) return b
  // 0 in the table marks an undefined byte: the byte itself applies
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- 0 is "no mapping"
  return CP1252_HIGH[b - 0x80] || b
}
const CP1252_REVERSE = new Map<number, number>()
CP1252_HIGH.forEach((cp, i) => cp !== 0 && CP1252_REVERSE.set(cp, 0x80 + i))

const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf])

/** BOM only: no heuristic (a Latin-1 file without BOM shows as UTF-8 with `�` and the user reopens it by hand). */
export function detectEncoding(buf: Buffer): TextEncoding {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8bom'
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le'
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be'
  return 'utf8'
}

/** `true` if the file starts with a UTF-16 BOM (there the null byte is normal, it does not mean binary). */
export function hasUtf16Bom(buf: Buffer): boolean {
  const enc = detectEncoding(buf)
  return enc === 'utf16le' || enc === 'utf16be'
}

export function decodeText(buf: Buffer, encoding: TextEncoding): string {
  switch (encoding) {
    case 'utf8':
      // `ignoreBOM: true` keeps a present BOM in the text (forcing UTF-8 over a file with BOM does not hide it).
      return new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf)
    case 'utf8bom':
      return new TextDecoder('utf-8').decode(buf)
    case 'utf16le':
      return new TextDecoder('utf-16le').decode(buf)
    case 'utf16be':
      return new TextDecoder('utf-16be').decode(buf)
    case 'windows1252': {
      // Own table (no ICU dependency); undefined bytes become the same C1 code point, as in WHATWG.
      let out = ''
      for (let i = 0; i < buf.length; i += 8192) {
        out += String.fromCharCode(...Array.from(buf.subarray(i, i + 8192), cp1252CodePoint))
      }
      return out
    }
    case 'iso88591':
      // Real Latin-1 (WHATWG's 'iso-8859-1' label would be windows-1252).
      return buf.toString('latin1')
  }
}

function unencodable(text: string, index: number, encoding: TextEncoding): Error {
  const char = String.fromCodePoint(text.codePointAt(index) ?? 0)
  let line = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++
  return new UserError(t().files.errors.unencodableChar(char, line, encodingLabel(encoding)))
}

function encodeSingleByte(text: string, encoding: 'windows1252' | 'iso88591'): Buffer {
  const out = Buffer.alloc(text.length)
  let n = 0
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i) ?? 0
    let byte: number | undefined
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) byte = cp
    else if (encoding === 'iso88591') byte = cp <= 0xff ? cp : undefined
    else if (cp < 0xa0) byte = CP1252_HIGH[cp - 0x80] === 0 ? cp : undefined
    else byte = CP1252_REVERSE.get(cp)
    if (byte === undefined) throw unencodable(text, i, encoding)
    out[n++] = byte
    i += cp > 0xffff ? 2 : 1
  }
  return out.subarray(0, n)
}

/** A lone surrogate has no representation in UTF-8/16: an error instead of a silent `�`. */
function assertNoLoneSurrogate(text: string, encoding: TextEncoding): void {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) i++
    else if (c >= 0xd800 && c <= 0xdfff) throw unencodable(text, i, encoding)
  }
}

export function encodeText(text: string, encoding: TextEncoding): Buffer {
  if (encoding === 'utf8' || encoding === 'utf8bom' || encoding === 'utf16le' || encoding === 'utf16be') {
    assertNoLoneSurrogate(text, encoding)
  }
  switch (encoding) {
    case 'utf8':
      return Buffer.from(text, 'utf8')
    case 'utf8bom':
      return Buffer.concat([BOM_UTF8, Buffer.from(text, 'utf8')])
    case 'utf16le':
      return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    case 'utf16be': {
      const body = Buffer.from(text, 'utf16le').swap16()
      return Buffer.concat([Buffer.from([0xfe, 0xff]), body])
    }
    case 'windows1252':
    case 'iso88591':
      return encodeSingleByte(text, encoding)
  }
}
