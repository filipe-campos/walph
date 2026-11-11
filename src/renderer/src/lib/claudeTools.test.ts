import { describe, expect, it } from 'vitest'
import { parseMcpName, summarizeTool, toolInputText } from './claudeTools'

describe('summarizeTool', () => {
  it('Bash shows the first line of the command', () => {
    expect(summarizeTool('Bash', { command: 'npm test\nsecond' })).toMatchObject({
      icon: 'terminal',
      title: 'Bash',
      detail: 'npm test'
    })
  })
  it('files become a relative path and keep the original', () => {
    expect(summarizeTool('Edit', { file_path: '/w/p/src/a.ts' }, '/w/p')).toEqual({
      icon: 'edit',
      title: 'Editar',
      detail: 'src/a.ts',
      path: '/w/p/src/a.ts'
    })
    expect(summarizeTool('Read', { file_path: '/outro/x.ts' }, '/w/p').detail).toBe('/outro/x.ts')
  })
  it('search, web, subagent and todos', () => {
    expect(summarizeTool('Grep', { pattern: 'foo' }).detail).toBe('foo')
    expect(summarizeTool('WebFetch', { url: 'https://x.dev' }).title).toBe('Acessar página')
    expect(summarizeTool('Task', { description: 'Explorar' }).detail).toBe('Explorar')
    expect(summarizeTool('TodoWrite', { todos: [1, 2] }).detail).toBe('2 itens')
    expect(summarizeTool('TodoWrite', { todos: [1] }).detail).toBe('1 item')
  })
  it('MCP and unknown ones', () => {
    expect(summarizeTool('mcp__walph__getDiagnostics', {})).toMatchObject({ title: 'getDiagnostics', detail: 'walph' })
    expect(summarizeTool('Qualquer', { a: 1 })).toMatchObject({ title: 'Qualquer', detail: '{"a":1}' })
    expect(parseMcpName('Bash')).toBeNull()
  })
  it('malformed input does not break', () => {
    expect(summarizeTool('Bash', null).detail).toBe('')
    expect(summarizeTool('Edit', 'text').detail).toBe('')
    expect(summarizeTool('Qualquer', undefined).title).toBe('Qualquer')
  })
  it('truncates long details', () => {
    expect(summarizeTool('Bash', { command: 'x'.repeat(500) }).detail).toHaveLength(160)
  })

  it('summarizes AskUserQuestion by the headers and tolerates malformed input', () => {
    const input = { questions: [{ header: 'Lib' }, { header: '' }, { header: 'Banco' }, 7] }
    expect(summarizeTool('AskUserQuestion', input)).toEqual({
      icon: 'question',
      title: 'Perguntou',
      detail: 'Lib, Banco'
    })
    expect(summarizeTool('AskUserQuestion', { questions: 'x' }).detail).toBe('')
    expect(summarizeTool('AskUserQuestion', null).detail).toBe('')
  })
})

describe('toolInputText', () => {
  it('Bash shows only the command and JSON is indented', () => {
    expect(toolInputText('Bash', { command: 'ls' })).toBe('ls')
    expect(toolInputText('Grep', { pattern: 'a' })).toBe('{\n  "pattern": "a"\n}')
  })
  it('truncates huge inputs', () => {
    expect(toolInputText('Write', { content: 'x'.repeat(10_000) })).toContain('caracteres omitidos')
  })
})
