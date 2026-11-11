import { afterEach, describe, expect, it } from 'vitest'
import {
  blurRegion,
  captureFocus,
  focusRegion,
  hasFocus,
  registerFocusTarget,
  registerRegion,
  requestFocus,
  restoreFocus
} from './focusBridge'

const offs: (() => void)[] = []
const reg = (...args: Parameters<typeof registerRegion>): void => {
  offs.push(registerRegion(...args))
}
const byId = (id: string): HTMLElement => document.getElementById(id)!

afterEach(() => {
  offs.splice(0).forEach((off) => off())
  document.body.innerHTML = ''
})

describe('focusBridge', () => {
  it('hasFocus applies to the focus inside the region, including the element itself', () => {
    document.body.innerHTML = '<div id="r"><button id="in"></button></div><button id="out"></button>'
    reg('tree', byId('r'))
    byId('in').focus()
    expect(hasFocus('tree')).toBe(true)
    byId('out').focus()
    expect(hasFocus('tree')).toBe(false)
  })

  it('a region without registration or disposed never has focus', () => {
    document.body.innerHTML = '<div id="r"><button id="in"></button></div>'
    byId('in').focus()
    expect(hasFocus('tree')).toBe(false)
    const off = registerRegion('tree', byId('r'))
    expect(hasFocus('tree')).toBe(true)
    off()
    expect(hasFocus('tree')).toBe(false)
  })

  it('disposing one registration does not remove another element of the same region', () => {
    document.body.innerHTML =
      '<div id="a"><i id="ia" tabindex="0"></i></div><div id="b"><i id="ib" tabindex="0"></i></div>'
    const offA = registerRegion('diffEditor', byId('a'))
    reg('diffEditor', byId('b'))
    offA()
    byId('ib').focus()
    expect(hasFocus('diffEditor')).toBe(true)
  })

  it('regions with a dynamic key are independent', () => {
    document.body.innerHTML = '<div id="a"><i id="ia" tabindex="0"></i></div><div id="b"></div>'
    reg('claudeCard:1', byId('a'))
    reg('claudeCard:2', byId('b'))
    byId('ia').focus()
    expect(hasFocus('claudeCard:1')).toBe(true)
    expect(hasFocus('claudeCard:2')).toBe(false)
  })

  it('focusRegion focuses the element and returns false without a region', () => {
    document.body.innerHTML = '<input id="s" />'
    expect(focusRegion('containersSearch')).toBe(false)
    reg('containersSearch', byId('s'))
    expect(focusRegion('containersSearch')).toBe(true)
    expect(document.activeElement).toBe(byId('s'))
  })

  it('focusRegion uses the region function and moves to the previous one when it refuses', () => {
    document.body.innerHTML =
      '<div id="a"><i id="ia" tabindex="0"></i></div><div id="b"></div><div id="c"><i id="ic" tabindex="0"></i></div>'
    const first = (el: HTMLElement): boolean => (el.querySelector<HTMLElement>('i')?.focus(), !!el.querySelector('i'))
    // Registration out of document order: document order applies (the last one first).
    const offC = registerRegion('diffEditor', byId('c'), first)
    reg('diffEditor', byId('b'), first)
    reg('diffEditor', byId('a'), first)
    focusRegion('diffEditor')
    expect(document.activeElement).toBe(byId('ic'))

    offC()
    focusRegion('diffEditor')
    expect(document.activeElement).toBe(byId('ia'))
  })

  it('blurRegion only releases the focus when it is in the region', () => {
    document.body.innerHTML = '<div id="r"><button id="in"></button></div><button id="out"></button>'
    reg('claudePanel', byId('r'))
    byId('out').focus()
    blurRegion('claudePanel')
    expect(document.activeElement).toBe(byId('out'))
    byId('in').focus()
    blurRegion('claudePanel')
    expect(document.activeElement).toBe(document.body)
  })

  it('captureFocus stores the focused element in the region and restoreFocus gives it back', () => {
    document.body.innerHTML = '<div id="r"><button id="in"></button></div><button id="out"></button>'
    reg('containersView', byId('r'))
    byId('out').focus()
    expect(captureFocus('containersView')).toBeNull()

    byId('in').focus()
    const snapshot = captureFocus('containersView')
    expect(snapshot?.el).toBe(byId('in'))
    byId('out').focus()
    expect(restoreFocus(snapshot)).toBe(true)
    expect(document.activeElement).toBe(byId('in'))
  })

  it('restoreFocus does nothing with a removed element or without a capture', () => {
    document.body.innerHTML = '<div id="r"><button id="in"></button></div>'
    reg('containersView', byId('r'))
    byId('in').focus()
    const snapshot = captureFocus('containersView')
    byId('r').remove()
    expect(restoreFocus(snapshot)).toBe(false)
    expect(restoreFocus(null)).toBe(false)
  })
})

describe('focus targets', () => {
  it('requestFocus calls what the component registered and returns false with nobody', () => {
    expect(requestFocus('terminal')).toBe(false)
    let calls = 0
    const off = registerFocusTarget('terminal', () => calls++)
    expect(requestFocus('terminal')).toBe(true)
    expect(calls).toBe(1)
    off()
    expect(requestFocus('terminal')).toBe(false)
  })

  it('targets with a dynamic key are independent', () => {
    const calls: string[] = []
    const offs = [
      registerFocusTarget('terminalFind:a', () => calls.push('a')),
      registerFocusTarget('terminalFind:b', () => calls.push('b'))
    ]
    requestFocus('terminalFind:b')
    expect(calls).toEqual(['b'])
    offs.forEach((off) => off())
  })

  it('disposing a registration does not remove another component of the same target', () => {
    const calls: string[] = []
    const offA = registerFocusTarget('claudeFind:c', () => calls.push('a'))
    const offB = registerFocusTarget('claudeFind:c', () => calls.push('b'))
    offA()
    requestFocus('claudeFind:c')
    expect(calls).toEqual(['b'])
    offB()
  })
})
