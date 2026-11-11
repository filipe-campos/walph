import { describe, expect, it, vi } from 'vitest'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import type { Sdk } from '../sdk'
import { titleFrom } from '../sessionTitle'
import { type FakeQuery, flush, of, promptInput, setup, useTempRoot } from '../testing/fakeQuery'

const dir = useTempRoot()

describe('titleFrom', () => {
  it('uses the first non-empty line and truncates with an ellipsis', () => {
    expect(titleFrom('\n  \n  Fix the bug  \nother')).toBe('Fix the bug')
    expect(titleFrom('   ')).toBe('Nova conversa')
    const long = titleFrom('x'.repeat(100))
    expect(long).toHaveLength(60)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('ClaudeConversation - start', () => {
  it('starts the query with the safety options and the explicit mode', async () => {
    const h = setup()
    const started = await h.conv.start()
    expect(started).toMatchObject({ id: 'c1', messages: [] })
    const o = h.queries[0].params.options
    expect(o).toMatchObject({
      cwd: dir.root,
      permissionMode: 'default',
      includePartialMessages: true,
      enableFileCheckpointing: true,
      settingSources: ['user', 'project', 'local']
    })
    expect(typeof o.canUseTool).toBe('function')
    expect(o.env as Record<string, string>).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(o).not.toHaveProperty('resume')
    await h.conv.close()
  })

  it('without an open folder throws in pt-BR', async () => {
    const h = setup()
    h.deps.getRoot = () => null
    await expect(h.conv.start()).rejects.toThrow('Abra uma pasta')
  })

  it('resume loads the history and passes resume to the query', async () => {
    const h = setup({ resume: 'sess-1' })
    h.sdk.getSessionMessages.mockResolvedValue([
      { type: 'user', uuid: 'u1', session_id: 's', parent_tool_use_id: null, message: { role: 'user', content: 'hi' } }
    ])
    const started = await h.conv.start()
    expect(started.messages).toHaveLength(1)
    expect(h.queries[0].params.options).toMatchObject({ resume: 'sess-1' })
    await h.conv.close()
  })
})

describe('ClaudeConversation - initial effort', () => {
  it('a new conversation without effort uses the claude.effort setting', async () => {
    const h = setup({}, { 'claude.effort': 'high' })
    await h.conv.start()
    expect(h.queries[0].params.options).toMatchObject({ effort: 'high' })
    await h.conv.close()
  })

  it('resume without effort sends no effort', async () => {
    const h = setup({ resume: 's1' }, { 'claude.effort': 'high' })
    await h.conv.start()
    expect(h.queries[0].params.options).not.toHaveProperty('effort')
    await h.conv.close()
  })

  it('the explicit effort beats the setting', async () => {
    const h = setup({ effort: 'low' }, { 'claude.effort': 'high' })
    await h.conv.start()
    expect(h.queries[0].params.options).toMatchObject({ effort: 'low' })
    await h.conv.close()
  })

  it('an effort the model does not support drops to the highest level below it and reaches init', async () => {
    const h2 = setup({ effort: 'max' })
    h2.deps.loadSdk = () => {
      const orig = h2.sdk.query.getMockImplementation() as (p: never) => FakeQuery
      h2.sdk.query.mockImplementation((p: never) => {
        const q = orig(p)
        q.initResult = {
          commands: [],
          models: [
            { value: 'default', displayName: 'Default', description: '', supportedEffortLevels: ['low', 'high'] }
          ]
        }
        return q
      })
      return Promise.resolve(h2.sdk as unknown as Sdk)
    }
    await h2.conv.start()
    await flush()
    expect(h2.queries[0].applyFlagSettings).toHaveBeenCalledWith({ effortLevel: 'high' })
    expect(of(h2, 'init').at(-1)!.effort).toBe('high')
    await h2.conv.close()
  })

  it('a supported effort or an unknown model is left untouched', async () => {
    const h = setup({ effort: 'max' })
    await h.conv.start()
    await flush()
    expect(h.queries[0].applyFlagSettings).not.toHaveBeenCalled()
    expect(of(h, 'init').at(-1)!.effort).toBe('max')
    await h.conv.close()
  })
})

describe('ClaudeConversation - status, init and result', () => {
  it('starting -> idle when initialization finishes and emits init with commands and models', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    expect(of(h, 'status').map((e) => e.status)).toEqual(['idle'])
    const init = of(h, 'init').at(-1)!
    expect(init.commands.map((c) => c.name)).toEqual(['compact'])
    expect(init.models[0]).toMatchObject({ value: 'opus', efforts: ['low', 'high'] })
    await h.conv.close()
  })

  it('the system init updates session, model and mode; a duplicate init keeps the commands', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].push({ type: 'system', subtype: 'init', session_id: 'S9', model: 'opus-4', permissionMode: 'plan' })
    await flush()
    const inits = of(h, 'init')
    expect(inits.length).toBeGreaterThanOrEqual(2)
    expect(inits.at(-1)).toMatchObject({ sessionId: 'S9', model: 'opus-4', permissionMode: 'plan' })
    expect(inits.at(-1)!.commands).toHaveLength(1)
    await h.conv.close()
  })

  it('send -> working; session_state_changed idle goes back to idle; user echo and title come out once', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const uuid = await h.conv.send(promptInput('  Explain this code\nmore details'))
    expect(of(h, 'status').at(-1)!.status).toBe('working')
    expect(of(h, 'title')).toEqual([{ type: 'title', id: 'c1', title: 'Explain this code' }])
    const echo = of(h, 'message')[0].message
    expect(echo).toMatchObject({ uuid, role: 'user', checkpoint: true })
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ type: 'user', uuid })
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()
    expect(of(h, 'status').at(-1)!.status).toBe('idle')
    await h.conv.send(promptInput('second'))
    expect(of(h, 'title')).toHaveLength(1)
    await h.conv.close()
  })

  it('a message sent while Claude is busy goes in with priority later', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('one'))
    await h.conv.send(promptInput('two'))
    await flush()
    expect(h.sent[1]).toMatchObject({ priority: 'later' })
    expect(h.sent[0]).not.toHaveProperty('priority')
    await h.conv.close()
  })

  it('result emits cost and duration (one per turn, no context) and leaves the conversation idle', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('hi'))
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'ok',
      total_cost_usd: 0.0123,
      duration_ms: 1500
    })
    await flush()
    // A single `result` per turn (the renderer queue counts turns by it); the context comes through `contextUsage`.
    expect(of(h, 'result')).toEqual([
      { type: 'result', id: 'c1', costUsd: 0.0123, durationMs: 1500, isError: false, context: null }
    ])
    expect(of(h, 'status').at(-1)!.status).toBe('idle')
    expect(await h.conv.contextUsage()).toMatchObject({ percentage: 10 })
    await h.conv.close()
  })

  it('result with queued turns stays working', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.send(promptInput('hi'))
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      total_cost_usd: 0,
      duration_ms: 1,
      queued_turn_count: 1
    })
    await flush()
    expect(of(h, 'status').at(-1)!.status).toBe('working')
    await h.conv.close()
  })

  it('context that takes longer than the deadline becomes null (does not block the result)', async () => {
    vi.useFakeTimers()
    try {
      const h = setup()
      await h.conv.start()
      await vi.advanceTimersByTimeAsync(0)
      h.queries[0].getContextUsage.mockReturnValue(new Promise(() => {}) as never)
      h.queries[0].push({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        total_cost_usd: 1,
        duration_ms: 1
      })
      await vi.advanceTimersByTimeAsync(3100)
      expect(of(h, 'result')[0]).toMatchObject({ costUsd: 1, context: null })
      await h.conv.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('contextUsage is null before the first result', async () => {
    const h = setup()
    await h.conv.start()
    expect(await h.conv.contextUsage()).toBeNull()
    await h.conv.close()
  })

  it('assistant messages arrive as message and stream deltas as delta', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].push({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } }
    })
    h.queries[0].push({
      type: 'stream_event',
      parent_tool_use_id: 'sub',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ignored' } }
    })
    h.queries[0].push({
      type: 'assistant',
      uuid: 'a1',
      parent_tool_use_id: null,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] }
    })
    await flush()
    expect(of(h, 'delta')).toEqual([{ type: 'delta', id: 'c1', index: 0, kind: 'text', text: 'Hel' }])
    expect(of(h, 'message').at(-1)!.message).toMatchObject({ uuid: 'a1', role: 'assistant' })
    await h.conv.close()
  })
})

describe('ClaudeConversation - errors', () => {
  it('assistant authentication_failed error becomes error auth without closing the conversation', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].push({
      type: 'assistant',
      uuid: 'a1',
      parent_tool_use_id: null,
      error: 'authentication_failed',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Invalid API key' }] }
    })
    await flush()
    expect(of(h, 'error')[0].error.code).toBe('auth')
    expect(of(h, 'message').filter((e) => e.message.role === 'assistant')).toHaveLength(0)
    expect(of(h, 'status').some((e) => e.status === 'closed')).toBe(false)
    await h.conv.close()
  })

  it('result with is_error and login text becomes error auth; other text produces no error', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Not logged in · Please run /login',
      total_cost_usd: 0,
      duration_ms: 1
    })
    await flush()
    expect(of(h, 'result')[0].isError).toBe(true)
    expect(of(h, 'error').map((e) => e.error.code)).toEqual(['auth'])
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'something went wrong',
      total_cost_usd: 0,
      duration_ms: 1
    })
    await flush()
    expect(of(h, 'error')).toHaveLength(1)
    await h.conv.close()
  })

  it('iterator exception with login stderr closes the conversation with error auth', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].fail(new Error('Claude Code process exited with code 1: 401 Unauthorized'))
    await flush()
    expect(of(h, 'error')[0].error.code).toBe('auth')
    expect(of(h, 'status').at(-1)!.status).toBe('closed')
    await expect(h.conv.send(promptInput('hi'))).rejects.toThrow('encerrada')
  })

  it('executable ENOENT becomes error executable', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].fail(Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))
    await flush()
    expect(of(h, 'error')[0].error.code).toBe('executable')
    expect(of(h, 'status').at(-1)!.status).toBe('closed')
  })

  it('the iterator ending on its own (CLI exited) closes the conversation with error process', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].end()
    await flush()
    expect(of(h, 'error')[0].error.code).toBe('process')
    expect(of(h, 'status').at(-1)!.status).toBe('closed')
  })
})

describe('ClaudeConversation - shutdown on failure', () => {
  it('a failing conversation notifies onClosed', async () => {
    const h = setup()
    const onClosed = vi.fn()
    h.deps.onClosed = onClosed
    await h.conv.start()
    h.queries[0].end()
    await flush()
    expect(onClosed).toHaveBeenCalled()
  })
})
