import { describe, expect, it } from 'vitest'
import { contextChipLabel, isTaskNoticeProblem, taskNoticeText } from './claudeContext'

describe('claudeContext', () => {
  it('chip label', () => {
    expect(contextChipLabel({ path: '/a/b/c.ts' })).toBe('c.ts')
    expect(contextChipLabel({ path: '/a/c.ts', startLine: 10, endLine: 10 })).toBe('c.ts:L10')
    expect(contextChipLabel({ path: '/a/c.ts', startLine: 10, endLine: 20 })).toBe('c.ts:L10-20')
    expect(contextChipLabel({ path: 'C:\\a\\c.ts', startLine: 3 })).toBe('c.ts:L3')
  })

  it('task notice', () => {
    expect(taskNoticeText(' build ok ')).toBe('Tarefa em segundo plano concluída: build ok')
    expect(taskNoticeText('')).toBe('Tarefa em segundo plano concluída')
    expect(taskNoticeText('x', 'failed')).toBe('Tarefa em segundo plano falhou: x')
    expect(taskNoticeText('', 'killed')).toBe('Tarefa em segundo plano interrompida')
    expect(taskNoticeText('x', 'completed')).toBe('Tarefa em segundo plano concluída: x')
    expect(isTaskNoticeProblem('failed')).toBe(true)
    expect(isTaskNoticeProblem('killed')).toBe(true)
    expect(isTaskNoticeProblem('completed')).toBe(false)
  })
})
