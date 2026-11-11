import { describe, expect, it } from 'vitest'
import type { ClaudeBlock, ClaudeMessage } from '@shared/types'
import { buildMarkdown, exportFileName, toolDetail } from './exportMarkdown'

const at = new Date(2026, 9, 17, 9, 5)
let n = 0
const msg = (role: 'user' | 'assistant', blocks: ClaudeBlock[], parent: string | null = null): ClaudeMessage => ({
  uuid: `u${n++}`,
  role,
  blocks,
  parentToolUseId: parent
})
const text = (t: string): ClaudeBlock => ({ type: 'text', text: t })
const tool = (id: string, name: string, input: unknown): ClaudeBlock => ({
  type: 'toolUse',
  toolUseId: id,
  name,
  input
})
const result = (id: string, content: string, isError = false): ClaudeBlock => ({
  type: 'toolResult',
  toolUseId: id,
  content,
  isError
})

describe('buildMarkdown', () => {
  it('generates title, date and Você/Claude sections', () => {
    const md = buildMarkdown({
      title: 'Pix at checkout',
      exportedAt: at,
      messages: [msg('user', [text('Hi')]), msg('assistant', [text('Hello!')])]
    })
    expect(md).toBe('# Pix at checkout\n\n_Exportada em 2026-10-17 09:05_\n\n## Você\n\nHi\n\n## Claude\n\nHello!\n')
  })

  it('summarizes tools in one line, marks errors and omits result and thinking', () => {
    const md = buildMarkdown({
      title: 't',
      exportedAt: at,
      messages: [
        msg('user', [text('run the tests')]),
        msg('assistant', [
          { type: 'thinking', text: 'secret' },
          text('Running.'),
          tool('a', 'Bash', { command: 'npm test\nfoo' })
        ]),
        msg('user', [result('a', 'LOTS OF OUTPUT', true)]),
        msg('assistant', [tool('b', 'Edit', { file_path: 'src/a.ts' }), tool('c', 'Read', { file_path: 'b.ts' })]),
        msg('user', [result('b', 'ok'), result('c', 'ok')]),
        msg('assistant', [text('Done.')])
      ]
    })
    expect(md).toContain('> Bash: npm test foo (erro)')
    expect(md).toContain('> Edit: src/a.ts\n>\n> Read: b.ts')
    expect(md).not.toContain('LOTS OF OUTPUT')
    expect(md).not.toContain('secret')
    // Tool results (`user` messages) do not open a "Você" section.
    expect(md.match(/## Você/g)).toHaveLength(1)
    expect(md.match(/## Claude/g)).toHaveLength(1)
  })

  it('omits subagents, replaces an image with [imagem] and ignores injected context', () => {
    const md = buildMarkdown({
      title: 't',
      exportedAt: at,
      messages: [
        msg('user', [
          text('look'),
          { type: 'image', mediaType: 'image/png', data: 'AAAA' },
          text('<ide_selection>x</ide_selection>')
        ]),
        msg('assistant', [text('subagent speech')], 'toolu_1'),
        msg('assistant', [text('end')])
      ]
    })
    expect(md).toContain('[imagem]')
    expect(md).not.toContain('AAAA')
    expect(md).not.toContain('ide_selection')
    expect(md).not.toContain('subagent')
  })

  it('user text starting with "> " does not become a tool', () => {
    const md = buildMarkdown({
      title: 't',
      exportedAt: at,
      messages: [msg('user', [text('> quote'), text('other')])]
    })
    expect(md).toContain('> quote\n\nouter'.replace('outer', 'other'))
  })
})

describe('toolDetail', () => {
  it('picks the right field per tool', () => {
    expect(toolDetail('Grep', { pattern: 'foo', path: 'x' })).toBe('foo')
    expect(toolDetail('Agent', { description: 'Research', prompt: 'long' })).toBe('Research')
    expect(toolDetail('mcp__x__y', { query: 'q' })).toBe('q')
    expect(toolDetail('Bash', null)).toBe('')
  })
})

describe('exportFileName', () => {
  it('sanitizes invalid characters and appends .md', () => {
    expect(exportFileName('Pix: at/checkout?')).toBe('Pix- at-checkout.md')
    expect(exportFileName('   ')).toBe('conversa.md')
    expect(exportFileName('CON')).toBe('_CON.md')
    expect(exportFileName('../../x')).toBe('x.md')
    expect(exportFileName('a'.repeat(300)).length).toBeLessThanOrEqual(83)
  })
})
