import { describe, expect, it, vi } from 'vitest'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import { flush, of, promptInput, setup, useTempRoot } from '../testing/fakeQuery'

useTempRoot()

describe('ClaudeConversation - new CLI events', () => {
  const sys = (subtype: string, extra: Record<string, unknown> = {}) => ({ type: 'system', subtype, ...extra })

  it('turns on the CLI features in the options and passes the fallback model only when configured', async () => {
    const h = setup()
    await h.conv.start()
    const o = h.queries[0].params.options
    expect(o).toMatchObject({ agentProgressSummaries: false, promptSuggestions: true })
    expect(typeof o.onElicitation).toBe('function')
    expect(o).not.toHaveProperty('fallbackModel')
    await h.conv.close()

    const g = setup({}, { 'claude.fallbackModel': ' sonnet, haiku ' })
    await g.conv.start()
    expect(g.queries[0].params.options.fallbackModel).toBe('sonnet,haiku')
    await g.conv.close()

    // The CLI refuses a fallback equal to the main model: it leaves the list, and the option goes if nothing is left.
    const same = setup({}, { 'claude.model': 'sonnet', 'claude.fallbackModel': 'sonnet,haiku' })
    await same.conv.start()
    expect(same.queries[0].params.options.fallbackModel).toBe('haiku')
    await same.conv.close()
    const only = setup({}, { 'claude.model': 'sonnet', 'claude.fallbackModel': 'sonnet' })
    await only.conv.start()
    expect(only.queries[0].params.options).not.toHaveProperty('fallbackModel')
    await only.conv.close()
  })

  it('rate_limit_event: normalizes and only emits when it changes', async () => {
    const h = setup()
    await h.conv.start()
    const info = { status: 'allowed_warning', rateLimitType: 'five_hour', utilization: 0.8, resetsAt: 1_900_000_000 }
    h.queries[0].push({ type: 'rate_limit_event', rate_limit_info: info })
    h.queries[0].push({ type: 'rate_limit_event', rate_limit_info: { ...info } })
    h.queries[0].push({ type: 'rate_limit_event', rate_limit_info: { ...info, status: 'rejected' } })
    h.queries[0].push({ type: 'rate_limit_event', rate_limit_info: { status: 'unknown' } })
    await flush()
    expect(of(h, 'rateLimit').map((e) => e.limit)).toEqual([
      { status: 'warning', window: 'five_hour', percent: 80, resetsAt: 1_900_000_000_000, usingOverage: false },
      { status: 'rejected', window: 'five_hour', percent: 80, resetsAt: 1_900_000_000_000, usingOverage: false }
    ])
    await h.conv.close()
  })

  it('api_retry, permission_denied and task_progress become sanitized events', async () => {
    const h = setup()
    await h.conv.start()
    const q = h.queries[0]
    q.push(sys('api_retry', { attempt: 1, max_retries: 5, retry_delay_ms: 2000, error_status: 529 }))
    q.push(sys('permission_denied', { tool_name: 'Bash', tool_use_id: 't9', decision_reason: 'classifier\ndenied' }))
    q.push(sys('permission_denied', { tool_name: 'Bash' }))
    q.push(
      sys('task_progress', {
        task_id: 'a1',
        tool_use_id: 't1',
        summary: 'Reading\nfiles',
        usage: { total_tokens: 10, tool_uses: 2, duration_ms: 300 }
      })
    )
    await flush()
    expect(of(h, 'retry')[0]).toMatchObject({ attempt: 1, maxRetries: 5, delayMs: 2000, errorStatus: 529 })
    expect(of(h, 'permissionDenied')).toHaveLength(1)
    expect(of(h, 'permissionDenied')[0]).toMatchObject({
      toolUseId: 't9',
      toolName: 'Bash',
      reason: 'classifier denied'
    })
    expect(of(h, 'taskProgress')[0].progress).toEqual({
      taskId: 'a1',
      toolUseId: 't1',
      summary: 'Reading files',
      totalTokens: 10,
      toolUses: 2,
      durationMs: 300,
      lastToolName: null
    })
    await h.conv.close()
  })

  it('prompt_suggestion after the result: emits without starting a turn or changing the status', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const status = of(h, 'status').length
    h.queries[0].push({ type: 'prompt_suggestion', suggestion: '  run the\ntests  ' })
    h.queries[0].push({ type: 'prompt_suggestion', suggestion: '   ' })
    await flush()
    expect(of(h, 'promptSuggestion')).toEqual([{ type: 'promptSuggestion', id: 'c1', suggestion: 'run the tests' }])
    expect(of(h, 'status')).toHaveLength(status)
    expect(of(h, 'autoTurn')).toHaveLength(0)
    expect(of(h, 'sessionStatus')).toHaveLength(0)
    await h.conv.close()
  })

  it('tool_progress is limited to 1 event/s per tool and restarts after the result', async () => {
    const h = setup()
    await h.conv.start()
    const frame = (s: number) => ({
      type: 'tool_progress',
      tool_use_id: 't1',
      tool_name: 'Bash',
      elapsed_time_seconds: s
    })
    h.queries[0].push(frame(1))
    h.queries[0].push(frame(2))
    h.queries[0].push(frame(3))
    await flush()
    expect(of(h, 'toolProgress')).toEqual([{ type: 'toolProgress', id: 'c1', toolUseId: 't1', elapsedSeconds: 1 }])
    h.queries[0].push({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, duration_ms: 1 })
    h.queries[0].push(frame(1))
    await flush()
    expect(of(h, 'toolProgress')).toHaveLength(2)
    await h.conv.close()
  })

  it('commands_changed replaces the base of the "/" menu without emitting init', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const inits = of(h, 'init').length
    h.queries[0].push(
      sys('commands_changed', {
        commands: [
          { name: 'compact', description: 'Compacts', argumentHint: '' },
          { name: 'new-skill', description: 'Discovered', argumentHint: '<file>' },
          { description: 'no name' }
        ]
      })
    )
    await flush()
    expect((await h.conv.slashCommands()).map((c) => c.name)).toEqual(['compact', 'new-skill'])
    expect(of(h, 'init')).toHaveLength(inits)
    await h.conv.close()
  })

  it('model_refusal_fallback (session): event, new model in init and messages retracted from transcript', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const q = h.queries[0]
    for (const uuid of ['a1', 'a2']) {
      q.push({
        type: 'assistant',
        uuid,
        parent_tool_use_id: null,
        message: { role: 'assistant', content: [{ type: 'text', text: uuid }] }
      })
    }
    q.push(
      sys('model_refusal_fallback', {
        original_model: 'opus',
        fallback_model: 'sonnet',
        retracted_message_uuids: ['a2']
      })
    )
    await flush()
    expect(of(h, 'modelFallback')).toEqual([
      { type: 'modelFallback', id: 'c1', from: 'opus', to: 'sonnet', scope: 'session', retracted: ['a2'] }
    ])
    expect(of(h, 'init').at(-1)!.model).toBe('sonnet')
    expect(h.conv.exportData().messages.map((m) => m.uuid)).toEqual(['a1'])
    expect(of(h, 'notice')).toHaveLength(0)
    await h.conv.close()
  })

  it('a late prompt_suggestion, with another turn running, is dropped', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    await h.conv.send(promptInput('hi'))
    h.queries[0].push({ type: 'prompt_suggestion', suggestion: 'stale' })
    await flush()
    expect(of(h, 'promptSuggestion')).toHaveLength(0)
    await h.conv.close()
  })

  it('commands_changed keeps the commands from .claude/commands', async () => {
    const h = setup()
    h.deps.readCommandFiles = () =>
      Promise.resolve([{ name: 'mine', description: 'from the repo', argumentHint: '', scope: 'project' }])
    await h.conv.start()
    await flush()
    await h.conv.slashCommands()
    h.queries[0].push(sys('commands_changed', { commands: [{ name: 'compact', description: '', argumentHint: '' }] }))
    await flush()
    h.queries[0].push(sys('init', { session_id: 'S', model: 'm', permissionMode: 'default' }))
    await flush()
    expect(
      of(h, 'init')
        .at(-1)!
        .commands.map((c) => c.name)
    ).toEqual(['compact', 'mine'])
    await h.conv.close()
  })

  it('model_refusal_fallback (local) also retracts the messages', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    h.queries[0].push({
      type: 'assistant',
      uuid: 'a1',
      parent_tool_use_id: null,
      message: { role: 'assistant', content: [{ type: 'text', text: 'x' }] }
    })
    h.queries[0].push(
      sys('model_refusal_fallback', {
        scope: 'local',
        original_model: 'opus',
        fallback_model: 'haiku',
        retracted_message_uuids: ['a1']
      })
    )
    await flush()
    expect(h.conv.exportData().messages).toHaveLength(0)
    await h.conv.close()
  })

  it('model_refusal_fallback (local) does not switch the session model', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const inits = of(h, 'init').length
    h.queries[0].push(
      sys('model_refusal_fallback', { scope: 'local', original_model: 'opus', fallback_model: 'haiku' })
    )
    await flush()
    expect(of(h, 'modelFallback')[0]).toMatchObject({ scope: 'local', to: 'haiku' })
    expect(of(h, 'init')).toHaveLength(inits)
    await h.conv.close()
  })

  it('elicitation_complete and unknown subtypes are ignored', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const before = h.events.length
    h.queries[0].push(sys('elicitation_complete', { mcp_server_name: 'x', elicitation_id: 'e' }))
    h.queries[0].push(sys('something_new'))
    await flush()
    expect(h.events).toHaveLength(before)
    await h.conv.close()
  })
})
