import { describe, expect, it } from 'vitest'
import { parseComposeRequest, parseContainerAction, parseListOptions } from './validate'

describe('parseListOptions', () => {
  it('only background === true turns on background mode', () => {
    expect(parseListOptions({ background: true })).toEqual({ background: true })
    for (const v of [undefined, null, {}, { background: 'true' }, { background: 1 }, 'x']) {
      expect(parseListOptions(v)).toEqual({ background: false })
    }
  })
})

describe('parseContainerAction', () => {
  it('accepts start, stop and restart', () => {
    for (const a of ['start', 'stop', 'restart']) expect(parseContainerAction(a)).toBe(a)
  })
  it.each([undefined, null, 1, '', 'rm', 'kill', '--force'])('refuses %j', (v) => {
    expect(() => parseContainerAction(v)).toThrow('Ação do Docker inválida.')
  })
})

describe('parseComposeRequest', () => {
  it('accepts a safe project with a known action', () => {
    expect(parseComposeRequest('meu_app-1', 'up')).toEqual({ project: 'meu_app-1', action: 'up' })
  })
  it.each([
    [undefined, 'up'],
    ['', 'up'],
    ['-x', 'up'],
    ['A', 'up'],
    ['a b', 'up'],
    ['app', 'exec'],
    ['app', undefined]
  ])('refuses %j / %j', (project, action) => {
    expect(() => parseComposeRequest(project, action)).toThrow('Projeto compose inválido.')
  })
})
