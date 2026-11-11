import { describe, expect, it } from 'vitest'
import type { Diagnostic } from '@shared/types'
import { formatDiagnostics, formatOpenEditors, formatSelection, MAX_DIAGNOSTIC_LINES } from './ideFormat'

const diag = (line: number, severity: Diagnostic['severity'], message: string): Diagnostic => ({
  range: { start: { line, character: 4 }, end: { line, character: 6 } },
  severity,
  message,
  source: 'ts',
  code: 2322
})

describe('formatDiagnostics', () => {
  it('1-based lines, relative path, errors before warnings', () => {
    const out = formatDiagnostics(
      [{ path: '/r/src/a.ts', diagnostics: [diag(1, 'warning', 'w'), diag(0, 'error', 'e\ncontinues')] }],
      '/r'
    )
    expect(out.split('\n')).toEqual([
      expect.stringMatching(/^src[\\/]a\.ts:1:5 error \[ts 2322\] e continues$/),
      expect.stringMatching(/^src[\\/]a\.ts:2:5 warning \[ts 2322\] w$/)
    ])
  })
  it('without diagnostics and with a cut', () => {
    expect(formatDiagnostics([], '/r')).toContain('No diagnostics')
    const many = Array.from({ length: MAX_DIAGNOSTIC_LINES + 5 }, (_, i) => diag(i, 'error', 'x'))
    const out = formatDiagnostics([{ path: '/r/a.ts', diagnostics: many }], '/r')
    expect(out.endsWith('(+5 diagnostics omitted)')).toBe(true)
  })
})

describe('selection and tabs', () => {
  const ctx = {
    activeFile: '/r/a.ts',
    selection: { path: '/r/a.ts', startLine: 1, endLine: 2, text: 'x' },
    openFiles: [{ path: '/r/a.ts', dirty: true }]
  }
  it('serializes', () => {
    expect(JSON.parse(formatSelection(ctx))).toMatchObject({ startLine: 1, endLine: 2, text: 'x' })
    expect(JSON.parse(formatSelection({ ...ctx, selection: null }))).toEqual({ filePath: '/r/a.ts', selection: null })
    expect(JSON.parse(formatOpenEditors(ctx)).openEditors).toEqual([{ filePath: '/r/a.ts', isDirty: true }])
  })
})
