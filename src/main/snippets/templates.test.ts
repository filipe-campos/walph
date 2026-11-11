import { describe, expect, it } from 'vitest'
import { snippetFileTemplate } from './templates'
import { parseSnippetFile } from './parseSnippetFile'

const origin = { path: '/x', label: 'x', source: 'user' as const }

describe('snippetFileTemplate', () => {
  it('is valid JSONC with no active snippets (all commented out)', () => {
    for (const kind of ['language', 'global', 'workspace'] as const) {
      const text = snippetFileTemplate(kind, 'typescript')
      expect(parseSnippetFile(text, origin)).toEqual({ snippets: [], warnings: [] })
    }
  })

  it('only the global and workspace files carry `scope` in the example', () => {
    expect(snippetFileTemplate('language', 'python')).not.toContain('"scope"')
    expect(snippetFileTemplate('language', 'python')).toContain('python')
    expect(snippetFileTemplate('global', 'mine')).toContain('"scope"')
  })

  it('uncommented, the example is a valid snippet', () => {
    const text = snippetFileTemplate('global', 'x').replace(/^ {2}\/\/ /gm, '  ')
    const { snippets } = parseSnippetFile(text, origin)
    expect(snippets[0]).toMatchObject({
      name: 'Print to console',
      prefixes: ['log'],
      scopes: ['javascript', 'typescript']
    })
  })
})
