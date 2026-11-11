import { describe, expect, it } from 'vitest'
import type { ClaudeBlock, ClaudeMessage } from '@shared/types'
import {
  agentElapsed,
  agentsHeadline,
  createAgentTimes,
  forgetAgentTimes,
  formatElapsed,
  recordAgentTimes,
  turnAgents
} from './claudeAgents'

let seq = 0
const msg = (role: 'user' | 'assistant', blocks: ClaudeBlock[], parent: string | null = null): ClaudeMessage => ({
  uuid: `m${++seq}`,
  role,
  blocks,
  parentToolUseId: parent
})
const user = (text: string) => msg('user', [{ type: 'text', text }])
const use = (toolUseId: string, name: string, input: unknown): ClaudeBlock => ({
  type: 'toolUse',
  toolUseId,
  name,
  input
})
const res = (toolUseId: string, isError = false): ClaudeBlock => ({
  type: 'toolResult',
  toolUseId,
  content: 'x',
  isError
})

describe('turnAgents', () => {
  it('lists the turn Agent/Task with name, task and status', () => {
    const times = createAgentTimes()
    const messages = [
      user('antigo'),
      msg('assistant', [use('old', 'Agent', { description: 'velho' })]),
      user('novo'),
      msg('assistant', [
        use('a1', 'Agent', { subagent_type: 'Explore', description: 'Mapear rotas', prompt: 'x' }),
        use('a2', 'Task', { prompt: 'First line\nsecond' }),
        use('a3', 'Agent', { subagent_type: 'Plan', description: 'Planejar' }),
        use('r', 'Read', {})
      ]),
      msg('user', [res('a1'), res('a3', true)])
    ]
    expect(turnAgents(messages, times, true)).toEqual([
      { toolUseId: 'a1', name: 'Explore', task: 'Mapear rotas', status: 'done', startedAt: null, finishedAt: null },
      { toolUseId: 'a2', name: 'Agente', task: 'First line', status: 'running', startedAt: null, finishedAt: null },
      { toolUseId: 'a3', name: 'Plan', task: 'Planejar', status: 'failed', startedAt: null, finishedAt: null }
    ])
  })

  it('no result and stopped conversation = interrupted; subagents of subagents are left out; no agents = empty', () => {
    const messages = [
      user('x'),
      msg('assistant', [use('a1', 'Agent', { description: 'A' })]),
      msg('assistant', [use('a2', 'Agent', { description: 'B' })], 'a1')
    ]
    const rows = turnAgents(messages, createAgentTimes(), false)
    expect(rows.map((r) => [r.toolUseId, r.status])).toEqual([['a1', 'stopped']])
    expect(turnAgents([user('x'), msg('assistant', [use('r', 'Read', {})])], createAgentTimes(), true)).toEqual([])
  })

  it('uses the recorded times', () => {
    const times = createAgentTimes()
    const first = msg('assistant', [use('a1', 'Agent', { description: 'A' })])
    const second = msg('user', [res('a1')])
    recordAgentTimes(times, first, 1000)
    recordAgentTimes(times, first, 5000) // redelivery does not change the start
    recordAgentTimes(times, second, 9000)
    recordAgentTimes(times, msg('user', [res('desconhecido')]), 9500)
    const [row] = turnAgents([user('x'), first, second], times, false)
    expect(row).toMatchObject({ startedAt: 1000, finishedAt: 9000, status: 'done' })
    expect(times.finished.has('desconhecido')).toBe(false)
    expect(agentElapsed(row, 99999)).toBe(8000)
    forgetAgentTimes(times, [first, second])
    expect(times.started.size + times.finished.size).toBe(0)
  })
})

describe('agentElapsed / formatElapsed / agentsHeadline', () => {
  const base = { toolUseId: 'a', name: 'n', task: 't', finishedAt: null }
  it('running uses the current clock; without a time there is no duration', () => {
    expect(agentElapsed({ ...base, status: 'running', startedAt: 1000 }, 4500)).toBe(3500)
    expect(agentElapsed({ ...base, status: 'running', startedAt: 5000 }, 4500)).toBe(0)
    expect(agentElapsed({ ...base, status: 'running', startedAt: null }, 4500)).toBeNull()
    expect(agentElapsed({ ...base, status: 'stopped', startedAt: 1000 }, 4500)).toBeNull()
  })

  it('formats the duration', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(8900)).toBe('8s')
    expect(formatElapsed(65_000)).toBe('1m 05s')
    expect(formatElapsed(3_720_000)).toBe('1h 02m')
  })

  it('strip title only with what has a count', () => {
    const row = (status: 'running' | 'done' | 'failed' | 'stopped') => ({ ...base, status, startedAt: null })
    expect(agentsHeadline([row('running'), row('running'), row('done')])).toBe('Agentes · 2 trabalhando · 1 concluído')
    expect(agentsHeadline([row('done'), row('done'), row('failed'), row('stopped')])).toBe(
      'Agentes · 2 concluídos · 1 falhou · 1 interrompido'
    )
  })
})
