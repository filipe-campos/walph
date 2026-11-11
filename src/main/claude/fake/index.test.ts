import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { PushStream } from '../pushStream'
import { createFakeClaude, createFakeSdk } from '.'
import { parseFakeScript } from './script'

async function collect(iter: AsyncIterator<SDKMessage>, until: (m: SDKMessage) => boolean): Promise<SDKMessage[]> {
  const all: SDKMessage[] = []
  for (;;) {
    const r = await iter.next()
    if (r.done) return all
    all.push(r.value)
    if (until(r.value)) return all
  }
}
const isResult = (m: SDKMessage): boolean => m.type === 'result'

function start(script: unknown, canUseTool?: unknown) {
  const sdk = createFakeSdk(parseFakeScript(script))
  const prompt = new PushStream<SDKUserMessage>()
  const query = sdk.query({ prompt, options: { canUseTool } as never }) as unknown as AsyncIterable<SDKMessage> & {
    close(): void
  }
  const iter = query[Symbol.asyncIterator]()
  return { query, iter, send: () => prompt.push({ type: 'user' } as unknown as SDKUserMessage) }
}

describe('fake SDK', () => {
  it('replays a turn: init, state, text, result and idle', async () => {
    const h = start({ turns: [[{ assistant: 'Ready.' }]] })
    h.send()
    const msgs = await collect(h.iter, isResult)
    expect(msgs.map((m) => (m.type === 'system' ? `system/${m.subtype}` : m.type))).toEqual([
      'system/init',
      'system/session_state_changed',
      'stream_event',
      'assistant',
      'result'
    ])
    const result = msgs[msgs.length - 1] as unknown as Record<string, unknown>
    expect(result).toMatchObject({ is_error: false, queued_turn_count: 0 })
    const assistant = msgs[3] as unknown as { message: { content: unknown[] } }
    expect(assistant.message.content).toEqual([{ type: 'text', text: 'Ready.' }])
    h.query.close()
  })

  it('consumes the turns in order and falls back to the default when they run out', async () => {
    const h = start({ turns: [[{ result: { isError: true, text: 'failed' } }]] })
    h.send()
    const first = await collect(h.iter, isResult)
    expect(first[first.length - 1]).toMatchObject({ is_error: true, result: 'failed' })
    h.send()
    const second = await collect(h.iter, isResult)
    expect(second[second.length - 1]).toMatchObject({ is_error: false })
    expect(second.some((m) => m.type === 'assistant')).toBe(true)
    h.query.close()
  })

  it('permission calls canUseTool and waits for the answer', async () => {
    let answer!: (r: unknown) => void
    const canUseTool = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const h = start({ turns: [[{ permission: { toolName: 'Bash', input: { command: 'ls' } } }]] }, canUseTool)
    h.send()
    const pending = collect(h.iter, isResult)
    await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledWith('Bash', { command: 'ls' }, expect.anything()))
    answer({ behavior: 'allow', updatedInput: {} })
    const msgs = await pending
    expect(msgs.map((m) => m.type)).toContain('user')
    expect(msgs[msgs.length - 1].type).toBe('result')
    h.query.close()
  })

  it('question calls canUseTool with AskUserQuestion and reports the answers', async () => {
    const questions = [
      { question: 'Which?', header: 'Lib', options: [{ label: 'A', description: '' }], multiSelect: false }
    ]
    let answer!: (r: unknown) => void
    const canUseTool = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const h = start({ turns: [[{ question: { questions } }]] }, canUseTool)
    h.send()
    const pending = collect(h.iter, isResult)
    await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledWith('AskUserQuestion', { questions }, expect.anything()))
    answer({ behavior: 'allow', updatedInput: { questions, answers: { 'Which?': 'A' } } })
    const msgs = await pending
    const texts = msgs.flatMap((m) => JSON.stringify(m)).join('')
    expect(texts).toContain('Answers: {\\"Which?\\":\\"A\\"}')
    h.query.close()
  })

  it('a skipped question reports the message; a cancelled one ends the turn without text', async () => {
    const step = { question: { questions: [{ question: 'Q?', options: [] }] } }
    const skipped = start({ turns: [[step]] }, () => Promise.resolve({ behavior: 'deny', message: 'skipped it' }))
    skipped.send()
    expect(JSON.stringify(await collect(skipped.iter, isResult))).toContain('Skipped: skipped it')
    skipped.query.close()

    const cancelled = start({ turns: [[step]] }, () =>
      Promise.resolve({ behavior: 'deny', message: 'x', interrupt: true })
    )
    cancelled.send()
    const msgs = await collect(cancelled.iter, isResult)
    expect(JSON.stringify(msgs)).not.toContain('Skipped')
    cancelled.query.close()
  })

  it('rejects question without a list', () => {
    expect(() => parseFakeScript({ turns: [[{ question: {} }]] })).toThrow('"question" needs "questions"')
  })

  it('error brings the iterator down; close ends it', async () => {
    const h = start({ turns: [[{ error: 'died' }]] })
    h.send()
    await expect(collect(h.iter, () => false)).rejects.toThrow('died')
    const h2 = start({ turns: [] })
    h2.query.close()
    expect((await h2.iter.next()).done).toBe(true)
  })

  it('implements the surface used by the app', async () => {
    const sdk = createFakeSdk({ turns: [] })
    expect(await sdk.listSessions()).toEqual([])
    expect(await sdk.getSessionMessages('x')).toEqual([])
    expect(await sdk.getSessionInfo('x')).toBeUndefined()
    await expect(sdk.renameSession('x', 't')).rejects.toThrow('not found')
    await expect(sdk.forkSession('x')).rejects.toThrow('not found')
    expect(sdk.createSdkMcpServer({ name: 'walph' })).toBeTruthy()
  })
})

const user = (text: string): SDKUserMessage =>
  ({ type: 'user', uuid: `u-${text}`, message: { role: 'user', content: [{ type: 'text', text }] } }) as never

describe('fake SDK - subagents', () => {
  it('parses toolCall, toolResult, subagentMessage and suggestions', () => {
    const { turns } = parseFakeScript({
      turns: [
        [
          { toolCall: { id: 'a', name: 'Agent', input: { description: 'X' } } },
          { toolCall: { id: 'b', name: 'Read', input: {}, parentToolUseId: 'a' } },
          { toolResult: { id: 'a', content: 'end', isError: true } },
          { subagentMessage: { parentToolUseId: 'a', text: 'hi' } },
          { permission: { toolName: 'Bash', suggestions: [{ type: 'addRules' }] } }
        ]
      ]
    })
    expect(turns[0][0]).toEqual({
      toolCall: { id: 'a', name: 'Agent', input: { description: 'X' }, parentToolUseId: null }
    })
    expect(turns[0][1]).toMatchObject({ toolCall: { parentToolUseId: 'a' } })
    expect(turns[0][2]).toEqual({ toolResult: { id: 'a', content: 'end', isError: true, parentToolUseId: null } })
    expect(turns[0][4]).toMatchObject({ permission: { suggestions: [{ type: 'addRules' }] } })
    expect(() => parseFakeScript({ turns: [[{ toolCall: { name: 'x' } }]] })).toThrow('"toolCall" needs "id"')
    expect(() => parseFakeScript({ turns: [[{ toolResult: {} }]] })).toThrow('"toolResult" needs "id"')
    expect(() => parseFakeScript({ turns: [[{ subagentMessage: { text: 'x' } }]] })).toThrow('"subagentMessage"')
    expect(() => parseFakeScript({ turns: [[{ permission: { toolName: 'x', suggestions: 1 } }]] })).toThrow(
      '"suggestions" must be a list'
    )
  })

  it('two Agents in parallel: tool_use without a result until the toolResult', async () => {
    const h = start({
      turns: [
        [
          { toolCall: { id: 'a', name: 'Agent', input: { description: 'A' } } },
          { toolCall: { id: 'b', name: 'Agent', input: { description: 'B' } } },
          { subagentMessage: { parentToolUseId: 'a', text: 'working' } },
          { toolResult: { id: 'a', content: 'ok A' } },
          { toolResult: { id: 'b', content: 'failed', isError: true } }
        ]
      ]
    })
    h.send()
    const msgs = (await collect(h.iter, isResult)) as unknown as Array<Record<string, unknown>>
    const content = (m: Record<string, unknown>): Array<Record<string, unknown>> =>
      (m.message as { content: Array<Record<string, unknown>> }).content
    const uses = msgs.filter((m) => m.type === 'assistant' && content(m)[0].type === 'tool_use')
    expect(uses.map((m) => content(m)[0].id)).toEqual(['a', 'b'])
    const sub = msgs.find((m) => m.type === 'assistant' && m.parent_tool_use_id === 'a')
    expect(content(sub!)[0]).toEqual({ type: 'text', text: 'working' })
    const results = msgs.filter((m) => m.type === 'user').map((m) => content(m)[0])
    expect(results).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: 'ok A' },
      { type: 'tool_result', tool_use_id: 'b', content: 'failed', is_error: true }
    ])
    h.query.close()
  })
})

describe('fake SDK - sessions', () => {
  async function runTurn(sdk: ReturnType<typeof createFakeSdk>, text: string, options: Record<string, unknown>) {
    const prompt = new PushStream<SDKUserMessage>()
    const query = sdk.query({ prompt, options }) as unknown as AsyncIterable<SDKMessage> & { close(): void }
    const iter = query[Symbol.asyncIterator]()
    prompt.push(user(text))
    await collect(iter, isResult)
    return query
  }

  it('records the turns, lists, renames, duplicates and rereads through the SDK', async () => {
    const sdk = createFakeSdk(parseFakeScript({ turns: [[{ assistant: 'Hello' }]] }))
    const q = await runTurn(sdk, 'First', { cwd: '/proj', sessionId: 'sess-1' })
    q.close()
    const [info] = await sdk.listSessions({ dir: '/proj' })
    expect(info).toMatchObject({ sessionId: 'sess-1', summary: 'First', firstPrompt: 'First', cwd: '/proj' })
    expect(await sdk.listSessions({ dir: '/other' })).toEqual([])
    const messages = await sdk.getSessionMessages('sess-1')
    expect(messages.map((m) => m.type)).toEqual(['user', 'assistant'])

    await sdk.renameSession('sess-1', 'Pix at checkout')
    expect(await sdk.getSessionInfo('sess-1')).toMatchObject({
      customTitle: 'Pix at checkout',
      summary: 'Pix at checkout'
    })

    const { sessionId } = await sdk.forkSession('sess-1', { dir: '/proj', title: 'Copy' })
    expect(sessionId).not.toBe('sess-1')
    expect(await sdk.getSessionInfo(sessionId)).toMatchObject({ customTitle: 'Copy' })
    const copy = await sdk.getSessionMessages(sessionId)
    expect(copy).toHaveLength(2)
    expect(copy[0].uuid).not.toBe(messages[0].uuid)
    // The most recent (the copy) comes first.
    expect((await sdk.listSessions({ dir: '/proj' })).map((s) => s.sessionId)).toEqual([sessionId, 'sess-1'])
  })

  it('persists to a file and survives a "restart" (new SDK with the same file)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'walph-fakestore-'))
    const file = join(dir, 'sessions.json')
    try {
      const first = createFakeSdk(parseFakeScript({ turns: [] }), file)
      ;(await runTurn(first, 'Persisted', { cwd: '/proj', sessionId: 'sess-9' })).close()
      await first.renameSession('sess-9', 'Name')
      const second = createFakeSdk(parseFakeScript({ turns: [] }), file)
      expect(await second.getSessionInfo('sess-9')).toMatchObject({ customTitle: 'Name', firstPrompt: 'Persisted' })
      // Resuming appends to the same session.
      ;(await runTurn(second, 'One more', { cwd: '/proj', resume: 'sess-9' })).close()
      expect((await second.getSessionMessages('sess-9')).length).toBe(4)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('resuming up to a message (rewind) drops the following ones', async () => {
    const sdk = createFakeSdk(parseFakeScript({ turns: [] }))
    ;(await runTurn(sdk, 'A', { cwd: '/p', sessionId: 's' })).close()
    ;(await runTurn(sdk, 'B', { cwd: '/p', resume: 's' })).close()
    const before = await sdk.getSessionMessages('s')
    ;(await runTurn(sdk, 'C', { cwd: '/p', resume: 's', resumeSessionAt: before[1].uuid })).close()
    const texts = JSON.stringify(await sdk.getSessionMessages('s'))
    expect(texts).toContain('"A"')
    expect(texts).not.toContain('"B"')
    expect(texts).toContain('"C"')
  })
})

describe('fake SDK - permission with suggestions', () => {
  const suggestions = [
    {
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'npm test' }],
      behavior: 'allow',
      destination: 'localSettings'
    }
  ]
  const step = { permission: { toolName: 'Bash', input: { command: 'npm test' }, suggestions } }

  it('passes the suggestions to canUseTool', async () => {
    const canUseTool = vi.fn(() => Promise.resolve({ behavior: 'allow', updatedInput: {} }))
    const h = start({ turns: [[step]] }, canUseTool)
    h.send()
    await collect(h.iter, isResult)
    expect(canUseTool).toHaveBeenCalledWith('Bash', { command: 'npm test' }, expect.objectContaining({ suggestions }))
    h.query.close()
  })

  it('does not ask when the rule is already in the folder settings.local.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'walph-fakeperm-'))
    try {
      await mkdir(join(dir, '.claude'))
      await writeFile(
        join(dir, '.claude', 'settings.local.json'),
        JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } })
      )
      const canUseTool = vi.fn()
      const sdk = createFakeSdk(parseFakeScript({ turns: [[step]] }))
      const prompt = new PushStream<SDKUserMessage>()
      const query = sdk.query({
        prompt,
        options: { canUseTool, cwd: dir }
      }) as unknown as AsyncIterable<SDKMessage> & {
        close(): void
      }
      const iter = query[Symbol.asyncIterator]()
      prompt.push(user('x'))
      const msgs = await collect(iter, isResult)
      expect(canUseTool).not.toHaveBeenCalled()
      expect(msgs.map((m) => m.type)).toContain('user')
      query.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('session "always allow" (updatedPermissions) applies to the next call of the conversation', async () => {
    const canUseTool = vi.fn(() =>
      Promise.resolve({
        behavior: 'allow',
        updatedInput: {},
        updatedPermissions: [{ ...suggestions[0], destination: 'session' }]
      })
    )
    const h = start({ turns: [[step], [step]] }, canUseTool)
    h.send()
    await collect(h.iter, isResult)
    h.send()
    await collect(h.iter, isResult)
    expect(canUseTool).toHaveBeenCalledTimes(1)
    h.query.close()
  })
})

describe('fake SDK - script commands and models', () => {
  it('reads commands and models from the script and validates the format', () => {
    const script = parseFakeScript({
      turns: [],
      commands: [{ name: 'review', description: 'Reviews', argumentHint: '[x]' }],
      models: [{ value: 'opus', supportedEffortLevels: ['low', 5] }]
    })
    expect(script.commands).toEqual([{ name: 'review', description: 'Reviews', argumentHint: '[x]' }])
    expect(script.models).toEqual([
      { value: 'opus', displayName: 'opus', description: '', supportedEffortLevels: ['low'] }
    ])
    expect(() => parseFakeScript({ turns: [], commands: 'x' })).toThrow('"commands"')
    expect(() => parseFakeScript({ turns: [], models: [{}] })).toThrow('models[0]')
  })

  it('init brings the script commands; logs mode, effort, model and the sent content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'walph-fakelog-'))
    try {
      const logPath = join(dir, 'calls.jsonl')
      const sdk = createFakeSdk(
        parseFakeScript({ turns: [[{ assistant: 'ok' }]], commands: [{ name: 'review' }] }),
        null,
        logPath
      )
      const prompt = new PushStream<SDKUserMessage>()
      const q = sdk.query({
        prompt,
        options: { permissionMode: 'default', allowDangerouslySkipPermissions: false } as never
      }) as unknown as AsyncIterable<SDKMessage> & Record<string, (...a: unknown[]) => Promise<unknown>>
      const init = (await q.initializationResult()) as { commands: { name: string }[] }
      expect(init.commands.map((c) => c.name)).toEqual(['review'])
      await q.setPermissionMode('auto')
      await expect(q.setPermissionMode('bypassPermissions')).rejects.toThrow('bypassPermissions')
      await q.applyFlagSettings({ effortLevel: null })
      prompt.push({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'hi' }] }
      } as unknown as SDKUserMessage)
      await new Promise((r) => setTimeout(r, 30))
      const lines = readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as Record<string, unknown>)
      expect(lines.map((l) => l.type)).toEqual([
        'query',
        'setPermissionMode',
        'setPermissionMode',
        'applyFlagSettings',
        'user'
      ])
      expect(lines[3]).toMatchObject({ settings: { effortLevel: null } })
      expect(lines[4]).toMatchObject({ content: [{ type: 'text', text: 'hi' }] })
      ;(q as unknown as { close(): void }).close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('fake SDK: MCP servers', () => {
  const script = {
    turns: [],
    mcpServers: [
      { name: 'a', status: 'failed', error: 'boom', scope: 'project' },
      { name: 'b', scope: 'user', status: 'needs-auth' }
    ]
  }
  const mcpOf = (sdk: unknown): never => sdk as never

  it('validates the mcpServers field', () => {
    expect(() => parseFakeScript({ turns: [], mcpServers: 'x' })).toThrow('"mcpServers"')
    expect(() => parseFakeScript({ turns: [], mcpServers: [{}] })).toThrow('mcpServers[0]')
    expect(parseFakeScript(script).mcpServers?.[1]).toMatchObject({ name: 'b', source: 'user', tools: [] })
  })

  it('init, reconnect, auth and toggle change the same state', async () => {
    const h = start(script)
    h.send()
    const [init] = await collect(h.iter, (m) => m.type === 'system' && m.subtype === 'init')
    expect((init as unknown as { mcp_servers: unknown[] }).mcp_servers).toEqual([
      { name: 'a', status: 'failed' },
      { name: 'b', status: 'needs-auth' }
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = h.query as unknown as Record<string, (...a: unknown[]) => Promise<any>>
    await q.reconnectMcpServer('a')
    await expect(q.mcpAuthenticate('b')).resolves.toMatchObject({ callbackExpected: true })
    await q.mcpSubmitOAuthCallbackUrl('b', 'http://localhost/cb')
    await q.toggleMcpServer('a', false)
    const list = await q.mcpServerStatus()
    expect(list.map((s: { name: string; status: string }) => [s.name, s.status])).toEqual([
      ['a', 'disabled'],
      ['b', 'connected']
    ])
    await q.mcpClearAuth('b')
    expect((await q.reloadPlugins()).mcpServers[1].status).toBe('needs-auth')
    await expect(q.toggleMcpServer('zzz', true)).rejects.toThrow('not found')
    h.query.close()
  })

  it('fake CLI: add-json and remove', async () => {
    const fake = createFakeClaude(parseFakeScript(script))
    const sdk = mcpOf(fake.sdk) as {
      query: (p: unknown) => { mcpServerStatus(): Promise<Array<{ name: string }>>; close(): void }
    }
    const cli = (args: string[]): Promise<string> => fake.runCli(args, { cwd: '/', env: {} })
    const q = sdk.query({ prompt: new PushStream<SDKUserMessage>(), options: {} })
    await cli(['mcp', 'add-json', '-s', 'local', '--', 'new', '{"type":"http","url":"https://x"}'])
    expect((await q.mcpServerStatus()).map((s) => s.name)).toEqual(['a', 'b', 'new'])
    await expect(cli(['mcp', 'add-json', '-s', 'local', '--', 'new', '{}'])).rejects.toThrow('already exists')
    await cli(['mcp', 'remove', '-s', 'local', '--', 'new'])
    await expect(cli(['mcp', 'remove', '-s', 'local', '--', 'new'])).rejects.toThrow('No MCP')
    expect((await q.mcpServerStatus()).map((s) => s.name)).toEqual(['a', 'b'])
    q.close()
  })
})

describe('fake SDK - new CLI events', () => {
  const label = (m: SDKMessage): string => (m.type === 'system' ? `system/${m.subtype}` : m.type)
  const run = (steps: unknown[], options: Record<string, unknown> = {}) => {
    const sdk = createFakeSdk(parseFakeScript({ turns: [steps] }))
    const prompt = new PushStream<SDKUserMessage>()
    const query = sdk.query({ prompt, options }) as unknown as AsyncIterable<SDKMessage>
    const iter = query[Symbol.asyncIterator]()
    prompt.push({ type: 'user' } as unknown as SDKUserMessage)
    return collect(iter, (m) => m.type === 'system' && m.subtype === 'session_state_changed' && m.state === 'idle')
  }

  it('validates the format of the new steps', () => {
    expect(() => parseFakeScript({ turns: [[{ taskProgress: {} }]] })).toThrow('"taskProgress" needs "taskId"')
    expect(() => parseFakeScript({ turns: [[{ toolProgress: {} }]] })).toThrow('"toolProgress" needs "toolUseId"')
    expect(() => parseFakeScript({ turns: [[{ modelRefusalFallback: { from: 'a' } }]] })).toThrow('"from" and "to"')
    expect(() => parseFakeScript({ turns: [[{ promptSuggestion: 1 }]] })).toThrow('must be text')
    expect(() => parseFakeScript({ turns: [[{ elicitation: 'x' }]] })).toThrow('must be an object')
    expect(parseFakeScript({ turns: [[{ apiRetry: {} }]] }).turns[0][0]).toEqual({
      apiRetry: { attempt: 1, maxRetries: 5, delayMs: 1000, errorStatus: null }
    })
  })

  it('emits each message in the CLI format', async () => {
    const msgs = await run([
      { rateLimit: { status: 'allowed_warning', rateLimitType: 'five_hour', utilization: 0.8 } },
      { apiRetry: { attempt: 2, maxRetries: 5, delayMs: 500, errorStatus: 529 } },
      { permissionDenied: { toolName: 'Bash', toolUseId: 't9', reason: 'classifier' } },
      {
        taskProgress: { taskId: 'a1', toolUseId: 't1', summary: 'Reading', totalTokens: 5, toolUses: 1, durationMs: 9 }
      },
      { toolProgress: { toolUseId: 't1', toolName: 'Bash', elapsedSeconds: 3 } },
      { commandsChanged: [{ name: 'new', description: 'x', argumentHint: '' }] },
      { modelRefusalFallback: { from: 'opus', to: 'sonnet', retracted: ['u1'] } }
    ])
    expect(msgs.map(label).slice(2, -2)).toEqual([
      'rate_limit_event',
      'system/api_retry',
      'system/permission_denied',
      'system/task_progress',
      'tool_progress',
      'system/commands_changed',
      'system/model_refusal_fallback'
    ])
    const by = (l: string) => msgs.find((m) => label(m) === l) as unknown as Record<string, unknown>
    expect(by('system/api_retry')).toMatchObject({ attempt: 2, max_retries: 5, retry_delay_ms: 500, error_status: 529 })
    expect(by('system/permission_denied')).toMatchObject({
      tool_name: 'Bash',
      tool_use_id: 't9',
      decision_reason: 'classifier'
    })
    expect(by('system/task_progress')).toMatchObject({
      task_id: 'a1',
      tool_use_id: 't1',
      summary: 'Reading',
      usage: { total_tokens: 5, tool_uses: 1, duration_ms: 9 }
    })
    expect(by('tool_progress')).toMatchObject({ tool_use_id: 't1', elapsed_time_seconds: 3 })
    expect(by('system/model_refusal_fallback')).toMatchObject({
      original_model: 'opus',
      fallback_model: 'sonnet',
      scope: 'session',
      retracted_message_uuids: ['u1']
    })
  })

  it('prompt_suggestion comes out after the result and only with promptSuggestions', async () => {
    const steps = [{ promptSuggestion: 'run the tests' }, { assistant: 'ok' }]
    const on = await run(steps, { promptSuggestions: true })
    expect(on.map(label).at(-1)).toBe('system/session_state_changed')
    const sdk = createFakeSdk(parseFakeScript({ turns: [steps] }))
    const prompt = new PushStream<SDKUserMessage>()
    const iter = (sdk.query({ prompt, options: { promptSuggestions: true } }) as unknown as AsyncIterable<SDKMessage>)[
      Symbol.asyncIterator
    ]()
    prompt.push({ type: 'user' } as unknown as SDKUserMessage)
    const all = await collect(iter, (m) => m.type === 'prompt_suggestion')
    expect(all.map(label).slice(-3)).toEqual(['result', 'system/session_state_changed', 'prompt_suggestion'])
    expect(all.at(-1)).toMatchObject({ suggestion: 'run the tests' })

    const off = await run(steps)
    expect(off.map(label)).not.toContain('prompt_suggestion')
  })

  it('elicitation calls onElicitation, logs and continues the turn', async () => {
    const calls = () =>
      (globalThis as unknown as { __walphFakeClaudeCalls: Array<Record<string, unknown>> }).__walphFakeClaudeCalls
    const before = calls().length
    const onElicitation = vi.fn(() => Promise.resolve({ action: 'accept', content: { name: 'Ana' } }))
    const msgs = await run(
      [{ elicitation: { serverName: 'docs', message: 'Name?', mode: 'form' } }, { assistant: 'after' }],
      { onElicitation }
    )
    expect(onElicitation).toHaveBeenCalledTimes(1)
    expect(onElicitation.mock.calls[0] as unknown[]).toMatchObject([{ serverName: 'docs', message: 'Name?' }, {}])
    expect(msgs.map(label)).toContain('assistant')
    const log = calls().slice(before)
    expect(log.find((e) => e.type === 'elicitation')).toMatchObject({
      request: { serverName: 'docs', mode: 'form' },
      result: { action: 'accept', content: { name: 'Ana' } }
    })
    const query = log.find((e) => e.type === 'query')
    expect(query).toMatchObject({
      options: { agentProgressSummaries: false, promptSuggestions: false, fallbackModel: null, onElicitation: true }
    })
  })

  it('cancelled elicitation ends the turn', async () => {
    const onElicitation = vi.fn(() => Promise.resolve({ action: 'cancel' }))
    const msgs = await run([{ elicitation: { message: 'x' } }, { assistant: 'never' }], { onElicitation })
    expect(msgs.map(label)).not.toContain('assistant')
  })
})
