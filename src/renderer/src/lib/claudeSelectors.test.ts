import { describe, expect, it } from 'vitest'
import type { ClaudeConversation } from './claudeConversation'
import { selectActiveConversation, selectConversation } from './claudeSelectors'

const a = { id: 'a', title: 'A' } as ClaudeConversation
const b = { id: 'b', title: 'B' } as ClaudeConversation
const state = (activeId: string | null) => ({ claude: { conversations: [a, b], activeId } })

describe('selectConversation', () => {
  it('returns the same conversation reference', () => {
    expect(selectConversation('b')(state('a'))).toBe(b)
  })

  it('an unknown, null or undefined id finds nothing', () => {
    expect(selectConversation('x')(state('a'))).toBeUndefined()
    expect(selectConversation(null)(state('a'))).toBeUndefined()
    expect(selectConversation(undefined)(state('a'))).toBeUndefined()
  })
})

describe('selectActiveConversation', () => {
  it('follows the activeId', () => {
    expect(selectActiveConversation(state('a'))).toBe(a)
    expect(selectActiveConversation(state('b'))).toBe(b)
  })

  it('without an active conversation returns undefined', () => {
    expect(selectActiveConversation(state(null))).toBeUndefined()
  })
})
