import { describe, expect, it } from 'vitest'
import { sanitizeSettings } from '@shared/settings'
import { configSignature, languageIdFor, resolveServers, serverForPath } from './serverConfig'

describe('resolveServers', () => {
  it('the built-in typescript exists without configuration', () => {
    const [ts] = resolveServers({})
    expect(ts).toMatchObject({ id: 'typescript', builtin: true, command: null })
    expect(ts.extensions).toEqual(
      expect.arrayContaining(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])
    )
  })

  it('enabled:false turns off the built-in one', () => {
    expect(resolveServers({ typescript: { enabled: false } })).toEqual([])
  })

  it('a typescript entry only changes what it defines', () => {
    const [ts] = resolveServers({ typescript: { extensions: ['.TS'] } })
    expect(ts.builtin).toBe(true)
    expect(ts.extensions).toEqual(['.ts'])
    const [custom] = resolveServers({ typescript: { command: 'tsls', args: ['--stdio'] } })
    expect(custom).toMatchObject({ builtin: false, command: 'tsls', args: ['--stdio'] })
  })

  it('custom servers come before the built-in one; disabled and incomplete ones disappear', () => {
    const list = resolveServers({
      py: { command: 'pylsp', extensions: ['.py'] },
      off: { command: 'x', extensions: ['.x'], enabled: false },
      incomplete: { command: 'x' }
    })
    expect(list.map((s) => s.id)).toEqual(['py', 'typescript'])
  })
})

describe('useWorkspaceTypeScript', () => {
  it('is false by default and changes the signature when on', () => {
    const [off] = resolveServers({})
    const [on] = resolveServers({ typescript: { useWorkspaceTypeScript: true } })
    expect(off.useWorkspaceTypeScript).toBe(false)
    expect(on.useWorkspaceTypeScript).toBe(true)
    expect(configSignature(on)).not.toBe(configSignature(off))
  })
  it('only holds for the typescript id (validator)', () => {
    const ok = sanitizeSettings({ 'lsp.servers': { typescript: { useWorkspaceTypeScript: true } } })
    expect(ok.warnings).toEqual([])
    const bad = sanitizeSettings({
      'lsp.servers': { py: { command: 'x', extensions: ['.py'], useWorkspaceTypeScript: true } }
    })
    expect(bad.warnings).not.toEqual([])
  })
})

describe('serverForPath / languageIdFor', () => {
  const servers = resolveServers({ py: { command: 'pylsp', extensions: ['.py'], languageId: 'python' } })
  it('picks by extension case-insensitively', () => {
    expect(serverForPath(servers, '/p/a.PY')?.id).toBe('py')
    expect(serverForPath(servers, '/p/a.ts')?.id).toBe('typescript')
    expect(serverForPath(servers, '/p/README')).toBeUndefined()
    expect(serverForPath(servers, '/p/a.md')).toBeUndefined()
  })
  it('languageId by extension on the built-in one and the configured one on custom ones', () => {
    const ts = servers[1]
    expect(languageIdFor(ts, '/p/a.tsx')).toBe('typescriptreact')
    expect(languageIdFor(ts, '/p/a.mjs')).toBe('javascript')
    expect(languageIdFor(ts, '/p/a.jsx')).toBe('javascriptreact')
    expect(languageIdFor(ts, '/p/a.mts')).toBe('typescript')
    expect(languageIdFor(servers[0], '/p/a.py')).toBe('python')
  })
  it('the signature changes with the command', () => {
    const [a] = resolveServers({ x: { command: 'a', extensions: ['.x'] } })
    const [b] = resolveServers({ x: { command: 'b', extensions: ['.x'] } })
    expect(configSignature(a)).not.toBe(configSignature(b))
  })
})
