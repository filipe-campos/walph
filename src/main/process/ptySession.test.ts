import type * as NodePty from 'node-pty'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  type KillablePty,
  type SessionMember,
  killPtysSyncAndSweep,
  killSurvivors,
  liveMembers,
  parseLinuxStat,
  parsePsTable,
  ptsNameOf,
  sessionMembers
} from './ptySession'

describe('parseLinuxStat', () => {
  it('reads session (field 6) and start (field 22)', () => {
    const stat = '4242 (bash) S 4000 4242 4242 34816 4242 4194560 1 0 0 0 0 0 0 0 20 0 1 0 987654 1 1 0'
    expect(parseLinuxStat(stat)).toEqual({ pid: 4242, session: 4242, start: '987654' })
  })

  it('comm with spaces and parentheses does not shift the fields', () => {
    const stat = '77 (a) b (c)) R 1 77 55 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 12345 1 1 0'
    expect(parseLinuxStat(stat)).toEqual({ pid: 77, session: 55, start: '12345' })
  })

  it('truncated or garbage line becomes null', () => {
    expect(parseLinuxStat('')).toBeNull()
    expect(parseLinuxStat('12 (x) S 1 2')).toBeNull()
    expect(parseLinuxStat('abc (x) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22')).toBeNull()
    expect(parseLinuxStat('no parens here')).toBeNull()
  })
})

describe('parsePsTable', () => {
  it('reads pid, tty and lstart, including a single-digit day', () => {
    const out = '  101 ttys003 Sun Nov  8 12:24:58 2026\n 2002 ?? Mon Dec 14 01:02:03 2026\n'
    expect(parsePsTable(out)).toEqual([
      { pid: 101, group: 'ttys003', start: 'Sun Nov 8 12:24:58 2026' },
      { pid: 2002, group: '??', start: 'Mon Dec 14 01:02:03 2026' }
    ])
  })

  it('drops unreadable lines and dates from another locale', () => {
    const out = [
      'garbage',
      '',
      '  abc ttys003 Sun Nov  8 12:24:58 2026',
      '  55 ttys003 not a date',
      '  0 ttys003 Sun Nov  8 12:24:58 2026',
      '  56 ttys003 dom  8 nov 12:28:51 2026'
    ].join('\n')
    expect(parsePsTable(out)).toEqual([])
  })
})

describe('sessionMembers', () => {
  const term = { pid: 100, ptsName: '/dev/ttys100', kill: vi.fn() }
  const group = process.platform === 'linux' ? '100' : 'ttys100'
  const alive = (pid: number): boolean => pid !== 103
  const table = [
    { pid: 100, group, start: 'a' },
    { pid: 101, group, start: 'b' },
    { pid: 102, group: 'other', start: 'c' },
    { pid: 103, group, start: 'd' }
  ]

  it('returns only the live ones of the same group, without the shell', () => {
    expect(sessionMembers(table, term, alive)).toEqual([{ pid: 101, start: 'b' }])
  })

  it('shell missing from the table (reused pid or tty) has no members', () => {
    expect(sessionMembers(table.slice(1), term, alive)).toEqual([])
  })

  it('shell in another group has no members', () => {
    const moved = table.map((r) => (r.pid === 100 ? { ...r, group: 'other' } : r))
    expect(sessionMembers(moved, term, alive)).toEqual([])
  })
})

describe('ptsNameOf', () => {
  it('only accepts a string under /dev/', () => {
    expect(ptsNameOf({ ptsName: '/dev/ttys003' })).toBe('ttys003')
    expect(ptsNameOf({ ptsName: 42 })).toBeNull()
    expect(ptsNameOf({ ptsName: '../etc' })).toBeNull()
    expect(ptsNameOf({})).toBeNull()
  })
})

describe('killSurvivors', () => {
  const members: SessionMember[] = [
    { pid: 10, start: 'a' },
    { pid: 11, start: 'b' },
    { pid: 12, start: 'c' }
  ]

  it('kills only those alive and with the same identity', () => {
    const kill = vi.fn()
    killSurvivors(members, {
      alive: (pid) => pid !== 12,
      starts: () =>
        new Map([
          [10, 'a'],
          [11, 'reused']
        ]),
      kill: kill as unknown as typeof process.kill
    })
    expect(kill.mock.calls).toEqual([[10, 'SIGKILL']])
  })

  it('neither reads identity nor kills when all have exited', () => {
    const starts = vi.fn()
    const kill = vi.fn()
    killSurvivors(members, { alive: () => false, starts, kill: kill as unknown as typeof process.kill })
    expect(starts).not.toHaveBeenCalled()
    expect(kill).not.toHaveBeenCalled()
  })

  it('ESRCH on kill is ignored', () => {
    const kill = vi.fn(() => {
      throw Object.assign(new Error('x'), { code: 'ESRCH' })
    })
    expect(() =>
      killSurvivors(members, {
        alive: () => true,
        starts: () => new Map(members.map((m) => [m.pid, m.start])),
        kill: kill as unknown as typeof process.kill
      })
    ).not.toThrow()
    expect(kill).toHaveBeenCalledTimes(3)
  })
})

describe('liveMembers', () => {
  it('filters by the live ones', () => {
    expect(
      liveMembers(
        [
          { pid: 1, start: 'x' },
          { pid: 2, start: 'y' }
        ],
        (pid) => pid === 2
      )
    ).toEqual([{ pid: 2, start: 'y' }])
  })
})

describe('synchronous wait', () => {
  it('without members (idle shell) does not wait', () => {
    const term: KillablePty = { pid: 2 ** 22 + 12345, kill: vi.fn() }
    const started = Date.now()
    killPtysSyncAndSweep([term], 5000)
    expect(term.kill).toHaveBeenCalledOnce()
    expect(Date.now() - started).toBeLessThan(1000)
  })
})

describe.skipIf(process.platform === 'win32')('node-pty integration', () => {
  let pty: typeof NodePty | null = null
  try {
    pty = createRequire(import.meta.url)('node-pty') as typeof NodePty
  } catch {
    pty = null
  }
  const alive = (pid: number): boolean => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  const until = async (cond: () => boolean, ms: number): Promise<boolean> => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (cond()) return true
      await new Promise((r) => setTimeout(r, 30))
    }
    return cond()
  }
  const waitFor = (term: NodePty.IPty, pattern: RegExp): Promise<RegExpExecArray> =>
    new Promise((resolve, reject) => {
      let out = ''
      const timer = setTimeout(() => {
        sub.dispose()
        reject(new Error(`no ${pattern}`))
      }, 5000)
      const sub = term.onData((d) => {
        out += d
        const m = pattern.exec(out)
        if (m) {
          clearTimeout(timer)
          sub.dispose()
          resolve(m)
        }
      })
    })
  const withPty = async (
    file: string,
    args: string[],
    body: (term: NodePty.IPty) => Promise<void>,
    env: NodeJS.ProcessEnv = process.env
  ): Promise<void> => {
    const term = pty!.spawn(file, args, { env: env })
    try {
      await body(term)
    } finally {
      try {
        term.kill()
      } catch {
        // already terminated
      }
    }
  }
  const jobScript = 'nohup sleep 60 >/dev/null 2>&1 & echo JOB:$!; wait'
  const withJob = async (body: (term: NodePty.IPty, job: number) => Promise<void>): Promise<void> =>
    withPty('/bin/sh', ['-c', jobScript], async (term) => {
      const job = Number((await waitFor(term, /JOB:(\d+)\r?\n/))[1])
      try {
        await body(term, job)
      } finally {
        if (alive(job)) process.kill(job, 'SIGKILL')
      }
    })

  it.skipIf(!pty)('job that ignores HUP dies on quit (killPtysSyncAndSweep)', async () => {
    await withJob(async (term, job) => {
      killPtysSyncAndSweep([term], 300)
      expect(await until(() => !alive(job), 2000)).toBe(true)
    })
  })

  it.skipIf(!pty)('works with ps in another locale', async () => {
    const saved = process.env.LC_ALL
    process.env.LC_ALL = 'pt_BR.UTF-8'
    try {
      await withJob(async (term, job) => {
        killPtysSyncAndSweep([term], 300)
        expect(await until(() => !alive(job), 2000)).toBe(true)
      })
    } finally {
      if (saved === undefined) delete process.env.LC_ALL
      else process.env.LC_ALL = saved
    }
  })

  const interactive = [
    ['/bin/bash', ['--norc', '--noprofile', '-i']],
    ['/usr/bin/bash', ['--norc', '--noprofile', '-i']],
    ['/bin/zsh', ['-f', '-i']]
  ] as const
  const shell = interactive.find(([file]) => existsSync(file))

  it.skipIf(!pty || !shell)('interactive shell forwards HUP to the jobs before any SIGKILL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'walph-hup-'))
    const mark = join(dir, 'mark')
    try {
      await withPty(shell![0], [...shell![1]], async (term) => {
        const ready = waitFor(term, /REA[D]Y/)
        term.write(`( trap 'echo ok > "${mark}"' HUP; sleep 60 & wait ) &\r`)
        term.write('echo REA""DY\r')
        await ready
        await new Promise((r) => setTimeout(r, 400))
        killPtysSyncAndSweep([term], 3000)
        expect(await until(() => existsSync(mark), 5000)).toBe(true)
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe.skipIf(process.platform === 'win32')('shutdown order', () => {
  const spiedTerm = (order: string[]): KillablePty =>
    Object.defineProperties(
      { kill: () => order.push('kill') },
      {
        pid: { get: () => (order.push('snapshot'), 2 ** 22 + 777) },
        ptsName: { get: () => (order.push('snapshot'), '/dev/ttys999') }
      }
    ) as unknown as KillablePty

  it('synchronous: the snapshot of all comes before the first kill', () => {
    const order: string[] = []
    killPtysSyncAndSweep([spiedTerm(order), spiedTerm(order)], 10)
    expect(order.indexOf('kill')).toBeGreaterThan(order.lastIndexOf('snapshot'))
  })
})
