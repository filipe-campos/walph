import { describe, expect, it, vi } from 'vitest'
import { setLocale } from '@shared/i18n'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import {
  FakeQuery,
  type Harness,
  canUse,
  flush,
  lastRequest,
  of,
  promptInput,
  setup,
  toolOpts,
  useTempRoot
} from '../testing/fakeQuery'

useTempRoot()

describe('ClaudeConversation - idleness', () => {
  const result = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'ok',
    total_cost_usd: 0,
    duration_ms: 1
  }

  async function idleConversation(sleepMs = 40): Promise<Harness> {
    const h = setup()
    h.deps.idleSleepMs = sleepMs
    await h.conv.start()
    await flush()
    await h.conv.send(promptInput('hi'))
    h.queries[0].push(result)
    return h
  }

  it('sleeps after the deadline without events, and the next message relaunches with resume', async () => {
    const h = await idleConversation()
    await flush()
    await flush()
    expect(h.queries[0].close).toHaveBeenCalled()
    expect(h.queries).toHaveLength(1)
    expect(of(h, 'error')).toHaveLength(0)
    expect(h.events.some((e) => e.type === 'status' && e.status === 'closed')).toBe(false)
    expect(of(h, 'sessionStatus').at(-1)?.status).not.toBe('error')

    await h.conv.send(promptInput('again'))
    expect(h.queries).toHaveLength(2)
    expect(h.queries[1].params.options).toHaveProperty('resume', h.conv.currentSessionId)
    // The displayed status does not go through "starting" on relaunch.
    expect(of(h, 'status').map((e) => e.status)).toEqual(['idle', 'working', 'idle', 'working'])
    expect(h.sent.at(-1)).toMatchObject({ type: 'user' })
    await h.conv.close()
  })

  it('default (claude.idleSleepMinutes = 0): never sleeps; the setting turns the deadline on', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    await h.conv.send(promptInput('hi'))
    h.queries[0].push(result)
    await flush()
    await flush()
    expect(h.queries[0].close).not.toHaveBeenCalled()
    await h.conv.close()

    // In minutes: 1 min does not expire during the test, but the timer is armed (the process stays alive).
    const g = setup({}, { 'claude.idleSleepMinutes': 1 })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await g.conv.start()
      await vi.advanceTimersByTimeAsync(100)
      const sending = g.conv.send(promptInput('hi'))
      await vi.advanceTimersByTimeAsync(100)
      await sending
      g.queries[0].push(result)
      await vi.advanceTimersByTimeAsync(59_000)
      expect(g.queries[0].close).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(g.queries[0].close).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
    await g.conv.close()
  })

  it('the first send of a new process waits for the pending MCPs to connect', async () => {
    const h = setup()
    const make = h.sdk.query.getMockImplementation() as (p: FakeQuery['params']) => FakeQuery
    h.sdk.query.mockImplementation((params) => {
      const q = make(params)
      q.mcpList = [{ name: 'docs', status: 'pending', scope: 'project' }]
      return q
    })
    await h.conv.start()
    let done = false
    const sending = h.conv.send(promptInput('hi')).then(() => (done = true))
    await flush()
    expect(done).toBe(false)
    expect(h.sent).toHaveLength(0)
    h.queries[0].mcpList = [{ name: 'docs', status: 'connected', scope: 'project' }]
    await sending
    expect(h.sent.at(-1)).toMatchObject({ type: 'user' })
    expect(of(h, 'notice')).toHaveLength(0)
    // Already settled: the next sends do not query the MCPs again.
    const calls = h.queries[0].mcpServerStatus.mock.calls.length
    h.queries[0].push(result)
    await flush()
    await h.conv.send(promptInput('again'))
    expect(h.queries[0].mcpServerStatus.mock.calls.length).toBe(calls)
    await h.conv.close()
  })

  it('MCP pending past the deadline: sends anyway and reports which are missing', async () => {
    const h = setup()
    h.deps.mcpConnectWaitMs = 80
    const make = h.sdk.query.getMockImplementation() as (p: FakeQuery['params']) => FakeQuery
    h.sdk.query.mockImplementation((params) => {
      const q = make(params)
      q.mcpList = [
        { name: 'slow', status: 'pending', scope: 'user' },
        { name: 'ok', status: 'connected', scope: 'user' }
      ]
      return q
    })
    await h.conv.start()
    await h.conv.send(promptInput('hi'))
    expect(h.sent.at(-1)).toMatchObject({ type: 'user' })
    expect(of(h, 'notice')).toHaveLength(1)
    expect(of(h, 'notice')[0].message).toContain('slow')
    expect(of(h, 'notice')[0].message).not.toContain('ok')
    await h.conv.close()
  })

  it('emits mcpReady when the MCPs connect and with timedOut when the deadline expires', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    await flush()
    expect(of(h, 'mcpReady')).toEqual([{ type: 'mcpReady', id: 'c1', timedOut: false }])
    await h.conv.close()

    const slow = setup()
    slow.deps.mcpConnectWaitMs = 60
    const make = slow.sdk.query.getMockImplementation() as (p: FakeQuery['params']) => FakeQuery
    slow.sdk.query.mockImplementation((params) => {
      const q = make(params)
      q.mcpList = [{ name: 'slow', status: 'pending', scope: 'user' }]
      return q
    })
    await slow.conv.start()
    await new Promise((r) => setTimeout(r, 200))
    expect(of(slow, 'mcpReady')).toEqual([{ type: 'mcpReady', id: 'c1', timedOut: true }])
    await slow.conv.close()
  })

  it('init carries the account reported by the CLI', async () => {
    const h = setup()
    h.sdk.query.mockImplementationOnce((params) => {
      const q = new FakeQuery(params, h.sent)
      q.initResult = {
        ...(q.initResult as object),
        account: { email: 'a@b.dev', subscriptionType: 'max', tokenSource: 'claude.ai' }
      }
      h.queries.push(q)
      return q
    })
    await h.conv.start()
    await flush()
    expect(of(h, 'init').at(-1)!.account).toEqual({
      email: 'a@b.dev',
      subscriptionType: 'max',
      authMethod: 'claude.ai'
    })
    await h.conv.close()
  })

  it('restartForAuth: an idle conversation without a saved session starts a new CLI; a busy one stays', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    expect(h.queries).toHaveLength(1)
    expect(await h.conv.restartForAuth()).toBe(true)
    await flush()
    expect(h.queries).toHaveLength(2)
    expect(h.queries[1].params.options).not.toHaveProperty('resume')
    expect(of(h, 'mcpReady').length).toBeGreaterThanOrEqual(2)
    await h.conv.send(promptInput('hi'))
    expect(await h.conv.restartForAuth()).toBe(false)
    await h.conv.close()
  })

  it('usage: normalizes the experimental API and returns null if the CLI lacks it', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    expect(await h.conv.usage()).toBeNull()
    const usage = vi.fn(() =>
      Promise.resolve({ session: { total_cost_usd: 2 }, rate_limits_available: false, subscription_type: 'pro' })
    )
    ;(h.queries[0] as unknown as Record<string, unknown>).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET =
      usage
    const report = await h.conv.usage()
    expect(report?.session.costUsd).toBe(2)
    expect(report?.subscriptionType).toBe('pro')
    expect(usage).toHaveBeenCalledWith({ skipBehaviors: true })
    await h.conv.close()
  })

  it('usage in English: closed conversation and expired deadline do not become usageFailed', async () => {
    setLocale('en')
    try {
      const h = setup()
      await h.conv.start()
      await flush()
      ;(h.queries[0] as unknown as Record<string, unknown>).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET =
        () => new Promise(() => undefined)
      vi.useFakeTimers()
      const pending = expect(h.conv.usage()).rejects.toThrow('Claude Code did not answer the usage request in time.')
      await vi.advanceTimersByTimeAsync(20_000)
      await pending
      vi.useRealTimers()
      ;(h.queries[0] as unknown as Record<string, unknown>).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET =
        () => Promise.resolve({ rate_limits: {} })
      await expect(h.conv.usage()).rejects.toThrow('Claude Code returned an invalid usage report.')
      await h.conv.close()
      await expect(h.conv.usage()).rejects.toThrow('The conversation was closed.')
    } finally {
      vi.useRealTimers()
      setLocale('pt-BR')
    }
  })

  it('setEffort(null) before sleeping: the relaunched CLI does not come back with the old effort', async () => {
    const h = setup({ effort: 'max' })
    h.deps.idleSleepMs = 40
    await h.conv.start()
    await flush()
    expect(h.queries[0].params.options).toMatchObject({ effort: 'max' })
    await h.conv.send(promptInput('hi'))
    await h.conv.setEffort(null)
    h.queries[0].push(result)
    await flush()
    await flush()
    await h.conv.send(promptInput('again'))
    expect(h.queries).toHaveLength(2)
    expect(h.queries[1].params.options).not.toHaveProperty('effort')
    await h.conv.close()
  })

  it('local command output becomes commandOutput; compact_boundary becomes compacted', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].push({
      type: 'user',
      uuid: 'u-out',
      parent_tool_use_id: null,
      message: { role: 'user', content: '<local-command-stdout>Context: 12k</local-command-stdout>' }
    })
    h.queries[0].push({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'manual', pre_tokens: 5000 }
    })
    await flush()
    expect(of(h, 'commandOutput')).toMatchObject([{ id: 'c1', text: 'Context: 12k' }])
    expect(typeof of(h, 'commandOutput')[0].timestamp).toBe('number')
    expect(of(h, 'compacted')).toMatchObject([{ id: 'c1', trigger: 'manual', preTokens: 5000 }])
    expect(of(h, 'message')).toHaveLength(0)
    await h.conv.close()
  })

  it('tool_result with text quoting the markup stays a message; local_command_output is commandOutput', async () => {
    const h = setup()
    await h.conv.start()
    h.queries[0].push({
      type: 'user',
      uuid: 'u-tr',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
          { type: 'text', text: '<local-command-stdout>x</local-command-stdout>' }
        ]
      }
    })
    h.queries[0].push({ type: 'system', subtype: 'local_command_output', content: '\u001b[1mCost\u001b[0m: $1\r\n' })
    await flush()
    expect(of(h, 'message')).toHaveLength(1)
    expect(of(h, 'commandOutput')).toMatchObject([{ text: 'Cost: $1' }])
    await h.conv.close()
  })

  it('does not sleep with a pending permission request; sleeps after it is answered', async () => {
    const h = await idleConversation()
    const pending = canUse(h)('Bash', { command: 'ls' }, toolOpts())
    await flush()
    await flush()
    expect(h.queries[0].close).not.toHaveBeenCalled()
    h.conv.respond(lastRequest(h).requestId, { behavior: 'allow' })
    await pending
    await flush()
    await flush()
    expect(h.queries[0].close).toHaveBeenCalled()
    await h.conv.close()
  })

  it('does not sleep while working nor before the session exists on disk', async () => {
    const h = setup()
    h.deps.idleSleepMs = 20
    await h.conv.start()
    await flush()
    await flush()
    // New session without any turn: nothing to resume.
    expect(h.queries[0].close).not.toHaveBeenCalled()
    await h.conv.send(promptInput('hi'))
    await flush()
    await flush()
    expect(h.queries[0].close).not.toHaveBeenCalled()
    await h.conv.close()
  })

  it('setModel and setPermissionMode while asleep only store the value and go into the relaunch', async () => {
    const h = await idleConversation()
    await flush()
    await flush()
    await h.conv.setModel('opus')
    await h.conv.setPermissionMode('plan')
    expect(h.queries).toHaveLength(1)
    expect(of(h, 'permissionMode').at(-1)).toMatchObject({ mode: 'plan' })
    await h.conv.send(promptInput('later'))
    expect(h.queries[1].params.options).toMatchObject({ model: 'opus', permissionMode: 'plan' })
    await h.conv.close()
  })

  it('simultaneous messages while asleep relaunch only once; closing while asleep does not relaunch', async () => {
    const h = await idleConversation()
    await flush()
    await flush()
    await Promise.all([h.conv.send(promptInput('a')), h.conv.send(promptInput('b'))])
    expect(h.queries).toHaveLength(2)
    await h.conv.close()
    expect(h.queries[1].close).toHaveBeenCalled()
  })

  it('a control applied during the relaunch goes to the new process and the CLI init keeps it', async () => {
    const h = await idleConversation()
    await flush()
    await flush()
    const sending = h.conv.send(promptInput('wake up'))
    await new Promise((r) => setTimeout(r, 0))
    const changing = h.conv.setModel('opus')
    await Promise.all([sending, changing])
    expect(h.queries).toHaveLength(2)
    h.queries[1].push({
      type: 'system',
      subtype: 'init',
      session_id: h.conv.currentSessionId,
      model: 'sonnet',
      permissionMode: 'default'
    })
    await flush()
    expect(of(h, 'init').at(-1)).toMatchObject({ model: 'opus' })
    await h.conv.close()
  })

  it('after a rewind, sleeping and waking resumes at the same point until the next result', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const u1 = await h.conv.send(promptInput('first'))
    h.queries[0].push({
      type: 'assistant',
      uuid: 'a1',
      parent_tool_use_id: null,
      message: { role: 'assistant', content: [{ type: 'text', text: 'resp' }] }
    })
    h.queries[0].push(result)
    await flush()
    const u2 = await h.conv.send(promptInput('second'))
    h.queries[0].push(result)
    await flush()
    expect(u1).toBeTruthy()

    h.deps.idleSleepMs = 40
    await h.conv.rewind(u2, { code: false, conversation: true })
    expect(h.queries).toHaveLength(2)
    await flush()
    await flush()
    expect(h.queries[1].close).toHaveBeenCalled()
    await h.conv.send(promptInput('third'))
    expect(h.queries).toHaveLength(3)
    expect(h.queries[2].params.options).toMatchObject({ resumeSessionAt: 'a1' })
    expect(h.queries[2].params.options).toHaveProperty('resume')
    await h.conv.close()
  })

  it('contextUsage while asleep returns the last known value', async () => {
    const h = await idleConversation(150)
    await flush()
    expect(await h.conv.contextUsage()).toMatchObject({ percentage: 10 })
    await flush()
    await flush()
    await flush()
    expect(await h.conv.contextUsage()).toMatchObject({ percentage: 10 })
    await h.conv.close()
  })

  type StopHook = (input: Record<string, unknown>) => Promise<unknown>
  const stopHook = (h: Harness, i = 0): StopHook => {
    const hooks = h.queries[i].params.options.hooks as { Stop: { hooks: StopHook[] }[] }
    return hooks.Stop[0].hooks[0]
  }
  const stopInput = (crons: unknown[], tasks: unknown[] = []): Record<string, unknown> => ({
    hook_event_name: 'Stop',
    stop_hook_active: false,
    session_crons: crons,
    background_tasks: tasks
  })

  it('with a scheduled /loop (Stop hook) it does not sleep; without a schedule it sleeps again', async () => {
    const h = setup()
    h.deps.idleSleepMs = 40
    await h.conv.start()
    await flush()
    await h.conv.send(promptInput('/loop 30m check the build'))
    await stopHook(h)(stopInput([{ id: 'j1', schedule: '*/30 * * * *', recurring: true, prompt: 'check' }]))
    h.queries[0].push(result)
    await flush()
    await flush()
    expect(h.queries[0].close).not.toHaveBeenCalled()
    expect(h.conv.hasScheduledWork).toBe(true)
    // The cron fires: the marker says it is a scheduled run.
    h.queries[0].push({
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: 'loop-a1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'build ok' }] }
    })
    h.queries[0].push(result)
    await flush()
    expect(of(h, 'autoTurn').map((e) => e.reason)).toEqual(['scheduled'])

    // A background task also wakes the session.
    await stopHook(h)(stopInput([], [{ id: 't1', type: 'shell', status: 'running', description: 'npm test' }]))
    await flush()
    await flush()
    expect(h.queries[0].close).not.toHaveBeenCalled()

    await stopHook(h)(stopInput([]))
    expect(h.conv.hasScheduledWork).toBe(false)
    await flush()
    await flush()
    expect(h.queries[0].close).toHaveBeenCalled()
    await h.conv.close()
  })

  it('background agents: session running after the result, without sleeping, until the list empties', async () => {
    const h = setup()
    h.deps.idleSleepMs = 40
    await h.conv.start()
    await flush()
    await h.conv.send(promptInput('launch the agents'))
    h.queries[0].push({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [
        { task_id: 'a1', task_type: 'local_agent', subagent_type: 'backend-developer', description: 'Package 3.1' },
        { task_id: 'w1', task_type: 'monitor', description: 'watcher', ambient: true }
      ]
    })
    h.queries[0].push(result)
    await flush()
    await flush()
    expect(of(h, 'backgroundTasks').at(-1)?.tasks).toEqual([
      { id: 'a1', kind: 'agent', description: 'Package 3.1', agentType: 'backend-developer' }
    ])
    // The turn ended, but the session keeps running and there was no "finished" notification.
    expect(of(h, 'status').at(-1)?.status).toBe('idle')
    expect(of(h, 'sessionStatus').at(-1)).toMatchObject({ status: 'running', unread: 0 })
    expect(h.queries[0].close).not.toHaveBeenCalled()
    expect(h.conv.hasScheduledWork).toBe(true)

    // The agent finished: the list empties and the report comes back in an automatic turn.
    h.queries[0].push({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })
    h.queries[0].push({
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: 'rep1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'package 3.1 done' }] }
    })
    h.queries[0].push(result)
    await flush()
    expect(of(h, 'backgroundTasks').at(-1)?.tasks).toEqual([])
    expect(of(h, 'autoTurn').map((e) => e.reason)).toEqual(['background'])
    expect(of(h, 'sessionStatus').at(-1)).toMatchObject({ status: 'done', unread: 1 })
    await flush()
    await flush()
    expect(h.queries[0].close).toHaveBeenCalled()
    await h.conv.close()
  })

  it('stopTask only stops tasks from the current list; the CLI is told there is per-task stop', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    expect(h.queries[0].params.options).toMatchObject({ perTaskStopAffordance: true })
    const stopTask = vi.fn((_id: string) => Promise.resolve())
    Object.assign(h.queries[0], { stopTask })
    h.queries[0].push({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [{ task_id: 'a1', task_type: 'local_agent', description: 'Package 3.1' }]
    })
    await flush()
    await h.conv.stopTask('a1')
    expect(stopTask).toHaveBeenCalledWith('a1')
    await expect(h.conv.stopTask('other')).rejects.toThrow('Esta tarefa já terminou.')
    expect(stopTask).toHaveBeenCalledTimes(1)
    stopTask.mockRejectedValueOnce(new Error('boom'))
    await expect(h.conv.stopTask('a1')).rejects.toThrow('Não foi possível parar a tarefa em segundo plano.')
    await h.conv.close()
  })

  it('a turn started by the CLI (/loop) stays working until the result and then idle', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    await h.conv.send(promptInput('/loop 1m say hi'))
    h.queries[0].push(result)
    await flush()
    expect(of(h, 'status').at(-1)?.status).toBe('idle')

    // The cron fires: no `send`, only the model response arrives.
    h.queries[0].push({ type: 'system', subtype: 'init', session_id: h.conv.currentSessionId, model: 'opus' })
    h.queries[0].push({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: { type: 'message_start', message: {} }
    })
    h.queries[0].push({
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: 'loop-a1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi again' }] }
    })
    await flush()
    expect(of(h, 'status').at(-1)?.status).toBe('working')
    expect(of(h, 'message').some((e) => e.message.uuid === 'loop-a1')).toBe(true)
    // One marker per turn, before the response; without a known cron the reason is generic.
    expect(of(h, 'autoTurn')).toEqual([expect.objectContaining({ id: 'c1', reason: 'background' })])
    expect(h.events.findIndex((e) => e.type === 'autoTurn')).toBeLessThan(
      h.events.findIndex((e) => e.type === 'message' && e.message.uuid === 'loop-a1')
    )
    expect(of(h, 'sessionStatus').at(-1)?.status).toBe('running')

    h.queries[0].push(result)
    await flush()
    expect(of(h, 'status').map((e) => e.status)).toEqual(['idle', 'working', 'idle', 'working', 'idle'])
    await h.conv.close()
  })
})

describe('ClaudeConversation - interrupt deadline', () => {
  it('interrupt without a turn in progress does not arm the deadline; send clears the previous deadline', async () => {
    vi.useFakeTimers()
    try {
      const h = setup()
      await h.conv.start()
      await vi.advanceTimersByTimeAsync(0)
      await h.conv.interrupt()
      await vi.advanceTimersByTimeAsync(9000)
      expect(of(h, 'error')).toHaveLength(0)
      await h.conv.send(promptInput('a'))
      await h.conv.interrupt()
      await h.conv.send(promptInput('b'))
      await vi.advanceTimersByTimeAsync(9000)
      expect(of(h, 'error')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
