import { describe, expect, it } from 'vitest'
import { clampZoom, dataUrlBytes, fitScale, stepZoom, wheelZoom, ZOOM_MAX, ZOOM_MIN } from './imageView'

describe('fitScale', () => {
  it('shrinks images larger than the area and never enlarges', () => {
    expect(fitScale({ width: 500, height: 500 }, { width: 1000, height: 500 })).toBe(0.5)
    expect(fitScale({ width: 500, height: 200 }, { width: 1000, height: 1000 })).toBe(0.2)
    expect(fitScale({ width: 500, height: 500 }, { width: 100, height: 100 })).toBe(1)
  })
  it('an area or image without a size is 100%', () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 10, height: 10 })).toBe(1)
    expect(fitScale({ width: 10, height: 10 }, { width: 0, height: 0 })).toBe(1)
  })
})

describe('zoom', () => {
  it('clamps the range', () => {
    expect(clampZoom(100)).toBe(ZOOM_MAX)
    expect(clampZoom(0)).toBe(ZOOM_MIN)
  })
  it('steps and the wheel change in the right direction', () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.25)
    expect(stepZoom(1, -1)).toBeCloseTo(0.8)
    expect(wheelZoom(1, -10)).toBeGreaterThan(1)
    expect(wheelZoom(1, 10)).toBeLessThan(1)
  })
})

describe('dataUrlBytes', () => {
  it('counts the base64 bytes with and without padding', () => {
    expect(dataUrlBytes('data:image/png;base64,QUJD')).toBe(3)
    expect(dataUrlBytes('data:image/png;base64,QUI=')).toBe(2)
    expect(dataUrlBytes('data:image/png;base64,QQ==')).toBe(1)
  })
  it('counts a data URL without base64 and rejects what is not a data URL', () => {
    expect(dataUrlBytes('data:image/svg+xml,%3Csvg%3E')).toBe(5)
    expect(dataUrlBytes('http://x/y.png')).toBeNull()
  })
})
