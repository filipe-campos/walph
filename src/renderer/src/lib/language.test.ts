import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { findLanguage, loadLanguage, languageChoices, languageName, PLAIN_TEXT } from './language'

describe('language', () => {
  it('detects by extension when there is no choice', () => {
    expect(languageName('/a/b.ts')).toBe('TypeScript')
    expect(languageName('/a/LICENSE')).toBe(PLAIN_TEXT)
  })

  it('the user choice wins over the extension', () => {
    expect(languageName('/a/b.ts', 'Python')).toBe('Python')
    expect(findLanguage('/a/b.ts', PLAIN_TEXT)).toBeNull()
  })

  it('an unknown choice falls back to detection', () => {
    expect(languageName('/a/b.ts', 'None Of These')).toBe('TypeScript')
  })

  it('lists with Text first and unique names', () => {
    const list = languageChoices()
    expect(list[0]).toBe(PLAIN_TEXT)
    expect(new Set(list).size).toBe(list.length)
    expect(list).toContain('TypeScript')
  })

  it('Markdown loads GFM: strikethrough and table become tree nodes', async () => {
    const support = await loadLanguage('/a/README.md')
    const doc = '~~x~~\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'
    const state = EditorState.create({ doc, extensions: support ? [support] : [] })
    const names = new Set<string>()
    ensureSyntaxTree(state, state.doc.length, 5000)?.iterate({ enter: (n) => void names.add(n.name) })
    expect(names.has('Strikethrough')).toBe(true)
    expect(names.has('Table')).toBe(true)
  })

  it.each(['/a/.env', '/a/.env.local', '/a/.env.production', '/a/.env.example', '/a/prod.env'])(
    '%s is Dotenv',
    (path) => {
      expect(languageName(path)).toBe('Dotenv')
    }
  )

  it('does not confuse it with other files', () => {
    expect(languageName('/a/environment.ts')).toBe('TypeScript')
    expect(languageName('/a/config.yml')).toBe('YAML')
    expect(languageChoices()).toContain('Dotenv')
  })

  it('Dotenv highlights key, value, quotes, interpolation and comment', async () => {
    const support = await loadLanguage('/a/.env')
    const doc = '# note\nexport URL="http://${HOST}:80" # end\nNO=quotes $X\n'
    const state = EditorState.create({ doc, extensions: support ? [support] : [] })
    const seen = new Map<string, string>()
    const tree = ensureSyntaxTree(state, state.doc.length, 5000)
    tree?.iterate({ enter: (n) => void seen.set(state.sliceDoc(n.from, n.to), n.name) })
    expect(seen.get('# note')).toBe('comment')
    expect(seen.get('URL')).toBe('propertyName')
    expect(seen.get('${HOST}')).toBe('variableName.special')
    expect(seen.get('# end')).toBe('comment')
  })
})
