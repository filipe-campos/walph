import { describe, expect, it } from 'vitest'
import { normalizeContent, normalizeMessage, streamDelta, toolResultText } from './normalizeMessage'
import { MAX_TOOL_RESULT_CHARS } from './textLimits'

describe('toolResultText', () => {
  it('accepts a string, a list of blocks and garbage', () => {
    expect(toolResultText('a')).toBe('a')
    expect(toolResultText([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe(
      'a\n[imagem]\nb'
    )
    expect(toolResultText(42)).toBe('')
  })
})

describe('normalizeMessage', () => {
  it('assistant: text, thinking and tool', () => {
    const m = normalizeMessage({
      type: 'assistant',
      uuid: 'u1',
      parent_tool_use_id: null,
      message: {
        content: [
          { type: 'thinking', thinking: 'hmm', signature: 's' },
          { type: 'text', text: 'hello' },
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
          { type: 'redacted_thinking', data: 'x' }
        ]
      }
    })
    expect(typeof m?.timestamp).toBe('number')
    expect(m).toEqual({
      timestamp: m?.timestamp,
      uuid: 'u1',
      role: 'assistant',
      parentToolUseId: null,
      blocks: [
        { type: 'thinking', text: 'hmm' },
        { type: 'text', text: 'hello' },
        { type: 'toolUse', toolUseId: 't1', name: 'Bash', input: { command: 'ls' } }
      ]
    })
  })

  it('user with a tool result is not a checkpoint', () => {
    const m = normalizeMessage({
      type: 'user',
      uuid: 'u2',
      parent_tool_use_id: null,
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'output', is_error: true }] }
    })
    expect(m?.blocks).toEqual([{ type: 'toolResult', toolUseId: 't1', content: 'output', isError: true }])
    expect(m?.checkpoint).toBeUndefined()
  })

  it('typed user message is a checkpoint and loses the injected context', () => {
    const m = normalizeMessage(
      {
        type: 'user',
        uuid: 'u3',
        parent_tool_use_id: null,
        message: {
          content: [
            { type: 'text', text: 'explain' },
            { type: 'text', text: '<ide_opened_file>The user opened…</ide_opened_file>' },
            { type: 'text', text: '<system-reminder>x</system-reminder>' }
          ]
        }
      },
      { history: true }
    )
    expect(m?.blocks).toEqual([{ type: 'text', text: 'explain' }])
    expect(m?.checkpoint).toBe(true)
  })

  it('string content and subagent message', () => {
    const m = normalizeMessage({ type: 'user', uuid: 'u4', parent_tool_use_id: 'tool-9', message: { content: 'hi' } })
    expect(m).toMatchObject({ parentToolUseId: 'tool-9', blocks: [{ type: 'text', text: 'hi' }] })
    expect(m?.checkpoint).toBeUndefined()
  })

  it('drops what cannot be shown', () => {
    expect(normalizeMessage({ type: 'system', uuid: 'x', message: {} })).toBeNull()
    expect(normalizeMessage({ type: 'user', message: { content: 'a' } })).toBeNull()
    expect(normalizeMessage({ type: 'user', uuid: 'x', message: { content: [{ type: 'weird' }] } })).toBeNull()
    expect(normalizeMessage({ type: 'user', uuid: 'x', message: null })).toBeNull()
  })

  it('truncates the tool output', () => {
    const m = normalizeMessage({
      type: 'user',
      uuid: 'u5',
      message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'y'.repeat(MAX_TOOL_RESULT_CHARS * 2) }] }
    })
    const block = m?.blocks[0]
    expect(block?.type === 'toolResult' && block.content.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 100)
  })

  it('base64 image passes; other sources do not', () => {
    expect(
      normalizeContent([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } }], 'user')
    ).toEqual([{ type: 'image', mediaType: 'image/png', data: 'AA' }])
    expect(normalizeContent([{ type: 'image', source: { type: 'url', url: 'x' } }], 'user')).toEqual([])
  })
})

describe('streamDelta', () => {
  it('extracts text and thinking', () => {
    expect(streamDelta({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'a' } })).toEqual({
      index: 1,
      kind: 'text',
      text: 'a'
    })
    expect(
      streamDelta({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'b' } })
    ).toEqual({ index: 0, kind: 'thinking', text: 'b' })
  })
  it('ignores input_json_delta and events of other types', () => {
    expect(
      streamDelta({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{' } })
    ).toBeNull()
    expect(streamDelta({ type: 'message_start' })).toBeNull()
    expect(streamDelta(null)).toBeNull()
  })
})

describe('timestamp', () => {
  const raw = (timestamp: unknown) => ({
    type: 'user',
    uuid: 'u',
    timestamp,
    message: { content: 'hi' }
  })
  it('history uses the transcript ISO; invalid or out of range is omitted', () => {
    expect(normalizeMessage(raw('2026-01-02T03:04:05.000Z'), { history: true })?.timestamp).toBe(
      Date.parse('2026-01-02T03:04:05.000Z')
    )
    for (const bad of ['garbage', 123, undefined, '1970-01-01T00:00:00Z', '2999-01-01T00:00:00Z']) {
      expect(normalizeMessage(raw(bad), { history: true })).not.toHaveProperty('timestamp')
    }
  })
  it('live uses the local clock, ignoring the CLI one', () => {
    const ts = normalizeMessage(raw('2020-01-01T00:00:00Z'))?.timestamp
    expect(ts).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'))
  })
})

describe('command wrappers in history', () => {
  it('vanish from history (no bubble nor checkpoint) but stay live as plain text', () => {
    const raw = { type: 'user', uuid: 'u', message: { content: '<command-name>/cost</command-name>' } }
    expect(normalizeMessage(raw, { history: true })).toBeNull()
    expect(
      normalizeMessage(
        { ...raw, message: { content: [{ type: 'text', text: '<local-command-stdout>x</local-command-stdout>' }] } },
        { history: true }
      )
    ).toBeNull()
  })
})

describe('normalizeMessage: task notification and context', () => {
  const sample =
    '<task-notification><task-id>x</task-id><status>completed</status><summary>Agent "Re-review" finished</summary><result>' +
    'long '.repeat(300) +
    '</result></task-notification>'

  it('history: task notification becomes a note, not a user bubble', () => {
    const m = normalizeMessage(
      { type: 'user', uuid: 'n1', message: { role: 'user', content: sample }, timestamp: '2026-01-02T03:04:05Z' },
      { history: true }
    )
    expect(m).toEqual({
      uuid: 'n1',
      role: 'user',
      blocks: [{ type: 'text', text: 'Agent "Re-review" finished' }],
      parentToolUseId: null,
      taskNotification: { status: 'completed', summary: 'Agent "Re-review" finished' },
      timestamp: Date.parse('2026-01-02T03:04:05Z')
    })
    expect(m?.checkpoint).toBeUndefined()
  })

  it('notification in a list of blocks too', () => {
    const m = normalizeMessage(
      { type: 'user', uuid: 'n2', message: { content: [{ type: 'text', text: sample }] } },
      { history: true }
    )
    expect(m?.taskNotification?.status).toBe('completed')
  })

  it('text typed along with the notice is still the user message, with the note attached', () => {
    const m = normalizeMessage(
      {
        type: 'user',
        uuid: 'n3',
        message: {
          content: [
            { type: 'text', text: 'what now?' },
            { type: 'text', text: sample }
          ]
        }
      },
      { history: true }
    )
    expect(m?.blocks).toEqual([{ type: 'text', text: 'what now?' }])
    expect(m?.checkpoint).toBe(true)
    expect(m?.taskNotification).toEqual({ status: 'completed', summary: 'Agent "Re-review" finished' })
  })

  it('the editor context leaves the text and goes to `context`', () => {
    const m = normalizeMessage(
      {
        type: 'user',
        uuid: 'c1',
        message: {
          content: [
            { type: 'text', text: 'explain' },
            { type: 'text', text: '<ide_selection>The user selected lines 2 to 4 from /p/a.ts:\nx</ide_selection>' },
            { type: 'text', text: '<ide_opened_file>The user opened the file /p/b.ts in the IDE.</ide_opened_file>' }
          ]
        }
      },
      { history: true }
    )
    expect(m?.blocks).toEqual([{ type: 'text', text: 'explain' }])
    expect(m?.context).toEqual({ path: '/p/a.ts', startLine: 2, endLine: 4 })
  })

  it('only context, no text: still dropped', () => {
    expect(
      normalizeMessage({
        type: 'user',
        uuid: 'c2',
        message: {
          content: [
            { type: 'text', text: '<ide_opened_file>The user opened the file /p/b.ts in the IDE.</ide_opened_file>' }
          ]
        }
      })
    ).toBeNull()
  })
})
