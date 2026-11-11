import { describe, expect, it } from 'vitest'
import { normalizeBackgroundTasks, sameBackgroundTasks } from './backgroundTasks'

describe('normalizeBackgroundTasks', () => {
  it('maps agents and commands, ignores ambient and malformed entries', () => {
    const tasks = normalizeBackgroundTasks([
      { task_id: 'a1', task_type: 'local_agent', subagent_type: 'backend-developer', description: 'Package 3.1' },
      { task_id: 's1', task_type: 'local_bash', subagent_type: 'x', description: 'npm test' },
      { task_id: 'w1', task_type: 'monitor', description: 'watches', ambient: true },
      { task_id: 'm1', task_type: 'local_workflow', description: 'spec' },
      { description: 'no id' },
      null,
      'garbage'
    ])
    expect(tasks).toEqual([
      { id: 'a1', kind: 'agent', description: 'Package 3.1', agentType: 'backend-developer' },
      { id: 's1', kind: 'shell', description: 'npm test', agentType: null },
      { id: 'm1', kind: 'other', description: 'spec', agentType: null }
    ])
  })

  it('text becomes a short line, without control characters', () => {
    const [task] = normalizeBackgroundTasks([
      { task_id: 'a1', task_type: 'local_agent', description: `line\n1\u001b[31m ${'x'.repeat(300)}` }
    ])
    expect(task.description.includes('\n') || task.description.includes('\u001b')).toBe(false)
    expect(task.description.length).toBeLessThanOrEqual(120)
    expect(task.description.endsWith('…')).toBe(true)
    expect(task.agentType).toBeNull()
  })

  it('a payload that is not a list becomes empty', () => {
    expect(normalizeBackgroundTasks(undefined)).toEqual([])
    expect(normalizeBackgroundTasks({ tasks: [] })).toEqual([])
  })

  it('sameBackgroundTasks compares content and order', () => {
    const a = normalizeBackgroundTasks([{ task_id: 'a1', task_type: 'local_agent', description: 'x' }])
    const b = normalizeBackgroundTasks([{ task_id: 'a1', task_type: 'local_agent', description: 'x' }])
    expect(sameBackgroundTasks(a, b)).toBe(true)
    expect(sameBackgroundTasks(a, [])).toBe(false)
  })
})
