import { describe, expect, it } from 'vitest'
import { removeSettingFromText, setSettingInText } from './setSettingInText'
import { parseSettingsFile } from './parseSettingsFile'

describe('setSettingInText', () => {
  it('creates the object when the text is empty', () => {
    const out = setSettingInText('', 'editor.fontSize', 16)
    expect(parseSettingsFile(out)).toEqual({ values: { 'editor.fontSize': 16 }, warnings: [] })
  })

  it('preserves comments and the other keys when changing an existing one', () => {
    const text = '{\n  // my font\n  "editor.fontSize": 13,\n  "editor.tabSize": 4 // width\n}\n'
    const out = setSettingInText(text, 'editor.fontSize', 20)
    expect(out).toBe('{\n  // my font\n  "editor.fontSize": 20,\n  "editor.tabSize": 4 // width\n}\n')
  })

  it('adds a new key inside an object with only comments', () => {
    const out = setSettingInText('// hi\n{\n  // "editor.tabSize": 2,\n}\n', 'files.autoSave', 'afterDelay')
    expect(out).toContain('// hi')
    expect(out).toContain('// "editor.tabSize": 2,')
    expect(parseSettingsFile(out)).toEqual({ values: { 'files.autoSave': 'afterDelay' }, warnings: [] })
  })
})

describe('setSettingInText with BOM', () => {
  it('preserves the BOM and changes the key', () => {
    const out = setSettingInText('﻿{ "editor.fontSize": 13 }', 'editor.fontSize', 16)
    expect(out.startsWith('﻿')).toBe(true)
    expect(JSON.parse(out.slice(1))).toEqual({ 'editor.fontSize': 16 })
  })
})

describe('removeSettingFromText', () => {
  it('removes the key preserving comments and the other keys', () => {
    const text = '// top\n{\n  "editor.fontSize": 13,\n  "editor.tabSize": 4 // width\n}\n'
    expect(removeSettingFromText(text, 'editor.fontSize')).toBe('// top\n{\n  "editor.tabSize": 4 // width\n}\n')
  })

  it('a missing key returns the same text', () => {
    const text = '{\n  // nothing\n  "editor.tabSize": 4,\n}\n'
    expect(removeSettingFromText(text, 'editor.fontSize')).toBe(text)
    expect(removeSettingFromText('', 'editor.fontSize')).toBe('')
  })

  it('removes the last key without leaving a dangling comma', () => {
    const out = removeSettingFromText('{\n  "editor.tabSize": 4,\n  "editor.fontSize": 13\n}\n', 'editor.fontSize')
    expect(parseSettingsFile(out)).toEqual({ values: { 'editor.tabSize': 4 }, warnings: [] })
    expect(out).not.toMatch(/,\s*}/)
  })

  it('removes the only key leaving a valid object', () => {
    const out = removeSettingFromText('{ "editor.fontSize": 13 }', 'editor.fontSize')
    expect(parseSettingsFile(out)).toEqual({ values: {}, warnings: [] })
  })

  it('preserves the BOM', () => {
    const out = removeSettingFromText('﻿{ "editor.fontSize": 13, "editor.tabSize": 2 }', 'editor.fontSize')
    expect(out.startsWith('﻿')).toBe(true)
    expect(JSON.parse(out.slice(1))).toEqual({ 'editor.tabSize': 2 })
  })

  it('preserves CRLF', () => {
    const out = removeSettingFromText(
      '{\r\n  "editor.fontSize": 13,\r\n  "editor.tabSize": 2\r\n}\r\n',
      'editor.fontSize'
    )
    expect(out).toBe('{\r\n  "editor.tabSize": 2\r\n}\r\n')
  })
})

describe('removeSettingFromText (review cases)', () => {
  it('removing the last key keeps the end-of-line comment of the previous one', () => {
    const text = '{\n  "editor.tabSize": 4, // c\n  "editor.fontSize": 13 // end\n}\n'
    expect(removeSettingFromText(text, 'editor.fontSize')).toBe('{\n  "editor.tabSize": 4 // c\n}\n')
  })

  it('removes every occurrence of a repeated key', () => {
    const out = removeSettingFromText(
      '{"editor.fontSize": 13, "editor.tabSize": 2, "editor.fontSize": 20}',
      'editor.fontSize'
    )
    expect(parseSettingsFile(out)).toEqual({ values: { 'editor.tabSize': 2 }, warnings: [] })
  })

  it('removes on a single line with other keys', () => {
    const out = removeSettingFromText('{ "editor.fontSize": 13, "editor.tabSize": 2 }', 'editor.fontSize')
    expect(JSON.parse(out)).toEqual({ 'editor.tabSize': 2 })
  })
})
