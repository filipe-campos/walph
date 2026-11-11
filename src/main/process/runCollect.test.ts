import { describe, expect, it } from 'vitest'
import { runCollect, type ProcessOwner, type RunCollectOptions } from './runCollect'
import type { GroupProcess } from './spawnGroup'

const node = process.execPath
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function dies(pid: number): Promise<boolean> {
  for (let i = 0; i < 100 && isAlive(pid); i++) await new Promise((r) => setTimeout(r, 50))
  return !isAlive(pid)
}

const run = (script: string, options: RunCollectOptions & { binary?: false } = {}) =>
  runCollect(node, ['-e', script], { env, ...options })

describe.each([false, true])('runCollect (group: %s)', (group) => {
  it('collects stdout/stderr and returns the exit code', async () => {
    expect(await run('console.log("a"); console.error("b"); process.exit(3)', { group })).toEqual({
      code: 3,
      stdout: 'a\n',
      stderr: 'b\n',
      timedOut: false,
      cancelled: false,
      spawnError: null,
      overflow: false
    })
  })

  it('writes `input` to stdin and closes it', async () => {
    const script =
      'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => process.stdout.write(s.toUpperCase()))'
    const result = await run(script, { group, input: 'abc\n' })
    expect(result).toMatchObject({ code: 0, stdout: 'ABC\n' })
  })

  it('missing executable becomes spawnError', async () => {
    const result = await runCollect('walph-does-not-exist', [], { env, group })
    expect(result.spawnError).toMatchObject({ code: 'ENOENT' })
    expect(result.code).toBeNull()
    expect(result.timedOut).toBe(false)
  })

  it('stdout above the cap kills the process and sets overflow without exceeding the cap', async () => {
    const result = await run('process.stdout.write("x".repeat(100000)); setInterval(() => {}, 1000)', {
      group,
      maxBuffer: 1000
    })
    expect(result.overflow).toBe(true)
    expect(result.stdout.length).toBe(1000)
    expect(result.code).not.toBe(0)
  })

  it('onOverflow truncate keeps the cap and lets the process finish on its own', async () => {
    const result = await run('process.stdout.write("x".repeat(5000)); process.stdout.write("y".repeat(5000))', {
      group,
      maxBuffer: 1500,
      onOverflow: 'truncate'
    })
    expect(result).toMatchObject({ overflow: true, code: 0 })
    expect(result.stdout).toBe('x'.repeat(1500))
  })

  it('stderr: tail keeps the end and head keeps the start, within the cap and without setting overflow', async () => {
    const script = 'console.error("a".repeat(300)); console.error("b".repeat(300))'
    const tail = await run(script, { group, maxStderr: 100 })
    expect(tail.stderr).toBe(`${'b'.repeat(99)}\n`)
    const head = await run(script, { group, maxStderr: 100, stderrKeep: 'head' })
    expect(head.stderr).toBe('a'.repeat(100))
    expect(tail.overflow || head.overflow).toBe(false)
    expect(head.code).toBe(0)
  })

  it('the caps do not split a UTF-8 character', async () => {
    const stdout = await run('process.stdout.write("a" + "€".repeat(10))', {
      group,
      maxBuffer: 5,
      onOverflow: 'truncate'
    })
    expect(stdout.stdout).toBe('a€')
    const head = await run('process.stderr.write("a" + "€".repeat(10))', { group, maxStderr: 5, stderrKeep: 'head' })
    expect(head.stderr).toBe('a€')
    const tail = await run('process.stderr.write("€".repeat(10) + "\\n")', { group, maxStderr: 5 })
    expect(tail.stderr).toBe('€\n')
  })

  it('binary returns stdout as an undecoded Buffer', async () => {
    const result = await runCollect(node, ['-e', 'process.stdout.write(Buffer.from([0xff, 0xfe, 0x41]))'], {
      env,
      group,
      binary: true
    })
    expect([...result.stdout]).toEqual([0xff, 0xfe, 0x41])
  })

  it('onStdout receives the text without accumulating and stop() kills the process', async () => {
    const chunks: string[] = []
    const result = await run('process.stdout.write("olá"); setInterval(() => process.stdout.write("."), 20)', {
      group,
      onStdout: (chunk, stop) => {
        chunks.push(chunk)
        if (chunks.join('').length > 5) stop()
      }
    })
    expect(chunks.join('').startsWith('olá')).toBe(true)
    expect(result.stdout).toBe('')
    expect(result.code).toBeNull()
    expect(result.timedOut).toBe(false)
  })

  it('exceeding the deadline kills the process and sets timedOut', async () => {
    const started = Date.now()
    const result = await run('setInterval(() => {}, 1000)', { group, timeout: 300 })
    expect(result).toMatchObject({ timedOut: true, code: null, cancelled: false })
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('already aborted signal never starts the process', async () => {
    const result = await run('process.exit(0)', { group, signal: AbortSignal.abort() })
    expect(result).toMatchObject({ cancelled: true, code: null, spawnError: null })
  })

  it('aborting the signal midway kills the process and sets cancelled', async () => {
    const controller = new AbortController()
    const pending = run('setInterval(() => {}, 1000)', { group, signal: controller.signal, timeout: 20_000 })
    setTimeout(() => controller.abort(), 150)
    expect(await pending).toMatchObject({ cancelled: true, timedOut: false, code: null })
  })
})

describe('runCollect with owner', () => {
  it('registers the process, removes it on exit and reports the owner cancellation', async () => {
    const tracked = new Set<GroupProcess>()
    const cancelledBy = new Set<GroupProcess>()
    const owner: ProcessOwner = {
      track: (proc) => {
        tracked.add(proc)
        return () => void tracked.delete(proc)
      },
      wasCancelled: (proc) => cancelledBy.has(proc)
    }
    const pending = run('setInterval(() => {}, 1000)', { group: true, owner, timeout: 20_000 })
    await new Promise((r) => setTimeout(r, 150))
    const [proc] = [...tracked]
    cancelledBy.add(proc)
    proc.kill()
    expect(await pending).toMatchObject({ cancelled: true, timedOut: false })
    expect(tracked.size).toBe(0)

    expect(await run('process.exit(0)', { owner })).toMatchObject({ cancelled: false, code: 0 })
  })
})

describe.skipIf(process.platform === 'win32')('runCollect in a group', () => {
  const parent = `
    const { spawn } = require('node:child_process')
    const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    console.log(g.pid)
    setInterval(() => {}, 1000)
  `

  it('exceeding the deadline kills the whole tree (grandchild included)', async () => {
    const result = await run(parent, { group: true, timeout: 600 })
    expect(result.timedOut).toBe(true)
    expect(await dies(Number(result.stdout.trim()))).toBe(true)
  })

  it('cancelling through the signal kills the whole tree', async () => {
    const controller = new AbortController()
    let grand = 0
    const result = await run(parent, {
      group: true,
      signal: controller.signal,
      onStdout: (chunk) => {
        grand = Number(chunk.trim())
        controller.abort()
      }
    })
    expect(result.cancelled).toBe(true)
    expect(await dies(grand)).toBe(true)
  })
})
