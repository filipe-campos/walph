import { describe, expect, it } from 'vitest'
import { dropPartialHead, trimPartialTail } from './utf8Boundary'

const text = (buf: Buffer): string => buf.toString('utf8')

describe('trimPartialTail', () => {
  const word = Buffer.from('aé€😀')

  it('keeps text cut at a character boundary', () => {
    expect(text(trimPartialTail(word))).toBe('aé€😀')
    expect(text(trimPartialTail(word.subarray(0, 3)))).toBe('aé')
  })

  it('removes the incomplete sequence from the end at every cut point', () => {
    expect(text(trimPartialTail(word.subarray(0, 2)))).toBe('a')
    expect(text(trimPartialTail(word.subarray(0, 4)))).toBe('aé')
    expect(text(trimPartialTail(word.subarray(0, 5)))).toBe('aé')
    expect(text(trimPartialTail(word.subarray(0, 7)))).toBe('aé€')
    expect(text(trimPartialTail(word.subarray(0, 9)))).toBe('aé€')
  })

  it('accepts empty and ASCII', () => {
    expect(trimPartialTail(Buffer.alloc(0)).length).toBe(0)
    expect(text(trimPartialTail(Buffer.from('abc')))).toBe('abc')
  })
})

describe('dropPartialHead', () => {
  const word = Buffer.from('€😀')

  it('drops the orphan continuation from the start', () => {
    expect(text(dropPartialHead(word.subarray(1)))).toBe('😀')
    expect(text(dropPartialHead(word.subarray(2)))).toBe('😀')
    expect(text(dropPartialHead(word.subarray(4)))).toBe('')
  })

  it('leaves alone a buffer that starts at a whole character', () => {
    expect(dropPartialHead(word)).toBe(word)
  })
})
