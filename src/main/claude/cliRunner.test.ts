import { describe, expect, it } from 'vitest'
import { CliExitError, nativeBinaryCandidates, resolveNativeBinary, runClaudeCli } from './cliRunner'

describe('nativeBinaryCandidates', () => {
  it('follows the sdk.mjs rule', () => {
    expect(nativeBinaryCandidates('darwin', 'arm64', false)).toEqual([
      '@anthropic-ai/claude-agent-sdk-darwin-arm64/claude'
    ])
    expect(nativeBinaryCandidates('win32', 'x64', false)).toEqual([
      '@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe'
    ])
    expect(nativeBinaryCandidates('linux', 'x64', true)[0]).toBe('@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude')
    expect(nativeBinaryCandidates('linux', 'x64', false)[1]).toBe(
      '@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude'
    )
  })
})

describe('resolveNativeBinary', () => {
  it('swaps app.asar for app.asar.unpacked and skips missing packages', () => {
    const path = resolveNativeBinary(
      (id) => `/Apps/W/resources/app.asar/node_modules/${id}`,
      (p) => p.includes('app.asar.unpacked')
    )
    expect(path).toContain('/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-')
    expect(
      resolveNativeBinary(
        () => {
          throw new Error('nope')
        },
        () => true
      )
    ).toBeNull()
  })
})

describe('runClaudeCli', () => {
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  const ctx = { cwd: '.', env, executable: process.execPath }

  it('returns stdout when the CLI exits with 0', async () => {
    expect(await runClaudeCli(['-e', 'process.stdout.write("ok")'], ctx)).toBe('ok')
  })

  it('a non-zero exit becomes CliExitError with stderr, stdout and code', async () => {
    const err = await runClaudeCli(['-e', 'console.error("failed"); process.stdout.write("{}"); process.exit(1)'], ctx)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CliExitError)
    expect(err).toMatchObject({ message: 'failed', stdout: '{}', code: 1 })
  })

  it('without output, the message carries the code', async () => {
    await expect(runClaudeCli(['-e', 'process.exit(3)'], ctx)).rejects.toThrow('código 3')
  })

  it('an aborted signal kills the process and rejects with the conversation closed message', async () => {
    const controller = new AbortController()
    const pending = runClaudeCli(['-e', 'setInterval(() => {}, 1000)'], { ...ctx, signal: controller.signal })
    setTimeout(() => controller.abort(), 150)
    await expect(pending).rejects.toThrow('encerrada')
  })

  it('an executable that does not start rejects with the spawn error, without the command line', async () => {
    const err = await runClaudeCli(['--json', '{"secret":1}'], { ...ctx, executable: '/does/not/exist/claude' }).catch(
      (e: unknown) => e as Error
    )
    expect(err).toBeInstanceOf(CliExitError)
    expect((err as Error).message).toContain('ENOENT')
    expect((err as Error).message).not.toContain('secret')
  })
})
