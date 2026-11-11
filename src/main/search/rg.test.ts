import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeRgSpawnError, runRg } from './rg'

const posix = process.platform !== 'win32'

describe.skipIf(!posix)('runRg with a fake executable', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'walph-rg-'))
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  function fake(name: string, body: string): string {
    const file = join(dir, name)
    writeFileSync(file, `#!/bin/sh\n${body}\n`)
    chmodSync(file, 0o755)
    return file
  }

  const collect = (binary: string, stopAfter?: number) => {
    const chunks: string[] = []
    const run = runRg(['--files', '--', '.'], {
      cwd: dir,
      binary,
      onStdout: (chunk, stop) => {
        chunks.push(chunk)
        if (stopAfter !== undefined && chunks.join('').length >= stopAfter) stop()
      }
    })
    return { run, text: () => chunks.join('') }
  }

  it('prepends the base arguments and passes the caller ones along', async () => {
    const { run, text } = collect(fake('args', 'printf "%s\\n" "$@"'))
    expect((await run).outcome).toBe('ok')
    expect(text().split('\n').slice(0, 6)).toEqual(['--no-config', '--hidden', '--glob=!.git', '--files', '--', '.'])
  })

  it('code 1 (no results) is ok', async () => {
    const { run } = collect(fake('none', 'exit 1'))
    expect(await run).toMatchObject({ outcome: 'ok', code: 1 })
  })

  it('code 2 is an error and carries the capped start of stderr', async () => {
    const { run } = collect(
      fake('bad', 'echo "regex parse error" >&2; head -c 20000 /dev/zero | tr "\\0" x >&2; exit 2')
    )
    const result = await run
    expect(result.outcome).toBe('error')
    expect(result.stderr.startsWith('regex parse error\n')).toBe(true)
    expect(result.stderr.length).toBe(8192)
  })

  it('killed by a signal without a request is interrupted', async () => {
    const { run } = collect(fake('killed', 'kill -9 $$'))
    expect(await run).toMatchObject({ outcome: 'interrupted', code: null })
  })

  it('stop() ends rg and counts as ok', async () => {
    const { run } = collect(fake('endless', 'echo a; while true; do sleep 1; done'), 1)
    expect(await run).toMatchObject({ outcome: 'ok', code: null })
  })

  it('a missing executable becomes spawnError', async () => {
    const { run } = collect(join(dir, 'nao-existe'))
    const result = await run
    expect(result.outcome).toBe('spawnError')
    expect(result.spawnError).toMatchObject({ code: 'ENOENT' })
  })

  it('the owner cancels and the result becomes cancelled', async () => {
    const binary = fake('slow', 'while true; do sleep 1; done')
    const procs = new Set<{ kill(): void }>()
    const cancelled = new WeakSet<object>()
    const run = runRg(['--', '.'], {
      cwd: dir,
      binary,
      onStdout: () => undefined,
      owner: {
        track: (proc) => {
          procs.add(proc)
          return () => void procs.delete(proc)
        },
        wasCancelled: (proc) => cancelled.has(proc)
      }
    })
    await new Promise((r) => setTimeout(r, 200))
    for (const proc of procs) {
      cancelled.add(proc)
      proc.kill()
    }
    expect((await run).outcome).toBe('cancelled')
  })
})

describe('describeRgSpawnError', () => {
  const messages = { notFound: 'nf', noPermission: 'np', failed: (d: string) => `f:${d}` }
  const errno = (code: string, message = 'boom'): Error => Object.assign(new Error(message), { code })

  it('picks the message by the error code', () => {
    expect(describeRgSpawnError(errno('ENOENT'), messages)).toBe('nf')
    expect(describeRgSpawnError(errno('EACCES'), messages)).toBe('np')
    expect(describeRgSpawnError(errno('EMFILE', 'too many'), messages)).toBe('f:too many')
  })
})
