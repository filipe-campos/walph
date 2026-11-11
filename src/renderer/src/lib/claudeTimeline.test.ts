import { describe, expect, it } from 'vitest'
import type { ClaudeEvent, ClaudeMessage } from '@shared/types'
import { createConversation, userText, type ClaudeConversation } from './claudeConversation'
import { reduceEvent } from './claudeReducer'
import { buildTimeline } from './claudeTimeline'

const base = (): ClaudeConversation =>
  createConversation({ id: 'c1', messages: [], favorite: false }, { permissionMode: 'default', model: '' })

const msg = (over: Partial<ClaudeMessage> & Pick<ClaudeMessage, 'uuid' | 'role' | 'blocks'>): ClaudeMessage => ({
  parentToolUseId: null,
  ...over
})
const apply = (conv: ClaudeConversation, ...events: ClaudeEvent[]): ClaudeConversation =>
  events.reduce(reduceEvent, conv)

describe('buildTimeline', () => {
  it('attaches the result to the tool and hides user context blocks', () => {
    const messages: ClaudeMessage[] = [
      msg({
        uuid: 'u1',
        role: 'user',
        checkpoint: true,
        blocks: [
          { type: 'text', text: 'run the tests' },
          { type: 'text', text: '<ide_opened_file>a.ts</ide_opened_file>' }
        ]
      }),
      msg({
        uuid: 'a1',
        role: 'assistant',
        blocks: [
          { type: 'thinking', text: 'hum' },
          { type: 'toolUse', toolUseId: 't1', name: 'Bash', input: { command: 'npm test' } }
        ]
      }),
      msg({
        uuid: 'u2',
        role: 'user',
        blocks: [{ type: 'toolResult', toolUseId: 't1', content: 'ok', isError: false }]
      }),
      msg({ uuid: 'a2', role: 'assistant', blocks: [{ type: 'text', text: 'Passou.' }] })
    ]
    const items = buildTimeline(messages)
    expect(items.map((i) => i.type)).toEqual(['user', 'thinking', 'tool', 'text'])
    expect(items[0]).toMatchObject({ text: 'run the tests', checkpoint: true })
    expect(items[2]).toMatchObject({ result: { content: 'ok', isError: false } })
  })

  it('a subagent gets depth 1 and its user messages disappear', () => {
    const items = buildTimeline([
      msg({ uuid: 'a1', role: 'assistant', parentToolUseId: 'p', blocks: [{ type: 'text', text: 'sub' }] }),
      msg({ uuid: 'u1', role: 'user', parentToolUseId: 'p', blocks: [{ type: 'text', text: 'agent prompt' }] })
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'text', depth: 1 })
  })

  it('userText ignores an image and empty text', () => {
    expect(
      userText(msg({ uuid: 'u', role: 'user', blocks: [{ type: 'image', mediaType: 'image/png', data: '' }] }))
    ).toBe('')
  })
})

describe('buildTimeline - times, end of turn and notices', () => {
  const user = (uuid: string, timestamp?: number): ClaudeMessage =>
    msg({
      uuid,
      role: 'user',
      checkpoint: true,
      blocks: [{ type: 'text', text: `pergunta ${uuid}` }],
      ...(timestamp !== undefined && { timestamp })
    })
  const reply = (uuid: string, text: string, timestamp?: number): ClaudeMessage =>
    msg({ uuid, role: 'assistant', blocks: [{ type: 'text', text }], ...(timestamp !== undefined && { timestamp }) })

  it('carries the message time and omits it when there is none', () => {
    const items = buildTimeline([user('u1', 1000), user('u2'), reply('a1', 'oi', 2000)])
    expect(items[0]).toMatchObject({ type: 'user', timestamp: 1000 })
    expect('timestamp' in items[1]).toBe(false)
    expect(items[2]).toMatchObject({ type: 'text', timestamp: 2000 })
  })

  it('marks only the last text of each turn', () => {
    const items = buildTimeline([
      user('u1'),
      reply('a1', 'vou olhar'),
      msg({
        uuid: 'a2',
        role: 'assistant',
        blocks: [{ type: 'toolUse', toolUseId: 't1', name: 'Read', input: {} }]
      }),
      reply('a3', 'pronto'),
      user('u2'),
      reply('a4', 'second reply')
    ])
    const texts = items.filter((i) => i.type === 'text')
    expect(texts.map((t) => t.type === 'text' && [t.text, t.turnEnd, t.lastTurn])).toEqual([
      ['vou olhar', false, false],
      ['pronto', true, false],
      ['second reply', true, true]
    ])
  })

  it('subagent text (depth 1) does not end the turn', () => {
    const items = buildTimeline([
      user('u1'),
      reply('a1', 'reply'),
      msg({
        uuid: 'a2',
        role: 'assistant',
        parentToolUseId: 'toolX',
        blocks: [{ type: 'text', text: 'from the agent' }]
      })
    ])
    const flags = items.filter((i) => i.type === 'text').map((t) => t.type === 'text' && t.turnEnd)
    expect(flags).toEqual([true, false])
  })

  it('the result object of a tool is the same across rebuilds', () => {
    const messages = [
      msg({ uuid: 'a1', role: 'assistant', blocks: [{ type: 'toolUse', toolUseId: 't1', name: 'Bash', input: {} }] }),
      msg({
        uuid: 'r1',
        role: 'user',
        blocks: [{ type: 'toolResult', toolUseId: 't1', content: 'ok', isError: false }]
      })
    ]
    const first = buildTimeline(messages)[0]
    const second = buildTimeline([...messages, reply('a2', 'fim')])[0]
    expect(first.type === 'tool' && second.type === 'tool' && first.result === second.result).toBe(true)
    expect(first.type === 'tool' && first.result).toEqual({ content: 'ok', isError: false })
  })

  it('interleaves command output and compaction marker by position', () => {
    let conv = apply(base(), {
      type: 'message',
      id: 'c1',
      message: user('u1', 1)
    })
    conv = apply(
      conv,
      { type: 'commandOutput', id: 'c1', text: 'Custo: $0,10', timestamp: 5 },
      { type: 'compacted', id: 'c1', trigger: 'auto', preTokens: 150_000, timestamp: 6 },
      { type: 'message', id: 'c1', message: reply('a1', 'after', 7) }
    )
    const items = buildTimeline(conv.messages, conv.notes)
    expect(items.map((i) => i.type)).toEqual(['user', 'commandOutput', 'compacted', 'text'])
    expect(items[1]).toMatchObject({ type: 'commandOutput', text: 'Custo: $0,10', timestamp: 5 })
    expect(items[2]).toMatchObject({ type: 'compacted', trigger: 'auto', preTokens: 150_000 })
    // The notices close the previous turn: the reply after them is another turn.
    expect(items[3]).toMatchObject({ type: 'text', turnEnd: true, lastTurn: true })
  })

  it('a notice at the start of the conversation stays before the messages', () => {
    const conv = apply(base(), { type: 'commandOutput', id: 'c1', text: 'x', timestamp: 1 })
    const items = buildTimeline([user('u1')], conv.notes)
    expect(items.map((i) => i.type)).toEqual(['commandOutput', 'user'])
  })

  it('an automatic turn (/loop) gets a marker and separates the reply from the previous turn', () => {
    let conv = apply(base(), { type: 'message', id: 'c1', message: user('u1') })
    conv = apply(
      conv,
      { type: 'message', id: 'c1', message: reply('a1', 'agendei', 2) },
      { type: 'autoTurn', id: 'c1', reason: 'scheduled', timestamp: 3 },
      { type: 'message', id: 'c1', message: reply('a2', 'tick', 4) }
    )
    const items = buildTimeline(conv.messages, conv.notes)
    expect(items.map((i) => i.type)).toEqual(['user', 'text', 'autoTurn', 'text'])
    expect(items[1]).toMatchObject({ text: 'agendei', turnEnd: true, lastTurn: false })
    expect(items[2]).toMatchObject({ type: 'autoTurn', reason: 'scheduled', timestamp: 3 })
    expect(items[3]).toMatchObject({ text: 'tick', turnEnd: true, lastTurn: true })
  })
})

describe('special messages in the timeline', () => {
  it('taskNotification becomes a note, without a user bubble', () => {
    const items = buildTimeline([
      msg({
        uuid: 'n1',
        role: 'user',
        blocks: [{ type: 'text', text: 'build ok' }],
        taskNotification: { status: 'completed', summary: 'build ok' }
      })
    ])
    expect(items).toEqual([{ type: 'taskNotice', key: 'n1', status: 'completed', summary: 'build ok' }])
  })

  it('a notice with typed text alongside shows the note and the message', () => {
    const items = buildTimeline([
      msg({
        uuid: 'n2',
        role: 'user',
        checkpoint: true,
        blocks: [{ type: 'text', text: 'continue por favor' }],
        taskNotification: { status: 'failed', summary: 'build quebrou' }
      })
    ])
    expect(items.map((i) => i.type)).toEqual(['taskNotice', 'user'])
  })

  it('userText drops <task-notification> and the message carries the context', () => {
    expect(
      userText(
        msg({ uuid: 'u', role: 'user', blocks: [{ type: 'text', text: '<task-notification>x</task-notification>' }] })
      )
    ).toBe('')
    const [item] = buildTimeline([
      msg({
        uuid: 'u2',
        role: 'user',
        checkpoint: true,
        blocks: [{ type: 'text', text: 'oi' }],
        context: { path: '/a/b.ts', startLine: 2, endLine: 4 }
      })
    ])
    expect(item).toMatchObject({ type: 'user', context: { path: '/a/b.ts', startLine: 2, endLine: 4 } })
  })
})
