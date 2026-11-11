import { describe, expect, it } from 'vitest'
import type { ClaudeMcpServer } from '@shared/types'
import {
  buildServerInput,
  canLogout,
  canToggle,
  configSummary,
  groupServers,
  needsPolling,
  parseKeyValueLines,
  splitArgs,
  statusDot,
  statusLabel,
  toolCountLabel,
  type McpFormValues
} from './claudeMcp'

const server = (over: Partial<ClaudeMcpServer> = {}): ClaudeMcpServer => ({
  name: 'a',
  status: 'connected',
  scope: 'project',
  editable: true,
  tools: [],
  ...over
})

describe('groupServers', () => {
  it('sorts the groups and the names, and omits empty groups', () => {
    const groups = groupServers([
      server({ name: 'z', scope: 'user' }),
      server({ name: 'walph', scope: 'sdk' }),
      server({ name: 'b', scope: 'project' }),
      server({ name: 'a', scope: 'project' }),
      server({ name: 'x', scope: 'plugin' }),
      server({ name: 'y', scope: 'managed' })
    ])
    expect(groups.map((g) => g.label)).toEqual(['Projeto', 'Usuário', 'Plugins', 'Interno e outros'])
    expect(groups[0].servers.map((s) => s.name)).toEqual(['a', 'b'])
    expect(groups[3].servers.map((s) => s.name)).toEqual(['walph', 'y'])
  })
})

describe('labels', () => {
  it('translates the status', () => {
    expect(statusLabel('needs-auth')).toBe('Requer autenticação')
    expect(statusLabel('pending')).toBe('Conectando…')
    expect(statusDot('failed')).toBe('error')
    expect(statusDot('disabled')).toBe('idle')
  })
  it('counts tools only when connected', () => {
    const tools = [{ name: 't', description: '', readOnly: false, destructive: false }]
    expect(toolCountLabel(server({ tools }))).toBe('1 ferramenta')
    expect(toolCountLabel(server({ tools: [...tools, ...tools] }))).toBe('2 ferramentas')
    expect(toolCountLabel(server({ status: 'failed', tools }))).toBe('')
  })
  it('the internal walph does not toggle on/off', () => {
    expect(canToggle(server({ name: 'walph', scope: 'sdk' }))).toBe(false)
    expect(canToggle(server())).toBe(true)
  })
  it('"Sair" only for connected http/sse/claude.ai', () => {
    expect(canLogout(server({ config: { transport: 'http' } }))).toBe(true)
    expect(canLogout(server({ config: { transport: 'stdio' } }))).toBe(false)
    expect(canLogout(server({ scope: 'claudeai' }))).toBe(true)
    expect(canLogout(server({ status: 'needs-auth', config: { transport: 'http' } }))).toBe(false)
  })
  it('polling with a server connecting or authentication in progress', () => {
    expect(needsPolling([server()], false)).toBe(false)
    expect(needsPolling([server({ status: 'pending' })], false)).toBe(true)
    expect(needsPolling([server()], true)).toBe(true)
  })
  it('summarizes the config', () => {
    expect(configSummary(server({ config: { transport: 'stdio', command: 'npx', args: ['-y', 'x'] } }))).toBe(
      'npx -y x'
    )
    expect(configSummary(server({ config: { transport: 'http', url: 'https://a.b' } }))).toBe('https://a.b')
    expect(configSummary(server())).toBe('')
  })
})

describe('parseKeyValueLines', () => {
  it('reads pairs, ignores empty lines and comments, keeps "=" in the value', () => {
    const r = parseKeyValueLines('A=1\n\n# note\r\nB = x=y \nA=2', 'env')
    expect(r).toEqual({ ok: true, value: { A: '2', B: 'x=y' } })
  })
  it('rejects a line without "=" or an invalid key', () => {
    expect(parseKeyValueLines('hello', 'env')).toEqual({ ok: false, error: 'Linha 1: use CHAVE=valor.' })
    expect(parseKeyValueLines('OK=1\n1X=2', 'env')).toMatchObject({ ok: false })
    expect(parseKeyValueLines('=v', 'env')).toMatchObject({ ok: false })
  })
  it('headers accept a hyphen; env does not', () => {
    expect(parseKeyValueLines('X-Api-Key=abc', 'header')).toEqual({ ok: true, value: { 'X-Api-Key': 'abc' } })
    expect(parseKeyValueLines('X-Api-Key=abc', 'env')).toMatchObject({ ok: false })
  })
})

describe('splitArgs', () => {
  it('splits by space and respects quotes', () => {
    expect(splitArgs('npx -y "my pkg" \'a b\' c')).toEqual(['npx', '-y', 'my pkg', 'a b', 'c'])
  })
  it('empty quotes become an empty argument', () => {
    expect(splitArgs('a "" b')).toEqual(['a', '', 'b'])
  })
  it('escapes', () => {
    expect(splitArgs('a\\ b "c\\"d"')).toEqual(['a b', 'c"d'])
    expect(splitArgs("'a\\b'")).toEqual(['a\\b'])
  })
  it('unclosed quotes → null; empty → []', () => {
    expect(splitArgs('a "b')).toBeNull()
    expect(splitArgs('   ')).toEqual([])
  })
})

describe('buildServerInput', () => {
  it('uses the text of the chosen transport', () => {
    const v: McpFormValues = {
      name: 'a',
      transport: 'sse',
      commandLine: '',
      url: 'https://x.dev',
      env: 'A=1',
      headers: 'X-Key=h',
      scope: 'local'
    }
    expect(buildServerInput(v)).toMatchObject({ ok: true, input: { headers: { 'X-Key': 'h' } } })
  })

  const base: McpFormValues = {
    name: 'fs',
    transport: 'stdio',
    commandLine: 'npx -y "@x/server" --root "/a b"',
    url: '',
    env: 'TOKEN=abc',
    headers: 'X-Key=h',
    scope: 'local'
  }
  it('builds stdio', () => {
    expect(buildServerInput(base)).toEqual({
      ok: true,
      input: {
        name: 'fs',
        scope: 'local',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@x/server', '--root', '/a b'],
        env: { TOKEN: 'abc' }
      }
    })
  })
  it('builds http with headers and without empty env', () => {
    const r = buildServerInput({ ...base, transport: 'http', url: ' https://x.dev/mcp ', headers: '', scope: 'user' })
    expect(r).toEqual({ ok: true, input: { name: 'fs', scope: 'user', transport: 'http', url: 'https://x.dev/mcp' } })
  })
  it('accumulates errors per field', () => {
    const r = buildServerInput({ ...base, name: 'a b', commandLine: '  ', env: 'x' })
    expect(r).toMatchObject({ ok: false, errors: { name: expect.any(String), commandLine: 'Informe o comando.' } })
    expect(r.ok === false && r.errors.pairs).toBeTruthy()
  })
  it('validates the URL', () => {
    expect(buildServerInput({ ...base, transport: 'sse', url: 'ftp://x' })).toMatchObject({
      ok: false,
      errors: { url: expect.any(String) }
    })
    expect(buildServerInput({ ...base, transport: 'sse', url: '' })).toMatchObject({
      ok: false,
      errors: { url: 'Informe a URL.' }
    })
  })
})
