import { describe, expect, it } from 'vitest'
import type { Diagnostic, DiagnosticSeverity } from '@shared/types'
import { buildProblemGroups, compareDiagnostics, countListed, countProblems, formatDiagnosticSource } from './problems'

const diag = (
  severity: DiagnosticSeverity,
  line: number,
  character = 0,
  extra: Partial<Diagnostic> = {}
): Diagnostic => ({
  severity,
  message: `${severity} ${line}:${character}`,
  range: { start: { line, character }, end: { line, character: character + 1 } },
  ...extra
})

describe('countProblems', () => {
  it('adds up errors and warnings of all files, ignoring info and hints', () => {
    expect(
      countProblems({
        '/r/a.ts': [diag('error', 0), diag('warning', 1), diag('hint', 2)],
        '/r/b.ts': [diag('error', 0), diag('info', 3)]
      })
    ).toEqual({ errors: 2, warnings: 1 })
  })

  it('without diagnostics', () => {
    expect(countProblems({})).toEqual({ errors: 0, warnings: 0 })
  })
})

describe('countListed', () => {
  it('counts errors, warnings and infos, without hints', () => {
    expect(
      countListed({ '/r/a.ts': [diag('error', 0), diag('info', 1), diag('hint', 2)], '/r/b.ts': [diag('warning', 0)] })
    ).toBe(3)
  })
})

describe('compareDiagnostics', () => {
  it('sorts by severity and then by position', () => {
    const list = [diag('warning', 1), diag('error', 9), diag('error', 2, 5), diag('error', 2, 1), diag('info', 0)]
    expect(list.sort(compareDiagnostics).map((d) => d.message)).toEqual([
      'error 2:1',
      'error 2:5',
      'error 9:0',
      'warning 1:0',
      'info 0:0'
    ])
  })
})

describe('buildProblemGroups', () => {
  it('groups by file, sorts by relative path and splits name and folder', () => {
    const groups = buildProblemGroups(
      {
        '/r/src/z.ts': [diag('warning', 1), diag('error', 4)],
        '/r/a.ts': [diag('error', 0)],
        '/r/src/lib/b.ts': [diag('error', 0)]
      },
      '/r'
    )
    expect(groups.map((g) => [g.name, g.dir])).toEqual([
      ['a.ts', ''],
      ['b.ts', 'src/lib'],
      ['z.ts', 'src']
    ])
    expect(groups[2].items.map((d) => d.severity)).toEqual(['error', 'warning'])
    expect(groups[2]).toMatchObject({ errors: 1, warnings: 1 })
  })

  it('omits files without problems (empty list or only hints)', () => {
    expect(buildProblemGroups({ '/r/a.ts': [], '/r/b.ts': [diag('hint', 0)] }, '/r')).toEqual([])
  })
})

describe('formatDiagnosticSource', () => {
  it('combines source and code', () => {
    expect(formatDiagnosticSource({ source: 'ts', code: 2322 })).toBe('ts(2322)')
    expect(formatDiagnosticSource({ source: 'ts' })).toBe('ts')
    expect(formatDiagnosticSource({ code: 'TS1005' })).toBe('TS1005')
    expect(formatDiagnosticSource({})).toBe('')
    expect(formatDiagnosticSource({ code: 0 })).toBe('0')
  })
})
