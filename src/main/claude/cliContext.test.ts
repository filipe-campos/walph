import { describe, expect, it } from 'vitest'
import type { Settings } from '@shared/types'
import { resolveClaudeExecutable, resolveCliContext } from './cliContext'

const isFile = (p: string): boolean => p === '/opt/bin/claude'

describe('resolveClaudeExecutable', () => {
  it('empty uses the SDK binary; name and absolute path resolve; the rest throws', () => {
    expect(resolveClaudeExecutable('  ', '/opt/bin', 'linux', isFile)).toBeUndefined()
    expect(resolveClaudeExecutable('claude', '/opt/bin', 'linux', isFile)).toBe('/opt/bin/claude')
    expect(resolveClaudeExecutable('/opt/bin/claude', '', 'linux', isFile)).toBe('/opt/bin/claude')
    expect(() => resolveClaudeExecutable('claude', '/usr/bin', 'linux', isFile)).toThrow('PATH')
    expect(() => resolveClaudeExecutable('/x/claude', '', 'linux', isFile)).toThrow('não encontrado')
  })
  it('Windows: rejects .cmd with guidance', () => {
    const win = (p: string): boolean => p === 'C:\\c\\claude.cmd'
    expect(() => resolveClaudeExecutable('claude', 'C:\\c', 'win32', win)).toThrow('claude.exe')
  })
})

describe('resolveCliContext', () => {
  const settings = (over: Record<string, unknown>): Settings =>
    ({ 'claude.executable': '', 'claude.env': {}, ...over }) as unknown as Settings

  it('combines cwd, user env and login PATH, without executable when empty', async () => {
    const ctx = await resolveCliContext(settings({ 'claude.env': { FOO: 'bar' } }), '/proj', () =>
      Promise.resolve('/login/bin')
    )
    expect(ctx.cwd).toBe('/proj')
    expect(ctx.env.FOO).toBe('bar')
    expect(ctx.env.PATH ?? ctx.env.Path).toMatch(/^\/login\/bin/)
    expect(ctx).not.toHaveProperty('executable')
  })
  it('removes ELECTRON_RUN_AS_NODE and the fake SDK variables', async () => {
    const ctx = await resolveCliContext(
      settings({ 'claude.env': { ELECTRON_RUN_AS_NODE: '1', WALPH_FAKE_CLAUDE_LOG: '/log' } }),
      '/proj'
    )
    expect(ctx.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(ctx.env).not.toHaveProperty('WALPH_FAKE_CLAUDE_LOG')
  })
})
