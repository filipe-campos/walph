import { describe, expect, it } from 'vitest'
import { parseSettingsFile } from './parseSettingsFile'

describe('parseSettingsFile', () => {
  it('an empty or comment-only file counts as {}', () => {
    expect(parseSettingsFile('')).toEqual({ values: {}, warnings: [] })
    expect(parseSettingsFile('  \n ')).toEqual({ values: {}, warnings: [] })
    expect(parseSettingsFile('// nothing here\n/* nor here */')).toEqual({ values: {}, warnings: [] })
  })

  it('accepts comments and a trailing comma (JSONC)', () => {
    const text = `{
      // font size
      "editor.fontSize": 16, /* inline */
      "files.autoSave": "afterDelay",
    }`
    expect(parseSettingsFile(text)).toEqual({
      values: { 'editor.fontSize': 16, 'files.autoSave': 'afterDelay' },
      warnings: []
    })
  })

  it('a syntax error carries line:column in pt-BR', () => {
    const result = parseSettingsFile('{\n  "editor.fontSize": 16\n  "editor.tabSize": 4\n}')
    expect(result).toEqual({ error: expect.stringMatching(/"," esperada \(linha:coluna 3:3\)/) })
  })

  it('an unknown key and an invalid value become warnings without invalidating the file', () => {
    const result = parseSettingsFile('{ "editor.fontSize": 16, "editor.tabSize": "x", "foo": 1 }')
    expect(result).toEqual({
      values: { 'editor.fontSize': 16 },
      warnings: ['"editor.tabSize" deve ser um inteiro entre 1 e 16', 'configuração desconhecida "foo"']
    })
  })

  it('a root that is not an object is an error', () => {
    expect(parseSettingsFile('[1, 2]')).toHaveProperty('error')
    expect(parseSettingsFile('42')).toHaveProperty('error')
  })
})

describe('parseSettingsFile per layer', () => {
  const text = '{ "terminal.shell": "./evil", "editor.fontSize": 15 }'
  it('in the workspace, terminal.shell is dropped with a warning', () => {
    expect(parseSettingsFile(text, 'workspace')).toEqual({
      values: { 'editor.fontSize': 15 },
      warnings: ['"terminal.shell" só pode ser definido nas configurações do usuário']
    })
  })
  it('in the user layer, a relative path is refused', () => {
    const result = parseSettingsFile(text)
    expect(result).toMatchObject({ values: { 'editor.fontSize': 15 } })
    expect('warnings' in result && result.warnings[0]).toContain('"terminal.shell"')
  })
})
