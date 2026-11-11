import { describe, expect, it } from 'vitest'
import { FILE_ICON_COLORS, FILE_ICON_GLYPHS, fileIconFor } from './fileIcons'

describe('fileIconFor: files', () => {
  it('languages become a badge with the acronym', () => {
    expect(fileIconFor('index.ts')).toEqual({ kind: 'file', label: 'TS', color: 'blue' })
    expect(fileIconFor('App.tsx')).toEqual({ kind: 'file', label: 'TSX', color: 'sky' })
    expect(fileIconFor('main.py')).toMatchObject({ label: 'PY' })
  })

  it('the exact name wins over the extension', () => {
    expect(fileIconFor('package.json')).toEqual({ kind: 'file', glyph: 'package', color: 'green' })
    expect(fileIconFor('tsconfig.json')).toMatchObject({ glyph: 'gear' })
    expect(fileIconFor('Dockerfile')).toMatchObject({ glyph: 'container' })
  })

  it('the compound suffix wins over the simple extension', () => {
    expect(fileIconFor('store.test.ts')).toMatchObject({ glyph: 'flask', color: 'teal' })
    expect(fileIconFor('types.d.ts')).toMatchObject({ label: 'DTS' })
  })

  it('prefix patterns: .env*, readme.*, license*, tsconfig.*.json', () => {
    expect(fileIconFor('.env.production')).toMatchObject({ glyph: 'key', color: 'yellow' })
    expect(fileIconFor('README.pt-BR.md')).toMatchObject({ glyph: 'book' })
    expect(fileIconFor('LICENSE-MIT')).toMatchObject({ glyph: 'law' })
    expect(fileIconFor('tsconfig.node.json')).toMatchObject({ glyph: 'gear', color: 'blue' })
  })

  it('only the last path segment counts, case-insensitive', () => {
    expect(fileIconFor('/repo/src/PACKAGE.JSON')).toMatchObject({ glyph: 'package' })
    expect(fileIconFor('C:\\repo\\styles.css')).toMatchObject({ glyph: 'hash' })
  })

  it('unknown falls back to the generic page, without inheriting Object.prototype keys', () => {
    expect(fileIconFor('file.xyzabc')).toEqual({ kind: 'file', glyph: 'page', color: 'gray' })
    expect(fileIconFor('constructor')).toEqual({ kind: 'file', glyph: 'page', color: 'gray' })
    expect(fileIconFor('x.constructor')).toEqual({ kind: 'file', glyph: 'page', color: 'gray' })
  })
})

describe('fileIconFor: folders', () => {
  it('category by name, also without leading . or _', () => {
    expect(fileIconFor('src', { folder: true })).toEqual({ kind: 'folder', glyph: 'code', color: 'green', open: false })
    expect(fileIconFor('components', { folder: true, open: true })).toMatchObject({ glyph: 'blocks', open: true })
    expect(fileIconFor('_lib', { folder: true })).toMatchObject({ glyph: 'layers' })
  })

  it('a folder without a category is slate and without a glyph', () => {
    expect(fileIconFor('qualquer-coisa', { folder: true })).toEqual({
      kind: 'folder',
      glyph: null,
      color: 'slate',
      open: false
    })
  })
})

describe('tables', () => {
  it('every color used exists in the palette and every glyph cited is drawn', () => {
    const names = ['a.ts', 'a.json', 'a.css', 'a.md', 'package.json', 'a.test.ts', 'Dockerfile', '.gitignore']
    for (const n of names) {
      const spec = fileIconFor(n)
      expect(FILE_ICON_COLORS[spec.color], n).toBeTruthy()
      if (spec.glyph) expect(FILE_ICON_GLYPHS[spec.glyph], `${n} → ${spec.glyph}`).toBeTruthy()
    }
  })
})

describe('fileIconFor: folders by suffix', () => {
  it('-api, -web and -app reuse api, public and mobile', () => {
    expect(fileIconFor('billing-api', { folder: true })).toMatchObject({ glyph: 'plug', color: 'teal' })
    expect(fileIconFor('shop-web', { folder: true })).toMatchObject({ glyph: 'globe', color: 'sky' })
    expect(fileIconFor('club-app', { folder: true })).toMatchObject({ glyph: 'phone', color: 'green' })
  })

  it('the exact name wins over the suffix and the suffix alone does not count', () => {
    expect(fileIconFor('app-mobile', { folder: true })).toMatchObject({ glyph: 'phone' })
    expect(fileIconFor('-api', { folder: true })).toMatchObject({ glyph: null, color: 'slate' })
    expect(fileIconFor('billing-api.ts')).not.toMatchObject({ kind: 'folder' })
  })
})
