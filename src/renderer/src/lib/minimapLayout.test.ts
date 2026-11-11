import { describe, expect, it } from 'vitest'
import { lineToY, minimapLayout, rulerY, scrollTopForSlider, type MinimapInput } from './minimapLayout'

const base: MinimapInput = {
  lineCount: 100,
  lineHeight: 2,
  height: 400,
  scrollTop: 0,
  scrollHeight: 2000,
  clientHeight: 500
}

describe('minimapLayout', () => {
  it('a document that fits: no offset and a proportional window', () => {
    const l = minimapLayout({ ...base, scrollTop: 750 })
    expect(l.offset).toBe(0)
    expect(l.contentHeight).toBe(200)
    expect(l.sliderHeight).toBeCloseTo(50)
    expect(l.sliderTop).toBeCloseTo(75)
    expect(l.firstLine).toBe(0)
    expect(l.endLine).toBe(100)
  })

  it('a tall document: scrolls the content and the slider goes end to end', () => {
    const tall = { ...base, lineCount: 1000, scrollHeight: 20000, clientHeight: 500 }
    const top = minimapLayout(tall)
    expect(top.offset).toBe(0)
    expect(top.sliderTop).toBe(0)
    expect(top.endLine).toBe(200)
    const bottom = minimapLayout({ ...tall, scrollTop: 19500 })
    expect(bottom.offset).toBe(1600)
    expect(bottom.firstLine).toBe(800)
    expect(bottom.endLine).toBe(1000)
    expect(bottom.sliderTop + bottom.sliderHeight).toBeCloseTo(400)
  })

  it('the slider never disappears nor exceeds the height', () => {
    const l = minimapLayout({ ...base, lineCount: 5, scrollHeight: 500000, clientHeight: 10 })
    expect(l.sliderHeight).toBeGreaterThanOrEqual(6)
    const full = minimapLayout({ ...base, lineCount: 1000, scrollHeight: 500, clientHeight: 500 })
    expect(full.sliderHeight).toBeLessThanOrEqual(400)
  })

  it('lineToY subtracts the offset', () => {
    expect(lineToY(10, { offset: 6 }, 2)).toBe(14)
  })

  it('scrollTopForSlider inverts the layout', () => {
    for (const input of [
      { ...base, scrollTop: 750 },
      { ...base, lineCount: 1000, scrollHeight: 20000, scrollTop: 7000 }
    ]) {
      const l = minimapLayout(input)
      expect(scrollTopForSlider(l.sliderTop, input)).toBeCloseTo(input.scrollTop, 3)
    }
  })

  it('scrollTopForSlider respects the limits', () => {
    expect(scrollTopForSlider(-50, base)).toBe(0)
    expect(scrollTopForSlider(9999, base)).toBe(1500)
  })

  it('rulerY is proportional to the lines', () => {
    expect(rulerY(1, 100, 200)).toBe(0)
    expect(rulerY(51, 100, 200)).toBe(100)
    expect(rulerY(1, 1, 200)).toBe(0)
  })
})
