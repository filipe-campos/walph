import { describe, expect, it, vi } from 'vitest'

import type { ClaudePermissionRequest } from '@shared/types'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import { validateMcpServerInput } from '../mcp'
import { type Harness, canUse, flush, lastRequest, of, setup, toolOpts, useTempRoot } from '../testing/fakeQuery'

useTempRoot()

describe('MCP servers', () => {
  const input = {
    name: 'new',
    scope: 'local' as const,
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { TOKEN: 'secret-123' }
  }

  it('normalized list: env values never leave and walph is read-only', async () => {
    const h = setup()
    await h.conv.start()
    const list = await h.conv.mcp.status()
    expect(list.map((s) => [s.name, s.editable])).toEqual([
      ['docs', true],
      ['walph', false]
    ])
    expect(JSON.stringify(list)).not.toContain('"v"')
    expect(list[0].config).toMatchObject({ transport: 'stdio', command: 'npx', envKeys: ['K'] })
    await h.conv.close()
  })

  it('actions only accept names from the last list', async () => {
    const h = setup()
    await h.conv.start()
    await expect(h.conv.mcp.toggle('docs', false)).rejects.toThrow('não existe mais')
    await h.conv.mcp.status()
    await h.conv.mcp.toggle('docs', false)
    expect(h.queries[0].toggleMcpServer).toHaveBeenCalledWith('docs', false)
    await expect(h.conv.mcp.toggle('ghost', true)).rejects.toThrow('não existe mais')
    await expect(h.conv.mcp.toggle('walph', false)).rejects.toThrow('interno')
    await h.conv.mcp.reconnect('docs')
    expect(h.queries[0].reconnectMcpServer).toHaveBeenCalledWith('docs')
    await h.conv.close()
  })

  it('authenticates: opens only http(s) URLs and reports the callback', async () => {
    const h = setup()
    const open = vi.fn(() => Promise.resolve())
    h.deps.openExternal = open
    await h.conv.start()
    await h.conv.mcp.status()
    await expect(h.conv.mcp.authenticate('docs')).resolves.toEqual({
      authUrl: 'https://auth.example/x',
      awaitingCallback: true
    })
    expect(open).toHaveBeenCalledWith('https://auth.example/x')
    h.queries[0].mcpAuthenticate.mockResolvedValueOnce({
      authUrl: 'file:///etc/passwd',
      requiresUserAction: false,
      callbackExpected: false
    })
    await expect(h.conv.mcp.authenticate('docs')).resolves.toEqual({ awaitingCallback: false })
    expect(open).toHaveBeenCalledTimes(1)
    await h.conv.close()
  })

  it('without the method in the CLI: pt-BR error', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.mcp.status()
    ;(h.queries[0] as unknown as Record<string, unknown>).mcpClearAuth = undefined
    await expect(h.conv.mcp.clearAuth('docs')).rejects.toThrow('não suporta')
    await h.conv.close()
  })

  it('callback: the valid URL goes to the CLI', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.mcp.status()
    await h.conv.mcp.submitCallback('docs', 'http://localhost:1234/cb?code=1')
    expect(h.queries[0].mcpSubmitOAuthCallbackUrl).toHaveBeenCalledWith('docs', 'http://localhost:1234/cb?code=1')
    await h.conv.close()
  })

  it('add: validates, runs the CLI, reloads and warns when the session did not pick it up', async () => {
    const h = setup()
    const runCli = vi.fn(() => Promise.resolve(''))
    h.deps.runCli = runCli
    await h.conv.start()
    await h.conv.mcp.add(validateMcpServerInput(input))
    expect(runCli).toHaveBeenCalledWith(
      ['mcp', 'add-json', '-s', 'local', '--', 'new', expect.stringContaining('"command":"npx"')],
      expect.objectContaining({ cwd: h.root })
    )
    expect(h.queries[0].reloadPlugins).toHaveBeenCalled()
    expect(of(h, 'notice').some((n) => n.message.includes('novas conversas'))).toBe(true)
    expect(() => validateMcpServerInput({ ...input, name: 'walph' })).toThrow('reservado')
    expect(runCli).toHaveBeenCalledTimes(1)
    await h.conv.close()
  })

  it('add: CLI error without leaking the secret', async () => {
    const h = setup()
    h.deps.runCli = () => Promise.reject(new Error('failed with secret-123 here'))
    await h.conv.start()
    await expect(h.conv.mcp.add(validateMcpServerInput(input))).rejects.toThrow(
      /Não foi possível salvar o servidor MCP: failed with \*\*\* here/
    )
    await h.conv.close()
  })

  it('add: no notice when the server shows up in the list', async () => {
    const h = setup()
    h.deps.runCli = () => {
      h.queries[0].mcpList.push({ name: 'new', status: 'connected', scope: 'local' })
      return Promise.resolve('')
    }
    await h.conv.start()
    const list = await h.conv.mcp.add(validateMcpServerInput(input))
    expect(list.some((s) => s.name === 'new')).toBe(true)
    expect(of(h, 'notice')).toHaveLength(0)
    await h.conv.close()
  })

  it('add: a server without scope in the live CLI becomes editable with the remembered scope', async () => {
    const h = setup()
    h.deps.runCli = () => {
      h.queries[0].mcpList.push({ name: 'new', status: 'connected', scope: '' })
      return Promise.resolve('')
    }
    await h.conv.start()
    const list = await h.conv.mcp.add(validateMcpServerInput(input))
    expect(list.find((s) => s.name === 'new')).toMatchObject({ scope: 'local', editable: true })
    expect(of(h, 'notice')).toHaveLength(0)
    await h.conv.close()
  })

  it('remove: the live CLI still lists it, but the returned list and the following ones hide it', async () => {
    const h = setup()
    h.deps.runCli = () => Promise.resolve('')
    await h.conv.start()
    await h.conv.mcp.status()
    const list = await h.conv.mcp.remove('docs', 'project')
    expect(list.map((s) => s.name)).toEqual(['walph'])
    expect((await h.conv.mcp.status()).map((s) => s.name)).toEqual(['walph'])
    expect(h.queries[0].toggleMcpServer).not.toHaveBeenCalled()
    await h.conv.close()
  })

  it('close aborts the ongoing claude mcp', async () => {
    const h = setup()
    let signal: AbortSignal | undefined
    h.deps.runCli = (_a, ctx) => {
      signal = ctx.signal
      return new Promise<string>(() => {})
    }
    await h.conv.start()
    void h.conv.mcp.add(validateMcpServerInput(input)).catch(() => undefined)
    await flush()
    expect(signal?.aborted).toBe(false)
    await h.conv.close()
    expect(signal?.aborted).toBe(true)
  })

  it('toggling walph is rejected', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.mcp.status()
    h.queries[0].mcpList.push({ name: 'walph', status: 'connected', scope: 'user' })
    await h.conv.mcp.status()
    await expect(h.conv.mcp.toggle('walph', false)).rejects.toThrow('interno')
    await h.conv.close()
  })

  it('MCP actions and a pending login hold off idle sleep', async () => {
    const h = setup()
    h.deps.idleSleepMs = 50
    h.deps.openExternal = () => Promise.resolve()
    await h.conv.start()
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      total_cost_usd: 0,
      duration_ms: 1
    })
    await h.conv.mcp.status()
    await h.conv.mcp.authenticate('docs')
    await new Promise((r) => setTimeout(r, 200))
    expect(h.queries[0].close).not.toHaveBeenCalled()
    // With no server waiting for login, sleep comes back.
    h.queries[0].mcpList = [{ name: 'docs', status: 'connected', scope: 'project' }]
    await h.conv.mcp.status()
    await new Promise((r) => setTimeout(r, 200))
    expect(h.queries[0].close).toHaveBeenCalled()
    await h.conv.close()
  })

  it('remove: editable only; warns if still listed', async () => {
    const h = setup()
    const runCli = vi.fn(() => Promise.resolve(''))
    h.deps.runCli = runCli
    await h.conv.start()
    await h.conv.mcp.status()
    await expect(h.conv.mcp.remove('walph', 'user')).rejects.toThrow('removidos')
    await expect(h.conv.mcp.remove('docs', 'user')).rejects.toThrow('removidos')
    await h.conv.mcp.remove('docs', 'project')
    expect(runCli).toHaveBeenCalledWith(['mcp', 'remove', '-s', 'project', '--', 'docs'], expect.anything())
    expect(of(h, 'notice').some((n) => n.message.includes('removido'))).toBe(true)
    await h.conv.close()
  })
})

describe('ClaudeConversation - MCP elicitation', () => {
  type Elicit = (
    request: Record<string, unknown>,
    o: { signal: AbortSignal; requestId: string }
  ) => Promise<{ action: string; content?: Record<string, unknown> }>
  const onElicitation = (h: Harness): Elicit => h.queries[0].params.options.onElicitation as Elicit
  const schema = {
    type: 'object',
    properties: { name: { type: 'string', minLength: 2 }, color: { type: 'string', enum: ['r', 'g'] } },
    required: ['name']
  }
  const call = (h: Harness, request: Record<string, unknown>, signal = new AbortController().signal) =>
    onElicitation(h)({ serverName: 'docs', message: 'Fill in', ...request }, { signal, requestId: 'r' })
  const req = (h: Harness): Extract<ClaudePermissionRequest, { kind: 'elicitation' }> => {
    const r = lastRequest(h)
    if (r.kind !== 'elicitation') throw new Error('kind')
    return r
  }

  it('form: card, attention, validated answer and content to the server', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const p = call(h, { mode: 'form', requestedSchema: schema })
    await flush()
    const r = req(h)
    expect(r).toMatchObject({ serverName: 'docs', mode: 'form', message: 'Fill in' })
    expect(r.fields.map((f) => f.key)).toEqual(['name', 'color'])
    expect(of(h, 'sessionStatus').at(-1)!.status).toBe('attention')

    // Invalid (missing required field, option outside the list) stays pending.
    expect(h.conv.respond(r.requestId, { behavior: 'elicitation', action: 'accept', content: {} })).toBe(false)
    expect(
      h.conv.respond(r.requestId, { behavior: 'elicitation', action: 'accept', content: { name: 'Ana', color: 'x' } })
    ).toBe(false)
    // A behavior of another request type is rejected too.
    expect(h.conv.respond(r.requestId, { behavior: 'allow' })).toBe(false)
    expect(h.conv.respond(r.requestId, { behavior: 'skip' })).toBe(false)

    expect(
      h.conv.respond(r.requestId, {
        behavior: 'elicitation',
        action: 'accept',
        content: { name: 'Ana', color: 'g', extra: 1 }
      })
    ).toBe(true)
    await expect(p).resolves.toEqual({ action: 'accept', content: { name: 'Ana', color: 'g' } })
    expect(of(h, 'sessionStatus').at(-1)!.status).not.toBe('attention')
    await h.conv.close()
  })

  it('decline and cancel pass straight through; closing the request cancels', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const a = call(h, { mode: 'form', requestedSchema: schema })
    await flush()
    h.conv.respond(req(h).requestId, { behavior: 'elicitation', action: 'decline' })
    await expect(a).resolves.toEqual({ action: 'decline' })

    const b = call(h, { mode: 'form', requestedSchema: schema })
    await flush()
    h.conv.respond(req(h).requestId, { behavior: 'elicitation', action: 'cancel' })
    await expect(b).resolves.toEqual({ action: 'cancel' })

    const ctl = new AbortController()
    const c = call(h, { mode: 'form', requestedSchema: schema }, ctl.signal)
    await flush()
    ctl.abort()
    await expect(c).resolves.toEqual({ action: 'cancel' })
    expect(of(h, 'permissionCancelled')).toHaveLength(1)
    await h.conv.close()
  })

  it('url: accepting opens in the browser through main; declining does not', async () => {
    const h = setup()
    const open = vi.fn(() => Promise.resolve())
    h.deps.openExternal = open
    await h.conv.start()
    await flush()
    const p = call(h, { mode: 'url', url: 'https://auth.example/login', message: 'Sign in' })
    await flush()
    const r = req(h)
    expect(r).toMatchObject({ mode: 'url', url: 'https://auth.example/login', fields: [] })
    expect(h.conv.respond(r.requestId, { behavior: 'elicitation', action: 'accept' })).toBe(true)
    await expect(p).resolves.toEqual({ action: 'accept' })
    expect(open).toHaveBeenCalledWith('https://auth.example/login')

    const q = call(h, { mode: 'url', url: 'https://auth.example/login' })
    await flush()
    h.conv.respond(req(h).requestId, { behavior: 'elicitation', action: 'decline' })
    await expect(q).resolves.toEqual({ action: 'decline' })
    expect(open).toHaveBeenCalledTimes(1)
    await h.conv.close()
  })

  it('unsupported format or non-http(s) URL: declines on its own and warns, without a card', async () => {
    const h = setup()
    const open = vi.fn(() => Promise.resolve())
    h.deps.openExternal = open
    await h.conv.start()
    await flush()
    await expect(
      call(h, { mode: 'form', requestedSchema: { type: 'object', properties: { x: { type: 'object' } } } })
    ).resolves.toEqual({ action: 'decline' })
    await expect(call(h, { mode: 'url', url: 'file:///etc/passwd' })).resolves.toEqual({ action: 'decline' })
    expect(of(h, 'permission')).toHaveLength(0)
    expect(of(h, 'notice').map((n) => n.message)).toEqual([
      'O servidor MCP "docs" pediu dados num formato que o Walph não mostra; o pedido foi recusado.',
      'O servidor MCP "docs" pediu para abrir um endereço que não é http(s); o pedido foi recusado.'
    ])
    expect(open).not.toHaveBeenCalled()
    await h.conv.close()
  })

  it('url: a failure to open the browser cancels and warns instead of accepting', async () => {
    const h = setup()
    h.deps.openExternal = () => Promise.reject(new Error('no browser'))
    await h.conv.start()
    await flush()
    const p = call(h, { mode: 'url', url: 'https://auth.example/login' })
    await flush()
    h.conv.respond(req(h).requestId, { behavior: 'elicitation', action: 'accept' })
    await expect(p).resolves.toEqual({ action: 'cancel' })
    expect(of(h, 'notice')[0].message).toContain('navegador')
    await h.conv.close()
  })

  it('other requests reject the elicitation answer and stay pending', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const p = canUse(h)('Bash', { command: 'ls' }, toolOpts())
    await flush()
    const r = lastRequest(h)
    expect(h.conv.respond(r.requestId, { behavior: 'elicitation', action: 'accept' })).toBe(false)
    h.conv.respond(r.requestId, { behavior: 'deny' })
    await p
    await h.conv.close()
  })

  it('a closed conversation cancels without asking', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    await h.conv.close()
    await expect(call(h, { mode: 'form' })).resolves.toEqual({ action: 'cancel' })
  })
})
