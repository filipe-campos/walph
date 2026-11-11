import { describe, expect, it, vi } from 'vitest'
import { installFakeApi } from './fakeApi'

describe('installFakeApi', () => {
  it('methods without override resolve empty and are spies', async () => {
    const { api } = installFakeApi()
    await expect(window.api.git.status('/r')).resolves.toBeUndefined()
    expect(api.git.status).toHaveBeenCalledWith('/r')
  })

  it('an override becomes a spy and primitive values can be replaced', async () => {
    const { api } = installFakeApi({ platform: 'win32', fs: { exists: () => Promise.resolve(true) } })
    expect(window.api.platform).toBe('win32')
    await expect(window.api.fs.exists('/a')).resolves.toBe(true)
    expect(api.fs.exists).toHaveBeenCalledTimes(1)
  })

  it('a vi.fn passed as override is the returned spy itself', () => {
    const exists = vi.fn(() => Promise.resolve(false))
    const { api } = installFakeApi({ fs: { exists } })
    expect(api.fs.exists).toBe(exists)
  })

  it('emit delivers to subscribers and disposing stops the delivery', () => {
    const { emit } = installFakeApi()
    const seen: string[] = []
    const off = window.api.terminal.onTitle((id, title) => seen.push(`${id}:${title}`))
    emit.terminal.onTitle('t1', 'zsh')
    off()
    expect(() => emit.terminal.onTitle('t1', 'bash')).toThrow('without subscribers')
    expect(seen).toEqual(['t1:zsh'])
  })

  it('the top-level channel (onCommand) is also emitted', () => {
    const { emit } = installFakeApi()
    const cb = vi.fn()
    window.api.onCommand(cb)
    emit.onCommand('view.git')
    expect(cb).toHaveBeenCalledWith('view.git')
  })

  it('reset forgets the subscriptions', () => {
    const fake = installFakeApi()
    const cb = vi.fn()
    window.api.onCommand(cb)
    fake.reset()
    expect(() => fake.emit.onCommand('view.git')).toThrow('without subscribers')
    expect(cb).not.toHaveBeenCalled()
  })

  it('a namespace is not thenable and library probes find no method', async () => {
    installFakeApi()
    expect(await Promise.resolve(window.api.fs)).toBe(window.api.fs)
    expect((window.api.fs as unknown as Record<string, unknown>).asymmetricMatch).toBeUndefined()
    expect((window.api.git as unknown as Record<string, unknown>).toJSON).toBeUndefined()
  })

  it('synchronous contract methods return the neutral value, not a Promise', () => {
    installFakeApi()
    expect(window.api.files.pathForFile(new File([], 'a'))).toBe('')
    expect(window.api.terminal.write('t', 'x')).toBeUndefined()
  })

  it('emit without subscribers fails instead of passing silently', () => {
    const { emit } = installFakeApi()
    expect(() => emit.claude.onEvent({ type: 'title', id: 'c', title: 't' })).toThrow(
      'emit claude.onEvent without subscribers'
    )
  })

  it('an on* override still subscribes and disposing calls both', () => {
    const own = vi.fn()
    const { emit } = installFakeApi({ onCommand: () => own })
    const cb = vi.fn()
    const off = window.api.onCommand(cb)
    emit.onCommand('view.git')
    expect(cb).toHaveBeenCalledWith('view.git')
    off()
    expect(own).toHaveBeenCalledTimes(1)
    expect(() => emit.onCommand('view.git')).toThrow('without subscribers')
  })

  it('on* without a callback fails with a clear message', () => {
    installFakeApi()
    expect(() => (window.api.onCommand as unknown as (cb: unknown) => void)(undefined)).toThrow('callback')
  })

  it('the default platform is linux', () => {
    installFakeApi()
    expect(window.api.platform).toBe('linux')
  })

  it('an override with the wrong signature does not compile', () => {
    // @ts-expect-error `exists` devolve Promise<boolean>
    installFakeApi({ fs: { exists: () => 'sim' } })
    expect(window.api.fs.exists).toBeTypeOf('function')
  })
})
