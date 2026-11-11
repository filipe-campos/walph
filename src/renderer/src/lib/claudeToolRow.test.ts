import { describe, expect, it } from 'vitest'
import { MAX_DETAIL_LINES, toolRowView } from './claudeToolRow'

const ok = (content: string) => ({ content, isError: false })

describe('toolRowView', () => {
  it('icon and past-tense verb per tool', () => {
    const cases: [string, string, string][] = [
      ['Read', 'eye', 'Leu'],
      ['Write', 'filePlus', 'Criou'],
      ['Edit', 'pencil', 'Editou'],
      ['MultiEdit', 'pencil', 'Editou'],
      ['Bash', 'terminal', 'Bash'],
      ['Grep', 'search', 'Buscou'],
      ['Glob', 'folder', 'Listou'],
      ['WebFetch', 'globe', 'Abriu'],
      ['WebSearch', 'globe', 'Pesquisou'],
      ['Task', 'agent', 'Agente'],
      ['TodoWrite', 'plan', 'Tarefas'],
      ['AskUserQuestion', 'question', 'Perguntou']
    ]
    for (const [name, icon, label] of cases) expect(toolRowView(name, {}, null)).toMatchObject({ icon, label })
  })

  it('an unknown tool uses bolt and its own name; MCP shows the tool and the server', () => {
    expect(toolRowView('Coisa', { a: 1 }, null)).toMatchObject({ icon: 'bolt', label: 'Coisa' })
    expect(toolRowView('mcp__github__list', { owner: 'x' }, null)).toMatchObject({
      icon: 'bolt',
      label: 'list',
      target: 'github'
    })
    // With a file path, the target (the link text) is the file.
    expect(toolRowView('mcp__x__ler', { path: '/r/a.ts' }, null, '/r')).toMatchObject({
      target: 'a.ts',
      path: '/r/a.ts'
    })
  })

  it('Read: relative path, line count and the read excerpt dimmed', () => {
    const view = toolRowView('Read', { file_path: '/repo/src/a.ts' }, ok('1\tum\n2\tdois\n'), '/repo')
    expect(view).toMatchObject({ target: 'src/a.ts', path: '/repo/src/a.ts', meta: '2 linhas' })
    expect(view.detail).toEqual([
      { text: '1\tum', kind: 'muted' },
      { text: '2\tdois', kind: 'muted' }
    ])
  })

  it('Bash: command with ❯ and the output; an error paints the output', () => {
    expect(toolRowView('Bash', { command: 'npm test' }, ok('PASS\n')).detail).toEqual([
      { text: 'npm test', kind: 'cmd' },
      { text: 'PASS', kind: undefined }
    ])
    expect(toolRowView('Bash', { command: 'x' }, { content: 'falhou', isError: true }).detail[1]).toEqual({
      text: 'falhou',
      kind: 'err'
    })
    expect(toolRowView('Bash', { command: 'x' }, ok('')).detail[1]).toEqual({ text: '(sem saída)', kind: 'muted' })
  })

  it('Edit: +N −N and the diff with context', () => {
    const view = toolRowView('Edit', { file_path: '/r/a.ts', old_string: 'a\nb\nc', new_string: 'a\nB\nB2\nc' }, null)
    expect(view.stat).toEqual({ add: 2, del: 1 })
    expect(view.detail).toEqual([
      { text: 'a', kind: 'ctx' },
      { text: 'b', kind: 'del' },
      { text: 'B', kind: 'add' },
      { text: 'B2', kind: 'add' },
      { text: 'c', kind: 'ctx' }
    ])
  })

  it('MultiEdit adds up the edits; Write counts the created lines', () => {
    const multi = toolRowView(
      'MultiEdit',
      {
        file_path: '/r/a.ts',
        edits: [
          { old_string: 'x', new_string: 'y' },
          { old_string: '', new_string: 'z\nw' }
        ]
      },
      null
    )
    expect(multi.stat).toEqual({ add: 3, del: 1 })
    expect(toolRowView('Write', { file_path: '/r/n.ts', content: 'a\nb\n' }, null).stat).toEqual({ add: 2, del: 0 })
  })

  it('Grep/Glob count the results', () => {
    expect(toolRowView('Grep', { pattern: 'foo' }, ok('a.ts\nb.ts\n')).meta).toBe('2 resultados')
    expect(toolRowView('Glob', { pattern: '*.md' }, ok('No files found')).meta).toBe('0 resultados')
    expect(toolRowView('Grep', { pattern: 'foo' }, null).meta).toBeUndefined()
  })

  it('question and answer; todos with the progress', () => {
    const q = toolRowView('AskUserQuestion', { questions: [{ question: 'Qual ORM?', header: 'ORM' }] }, ok('Prisma'))
    expect(q.detail).toEqual([
      { text: 'Qual ORM?', kind: 'q' },
      { text: 'Prisma', kind: 'a' }
    ])
    const todos = toolRowView(
      'TodoWrite',
      {
        todos: [
          { content: 'one', status: 'completed' },
          { content: 'two', status: 'pending' }
        ]
      },
      null
    )
    expect(todos.target).toBe('1 de 2 concluídas')
    expect(todos.detail.map((l) => l.text)).toEqual(['✓ one', '○ two'])
  })

  it('without withDetail it does not build the lines, but says whether the row expands', () => {
    const lazy = toolRowView('Read', { file_path: '/a' }, ok('x\ny'), null, false)
    expect(lazy).toMatchObject({ hasDetail: true, detail: [], meta: '2 linhas' })
    expect(toolRowView('Grep', { pattern: 'a' }, null, null, false).hasDetail).toBe(false)
    expect(toolRowView('Edit', { old_string: 'a', new_string: 'b' }, null, null, false)).toMatchObject({
      hasDetail: true,
      stat: { add: 1, del: 1 }
    })
  })

  it('malformed input does not break and the expanded area is capped', () => {
    expect(() => toolRowView('Edit', null, null)).not.toThrow()
    expect(() => toolRowView('TodoWrite', { todos: 'x' }, null)).not.toThrow()
    const big = toolRowView('Read', { file_path: '/a' }, ok(Array.from({ length: 1000 }, (_, i) => `l${i}`).join('\n')))
    expect(big.detail).toHaveLength(MAX_DETAIL_LINES + 1)
    expect(big.detail.at(-1)).toEqual({ text: '… 600 linhas omitidas', kind: 'muted' })
    expect(big.meta).toBe('1000 linhas')
  })
})
