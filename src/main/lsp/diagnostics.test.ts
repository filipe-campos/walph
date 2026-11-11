import { describe, expect, it } from 'vitest'
import { mapDiagnostics, mapSeverity } from './diagnostics'

const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } }

describe('mapSeverity', () => {
  it('maps 1..4 and treats missing as error', () => {
    expect([1, 2, 3, 4].map(mapSeverity)).toEqual(['error', 'warning', 'info', 'hint'])
    expect(mapSeverity(undefined)).toBe('error')
  })
})

describe('mapDiagnostics', () => {
  it('converts optional fields and drops malformed items', () => {
    const result = mapDiagnostics([
      { range, severity: 2, message: 'm', source: 'ts', code: 2322 },
      { range, message: 'no severity', code: { value: 1 } },
      { range: { start: { line: -1, character: 0 }, end: range.end }, message: 'bad' },
      { range, severity: 1 },
      null
    ])
    expect(result).toEqual([
      { range, severity: 'warning', message: 'm', source: 'ts', code: 2322 },
      { range, severity: 'error', message: 'no severity' }
    ])
  })
  it('an invalid list becomes empty', () => {
    expect(mapDiagnostics(undefined)).toEqual([])
  })
})
