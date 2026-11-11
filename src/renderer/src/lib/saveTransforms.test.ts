import { describe, expect, it } from 'vitest'
import { applyOffsetEdits } from './workspaceEdit'
import { saveTransformEdits, type SaveTransformOptions } from './saveTransforms'

const ALL: SaveTransformOptions = { trimTrailingWhitespace: true, insertFinalNewline: true, trimFinalNewlines: true }
const NONE: SaveTransformOptions = {
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
  trimFinalNewlines: false
}

const run = (text: string, options: Partial<SaveTransformOptions>, protectedLines?: number[]): string =>
  applyOffsetEdits(text, saveTransformEdits(text, { ...NONE, ...options }, new Set(protectedLines)))

describe('saveTransformEdits', () => {
  it('without options changes nothing', () => {
    expect(saveTransformEdits('a  \n\n\n', NONE)).toEqual([])
  })

  it('strips spaces and tabs from the end of each line, in separate edits', () => {
    const text = 'a  \nb\t\n  c \n'
    expect(run(text, { trimTrailingWhitespace: true })).toBe('a\nb\n  c\n')
    expect(saveTransformEdits(text, { ...NONE, trimTrailingWhitespace: true })).toHaveLength(3)
  })

  it('inserts the final newline only when missing and the file is not empty', () => {
    expect(run('a', { insertFinalNewline: true })).toBe('a\n')
    expect(run('a\n', { insertFinalNewline: true })).toBe('a\n')
    expect(run('', { insertFinalNewline: true })).toBe('')
  })

  it('leaves a single newline after the last line with content', () => {
    expect(run('a\n\n\n', { trimFinalNewlines: true })).toBe('a\n')
    expect(run('a\n  \n\t\n', { trimFinalNewlines: true })).toBe('a\n')
    expect(run('a\n', { trimFinalNewlines: true })).toBe('a\n')
    expect(run('a', { trimFinalNewlines: true })).toBe('a')
    expect(run('\n\n', { trimFinalNewlines: true })).toBe('\n\n')
  })

  it('combines everything and is idempotent', () => {
    const once = run('x = 1  \n\ny  \n\n  \n', ALL)
    expect(once).toBe('x = 1\n\ny\n')
    expect(saveTransformEdits(once, ALL)).toEqual([])
    expect(run('a  ', ALL)).toBe('a\n')
    expect(run('a\n  ', { insertFinalNewline: true, trimTrailingWhitespace: true })).toBe('a\n')
  })

  it('on auto save spares the lines with a cursor', () => {
    expect(run('a  \nb  \n', { trimTrailingWhitespace: true }, [1])).toBe('a  \nb\n')
    // The cursor on an empty line at the end holds the trim up to it.
    expect(run('a\n\n\n\n', { trimFinalNewlines: true }, [3])).toBe('a\n\n\n')
    expect(run('a  ', { trimTrailingWhitespace: true, insertFinalNewline: true }, [1])).toBe('a  \n')
  })

  it('the edits do not overlap', () => {
    const edits = saveTransformEdits('a \n \n \n', ALL)
    for (let i = 1; i < edits.length; i++) expect(edits[i]?.from).toBeGreaterThanOrEqual(edits[i - 1]?.to ?? 0)
  })
})
