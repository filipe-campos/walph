import { describe, expect, it } from 'vitest'
import { assertReadableImage, MAX_IMAGE_BYTES, toDataUrl } from './imageFile'

describe('assertReadableImage', () => {
  it('returns the MIME of a valid image', () => {
    expect(assertReadableImage('/p/a.gif', { isFile: true, size: 10 })).toBe('image/gif')
    expect(assertReadableImage('/p/a.gif', { isFile: true, size: MAX_IMAGE_BYTES })).toBe('image/gif')
  })

  it('throws in pt-BR for type, folder and size', () => {
    expect(() => assertReadableImage('/p/a.txt', { isFile: true, size: 1 })).toThrow('não suportado')
    expect(() => assertReadableImage('/p/a.png', { isFile: false, size: 1 })).toThrow('não é um arquivo')
    expect(() => assertReadableImage('/p/a.png', { isFile: true, size: MAX_IMAGE_BYTES + 1 })).toThrow('grande demais')
  })
})

describe('toDataUrl', () => {
  it('encodes in base64', () => {
    expect(toDataUrl('image/png', Buffer.from('abc'))).toBe('data:image/png;base64,YWJj')
  })
})
