import { describe, expect, it } from 'vitest'
import {
  applyMcpMemory,
  mcpKey,
  cleanCliError,
  mcpAddArgs,
  mcpRemoveArgs,
  normalizeMcpStatus,
  parseAuthResponse,
  parseCallbackUrl,
  parseMcpEnabled,
  parseMcpScope,
  parseServerName,
  redactArg,
  redactArgs,
  redactText,
  redactUrl,
  validateMcpServerInput
} from './mcp'

describe('normalizeMcpStatus', () => {
  it('ignores garbage and caps the list', () => {
    expect(normalizeMcpStatus(null)).toEqual([])
    expect(normalizeMcpStatus([1, null, { status: 'connected' }, { name: '' }])).toEqual([])
    const many = Array.from({ length: 300 }, (_, i) => ({ name: `s${i}`, status: 'connected' }))
    expect(normalizeMcpStatus(many)).toHaveLength(100)
  })

  it('unknown status becomes failed; scope comes from source, then from scope', () => {
    const [a, b, c] = normalizeMcpStatus([
      { name: 'a', status: 'wat', scope: 'user' },
      { name: 'b', status: 'connected', scope: 'user', source: 'plugin' },
      { name: 'c', status: 'disabled' }
    ])
    expect(a).toMatchObject({ status: 'failed', scope: 'user', editable: true })
    expect(b).toMatchObject({ scope: 'plugin', editable: false })
    expect(c).toMatchObject({ scope: 'unknown', editable: false })
  })

  it('the internal walph is never editable', () => {
    const [w] = normalizeMcpStatus([{ name: 'walph', status: 'connected', scope: 'user' }])
    expect(w.editable).toBe(false)
  })

  it('redacts env and headers (keys only), URL credentials and secret arguments', () => {
    const [stdio, http] = normalizeMcpStatus([
      {
        name: 'a',
        status: 'connected',
        scope: 'local',
        config: { type: 'stdio', command: 'npx', args: ['-y', '--api-key=abc', 'pkg'], env: { TOKEN: 'sekret' } }
      },
      {
        name: 'b',
        status: 'connected',
        scope: 'user',
        config: { type: 'http', url: 'https://u:p@host.io/mcp?key=sekret', headers: { Authorization: 'Bearer sekret' } }
      }
    ])
    expect(stdio.config).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '--api-key=***', 'pkg'],
      envKeys: ['TOKEN']
    })
    expect(http.config).toEqual({
      transport: 'http',
      url: 'https://host.io/mcp?key=***',
      headerKeys: ['Authorization']
    })
    expect(JSON.stringify([stdio, http])).not.toContain('sekret')
  })

  it('config without type but with command is stdio; a strange type is unknown', () => {
    const [a, b] = normalizeMcpStatus([
      { name: 'a', status: 'connected', config: { command: 'x' } },
      { name: 'b', status: 'connected', config: { type: 'foo' } }
    ])
    expect(a.config?.transport).toBe('stdio')
    expect(b.config?.transport).toBe('unknown')
  })

  it('tools: required name, annotations and sizes', () => {
    const [s] = normalizeMcpStatus([
      {
        name: 'a',
        status: 'connected',
        serverInfo: { name: 'srv', version: '1' },
        tools: [
          { name: 'read', description: 'x'.repeat(5000), annotations: { readOnly: true } },
          { name: 'del', annotations: { destructive: true } },
          { description: 'no name' }
        ]
      }
    ])
    expect(s.serverInfo).toEqual({ name: 'srv', version: '1' })
    expect(s.tools).toHaveLength(2)
    expect(s.tools[0]).toMatchObject({ name: 'read', readOnly: true, destructive: false })
    expect(s.tools[0].description).toHaveLength(2000)
    expect(s.tools[1]).toMatchObject({ description: '', destructive: true })
  })
})

describe('pending and memory', () => {
  it('pending with an error becomes failed', () => {
    const [a, b] = normalizeMcpStatus([
      { name: 'a', status: 'pending', error: 'timeout' },
      { name: 'b', status: 'pending' }
    ])
    expect([a.status, b.status]).toEqual(['failed', 'pending'])
  })
  it('applyMcpMemory: the real CLI shape (dynamic) becomes editable; plugin/claudeai does not', () => {
    const list = normalizeMcpStatus([
      {
        name: 'added',
        status: 'pending',
        scope: 'dynamic',
        source: 'dynamic',
        config: { type: 'stdio', command: 'node', args: ['-e', '0'] }
      },
      { name: 'p', status: 'connected', scope: 'dynamic', source: 'plugin' },
      { name: 'c', status: 'connected', scope: 'claudeai', source: 'claudeai' }
    ])
    const out = applyMcpMemory(
      list,
      new Map([
        ['added', 'project' as const],
        ['p', 'user' as const],
        ['c', 'user' as const]
      ]),
      new Set()
    )
    expect(out.map((s) => [s.name, s.scope, s.editable])).toEqual([
      ['added', 'project', true],
      ['p', 'plugin', false],
      ['c', 'claudeai', false]
    ])
  })
  it('applyMcpMemory: remembered scope only for those without scope; removed ones filtered', () => {
    const list = normalizeMcpStatus([
      { name: 'x', status: 'connected' },
      { name: 'y', status: 'connected', scope: 'user' },
      { name: 'z', status: 'connected', scope: 'project' }
    ])
    const out = applyMcpMemory(
      list,
      new Map([
        ['x', 'local' as const],
        ['y', 'project' as const]
      ]),
      new Set([mcpKey('z', 'project')])
    )
    expect(out.map((s) => [s.name, s.scope, s.editable])).toEqual([
      ['x', 'local', true],
      ['y', 'user', true]
    ])
  })
})

describe('extended redaction', () => {
  it('value after a sensitive flag, NAME=value, Authorization and Bearer', () => {
    expect(redactArgs(['--api-key', 'sk-123', '-y', 'API_TOKEN=abc', 'Authorization: Bearer xyz', 'ok'])).toEqual([
      '--api-key',
      '***',
      '-y',
      'API_TOKEN=***',
      'Authorization: ***',
      'ok'
    ])
    expect(redactText('failed with Bearer abc.def and token=zzz at https://h.io/a')).not.toMatch(/abc\.def|zzz/)
  })
  it('path segments that look like secrets', () => {
    expect(redactUrl('https://h.io/mcp/a1b2c3d4e5f6g7h8i9j0k1/v1')).toBe('https://h.io/mcp/***/v1')
    expect(redactUrl('https://h.io/very-long-readable-path-name')).toBe('https://h.io/very-long-readable-path-name')
  })
  it('the status error goes through redaction', () => {
    const [s] = normalizeMcpStatus([{ name: 'a', status: 'failed', error: 'GET https://h.io/x?token=abc failed' }])
    expect(s.error).toBe('GET https://h.io/x?token=*** failed')
  })
  it('secrets also in the JSON-escaped form', () => {
    const v = validateMcpServerInput({ ...base, env: { K: 'a"b-secret' } })
    expect(v.secrets).toContain('a\\"b-secret')
  })
})

describe('redactUrl / redactArg', () => {
  it('masks query and credentials; text that is not a URL only loses the userinfo', () => {
    expect(redactUrl('http://a:b@h/p?x=1&y=2')).toBe('http://h/p?x=***&y=***')
    expect(redactUrl('no url')).toBe('no url')
  })
  it('only masks arguments that look like secrets', () => {
    expect(redactArg('--token=abc')).toBe('--token=***')
    expect(redactArg('--port=80')).toBe('--port=80')
    expect(redactArg('plain')).toBe('plain')
  })
})

const base = { name: 'my-srv', scope: 'local', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }

describe('validateMcpServerInput', () => {
  it('valid stdio', () => {
    const v = validateMcpServerInput({ ...base, env: { API_KEY: 'secret-value', X: 'a' } })
    expect(v.config).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { API_KEY: 'secret-value', X: 'a' }
    })
    expect(v.secrets).toEqual(['secret-value'])
  })

  it('valid http/sse', () => {
    const v = validateMcpServerInput({
      name: 'h',
      scope: 'user',
      transport: 'sse',
      url: ' https://x.io/sse ',
      headers: { Authorization: 'Bearer t0ken' }
    })
    expect(v.config).toEqual({ type: 'sse', url: 'https://x.io/sse', headers: { Authorization: 'Bearer t0ken' } })
  })

  it.each([
    [{ ...base, name: 'with space' }, 'nome'],
    [{ ...base, name: '' }, 'nome'],
    [{ ...base, name: 'a'.repeat(65) }, 'nome'],
    [{ ...base, name: 'Walph' }, 'reservado'],
    [{ ...base, scope: 'managed' }, 'escopo'],
    [{ ...base, transport: 'ws' }, 'transporte'],
    [{ ...base, command: '  ' }, 'comando'],
    [{ ...base, args: [1] }, 'argumentos'],
    [{ ...base, env: { '1BAD': 'x' } }, 'variáveis'],
    [{ ...base, env: { OK: 'a\nb' } }, 'variáveis'],
    [{ name: 'h', scope: 'local', transport: 'http', url: 'ftp://x' }, 'http://'],
    [{ name: 'h', scope: 'local', transport: 'http', url: 'nothing' }, 'URL'],
    [{ name: 'h', scope: 'local', transport: 'http', url: 'https://x', headers: { 'Bad Key': 'v' } }, 'cabeçalhos'],
    ['x', 'formulário']
  ])('rejects %j', (input, fragment) => {
    expect(() => validateMcpServerInput(input)).toThrow(fragment)
  })
})

describe('CLI arguments', () => {
  it('add-json and remove use -- before the name', () => {
    const v = validateMcpServerInput(base)
    expect(mcpAddArgs(v)).toEqual([
      'mcp',
      'add-json',
      '-s',
      'local',
      '--',
      'my-srv',
      JSON.stringify({ type: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: {} })
    ])
    expect(mcpRemoveArgs('my-srv', 'project')).toEqual(['mcp', 'remove', '-s', 'project', '--', 'my-srv'])
  })
})

describe('cleanCliError / parseAuthResponse', () => {
  it('one line, without secrets, with a limit', () => {
    expect(cleanCliError('\nerror with abc123 here\nmore', ['abc123'])).toBe('error with *** here')
    expect(cleanCliError('x'.repeat(400), [])).toHaveLength(301)
  })
  it('only opens http(s)', () => {
    expect(parseAuthResponse({ authUrl: 'https://a.io/x', callbackExpected: true })).toEqual({
      authUrl: 'https://a.io/x',
      callbackExpected: true
    })
    expect(parseAuthResponse({ authUrl: 'javascript:alert(1)' })).toEqual({ callbackExpected: false })
    expect(parseAuthResponse(null)).toEqual({ callbackExpected: false })
  })
})

describe('parseCallbackUrl', () => {
  it('accepts http(s), trims and normalizes', () => {
    expect(parseCallbackUrl('  http://localhost:3118/callback?code=abc ')).toBe(
      'http://localhost:3118/callback?code=abc'
    )
    expect(parseCallbackUrl('https://example.com')).toBe('https://example.com/')
  })

  it.each([
    ['not text', 42],
    ['empty', ''],
    ['no scheme', 'localhost:3118/callback'],
    ['file scheme', 'file:///etc/passwd'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['too large', `https://example.com/${'a'.repeat(4000)}`]
  ])('rejects %s', (_what, value) => {
    expect(() => parseCallbackUrl(value)).toThrow('URL de retorno inválida.')
  })
})

describe('/mcp arguments from the renderer', () => {
  it('parseServerName accepts non-empty, bounded text', () => {
    expect(parseServerName('docs')).toBe('docs')
    for (const bad of ['', 42, null, 'a'.repeat(500)]) expect(() => parseServerName(bad)).toThrow()
  })

  it('parseMcpEnabled only accepts boolean', () => {
    expect(parseMcpEnabled(false)).toBe(false)
    for (const bad of ['true', 1, undefined]) expect(() => parseMcpEnabled(bad)).toThrow('inválido')
  })

  it('parseMcpScope only accepts editable scopes', () => {
    expect(parseMcpScope('project')).toBe('project')
    for (const bad of ['sdk', 'managed', '', 7]) expect(() => parseMcpScope(bad)).toThrow('Escopo MCP inválido.')
  })
})
