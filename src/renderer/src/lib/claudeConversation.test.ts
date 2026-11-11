import { describe, expect, it } from 'vitest'
import {
  backgroundLabel,
  createConversation,
  createDormantConversation,
  loadStep,
  setUserTitle,
  type ClaudeConversation
} from './claudeConversation'

const base = (): ClaudeConversation =>
  createConversation({ id: 'c1', messages: [], favorite: false }, { permissionMode: 'default', model: '' })

describe('user title', () => {
  it('without a known automatic one falls back to the default title', () => {
    expect(setUserTitle(setUserTitle(base(), 'X'), null).title).toBe('Nova conversa')
  })
})

describe('background tasks label', () => {
  const agent = { id: 'a1', kind: 'agent' as const, description: 'Package 3.1', agentType: 'backend-developer' }
  const shell = { id: 's1', kind: 'shell' as const, description: 'npm test', agentType: null }

  it('backgroundLabel counts by kind', () => {
    expect(backgroundLabel([agent])).toBe('1 agente em segundo plano')
    expect(backgroundLabel([agent, { ...agent, id: 'a2' }, { ...agent, id: 'a3' }])).toBe('3 agentes em segundo plano')
    expect(backgroundLabel([agent, agent, shell, { ...shell, kind: 'other' }])).toBe(
      '2 agentes, 1 comando e 1 tarefa em segundo plano'
    )
  })
})

describe('dormant tab loading', () => {
  it('dormant tab: waking spins, failure does not', () => {
    const dormant = createDormantConversation({ sessionId: 's', title: 't' }, 'dormant:1', {
      permissionMode: 'default',
      model: ''
    })
    expect(loadStep({ ...dormant, wakeState: 'waking' })).toBe('wake')
    expect(loadStep({ ...dormant, wakeState: 'failed' })).toBeNull()
  })
})
