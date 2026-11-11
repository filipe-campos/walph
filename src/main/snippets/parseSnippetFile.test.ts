import { describe, expect, it } from 'vitest'
import { parseSnippetFile, type SnippetFileOrigin } from './parseSnippetFile'

const global: SnippetFileOrigin = {
  path: '/u/snippets/a.code-snippets',
  label: 'snippets/a.code-snippets',
  source: 'user'
}
const ts: SnippetFileOrigin = { ...global, path: '/u/snippets/typescript.json', languageId: 'typescript' }

describe('parseSnippetFile', () => {
  it('reads prefixes, body lines, description and scope', () => {
    const text = `// comment
{
  "Log": { "prefix": ["log", "cl"], "body": ["console.log($1)", "$0"], "description": "logs", "scope": "javascript, typescript ,bad id" },
}`
    expect(parseSnippetFile(text, global)).toEqual({
      snippets: [
        {
          name: 'Log',
          prefixes: ['log', 'cl'],
          body: 'console.log($1)\n$0',
          description: 'logs',
          scopes: ['javascript', 'typescript'],
          source: 'user',
          file: global.path
        }
      ],
      warnings: []
    })
  })

  it('a language file uses the languageId from the name and ignores `scope`', () => {
    const { snippets } = parseSnippetFile('{ "A": { "prefix": "a", "body": "x", "scope": "python" } }', ts)
    expect(snippets[0]?.scopes).toEqual(['typescript'])
  })

  it('no scope applies to every language; no prefix leaves it only for Insert Snippet', () => {
    const { snippets } = parseSnippetFile('{ "A": { "body": "x" } }', global)
    expect(snippets[0]).toMatchObject({ prefixes: [], scopes: null })
  })

  it('invalid entries become warnings without dropping the others', () => {
    const text =
      '{ "ok": { "prefix": "a", "body": "x" }, "noBody": { "prefix": "b" }, "num": { "prefix": 1, "body": "y" }, "x": 3 }'
    const result = parseSnippetFile(text, global)
    expect(result.snippets.map((s) => s.name)).toEqual(['ok'])
    expect(result.warnings).toHaveLength(3)
    expect(result.warnings[0]).toContain('noBody')
  })

  it('broken or non-object JSONC becomes a warning', () => {
    expect(parseSnippetFile('{ "a": ', global).warnings[0]).toContain('snippets/a.code-snippets')
    expect(parseSnippetFile('[1]', global)).toMatchObject({
      snippets: [],
      warnings: [expect.stringContaining('objeto')]
    })
  })

  it('an empty or comment-only file has no snippets or warnings', () => {
    expect(parseSnippetFile('// nothing\n', global)).toEqual({ snippets: [], warnings: [] })
  })

  it('__proto__ does not pollute the global prototype', () => {
    parseSnippetFile('{ "__proto__": { "prefix": "p", "body": "x" } }', global)
    expect(({} as Record<string, unknown>).prefix).toBeUndefined()
  })
})
