import { describe, expect, it } from 'vitest'
import { imageMimeType, isImagePath } from './imageTypes'

describe('imageMimeType', () => {
  it('maps extensions case-insensitively', () => {
    expect(imageMimeType('/p/a.PNG')).toBe('image/png')
    expect(imageMimeType('/p/a.jpeg')).toBe('image/jpeg')
    expect(imageMimeType('C:\\p\\a.svg')).toBe('image/svg+xml')
    expect(imageMimeType('/p/a.ico')).toBe('image/x-icon')
    expect(imageMimeType('/p/a.avif')).toBe('image/avif')
  })

  it('rejects what is not an image', () => {
    expect(imageMimeType('/p/a.ts')).toBeNull()
    expect(imageMimeType('/p/png')).toBeNull()
    expect(imageMimeType('/p/.png')).toBeNull()
    expect(imageMimeType('/p/a.png.txt')).toBeNull()
    expect(isImagePath('/p/a.gif')).toBe(true)
    expect(isImagePath('/p/a.txt')).toBe(false)
  })
})
