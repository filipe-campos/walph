import { describe, expect, it } from 'vitest'
import type { ClaudeMessage } from '@shared/types'
import { createDormantConversation, type ClaudeConversation } from './claudeConversation'
import { sameSessionFields, sessionClaudeTabs } from './claudeSessionTabs'

describe('Claude tabs in the workspace session', () => {
  const defaults = { permissionMode: 'default' as const, model: '' }
  const conv = (id: string, patch: Partial<ClaudeConversation> = {}): ClaudeConversation => {
    const { dormant: _dormant, ...awake } = createDormantConversation({ sessionId: id }, id, defaults)
    return { ...awake, ...patch }
  }

  it('keeps only tabs with a resumable session or a draft, and the active one', () => {
    const msg = { uuid: 'm', role: 'user', blocks: [] } as unknown as ClaudeMessage
    const list = [
      conv('a', { sessionId: 'sa', messages: [msg], title: 'Primeira', model: 'opus', effort: 'high' }),
      conv('b', { sessionId: 'sb', messages: [] }),
      conv('c', { sessionId: null, messages: [] }),
      conv('d', { sessionId: null, messages: [] })
    ]
    const drafts: Record<string, string> = { c: 'rascunho' }
    const { tabs, active } = sessionClaudeTabs(list, 'c', (id) => drafts[id] ?? '')
    expect(tabs).toEqual([
      { sessionId: 'sa', title: 'Primeira', model: 'opus', permissionMode: 'default', effort: 'high' },
      { permissionMode: 'default', draft: 'rascunho' }
    ])
    expect(active).toBe(1)
  })

  it('a dormant tab keeps the session even without loaded messages and bypass becomes default', () => {
    const dormant = createDormantConversation(
      { sessionId: 's1', title: 'T', permissionMode: 'plan' },
      'dormant:1',
      defaults
    )
    const { tabs } = sessionClaudeTabs([dormant], 'dormant:1', () => '')
    expect(tabs).toEqual([{ sessionId: 's1', title: 'T', permissionMode: 'plan' }])
    const risky = { ...dormant, permissionMode: 'bypassPermissions' as const }
    expect(sessionClaudeTabs([risky], null, () => '').tabs[0].permissionMode).toBe('default')
  })

  it('createDormantConversation uses the defaults when the tab brings no model/mode', () => {
    const c = createDormantConversation({ draft: 'x' }, 'dormant:2', { permissionMode: 'auto', model: 'm' })
    expect(c).toMatchObject({ dormant: true, sessionId: null, model: 'm', permissionMode: 'auto', status: 'idle' })
  })
})

describe('sameSessionFields', () => {
  const conv = (patch: Partial<ClaudeConversation> = {}): ClaudeConversation => ({
    ...createDormantConversation({ sessionId: 's' }, 'c', { permissionMode: 'default', model: '' }),
    ...patch
  })
  const msg = { uuid: 'm', role: 'user', blocks: [] } as unknown as ClaudeMessage

  it('a streaming delta (non-persisted fields) does not count', () => {
    const a = conv({ messages: [msg] })
    const b = { ...a, streaming: [{} as never], costUsd: 1, agentStatus: 'running' as const }
    expect(sameSessionFields([a], [b])).toBe(true)
  })

  it('more messages, but still "has a message", does not count', () => {
    const a = conv({ messages: [msg] })
    expect(sameSessionFields([a], [{ ...a, messages: [msg, msg] }])).toBe(true)
  })

  it('a changed persisted field counts', () => {
    const a = conv()
    expect(sameSessionFields([a], [{ ...a, title: 'Outro' }])).toBe(false)
    expect(sameSessionFields([a], [{ ...a, sessionId: 'x' }])).toBe(false)
    expect(sameSessionFields([a], [{ ...a, permissionMode: 'plan' }])).toBe(false)
    expect(sameSessionFields([a], [{ ...a, messages: [msg] }])).toBe(false)
  })

  it('order and count count', () => {
    const a = conv({ id: 'a' })
    const b = conv({ id: 'b' })
    expect(sameSessionFields([a, b], [b, a])).toBe(false)
    expect(sameSessionFields([a], [a, b])).toBe(false)
  })
})
