import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { killLiveTree, killLiveTreeGracefully, killLiveTreesSync, sweepGroup, terminateLiveTree } from './tree'

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(cond: () => boolean, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 30))
  }
  return cond()
}

describe.skipIf(process.platform === 'win32')('gentle tree shutdown', () => {
  const leaderWith = (script: string): ReturnType<typeof spawn> =>
    spawn('sh', ['-c', script], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] })

  it('terminateLiveTree sends SIGTERM to the whole group', async () => {
    const leader = leaderWith('sleep 30 & echo $!; wait')
    const childPid = await new Promise<number>((resolve) =>
      leader.stdout!.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())))
    )
    terminateLiveTree(leader)
    expect(await until(() => !alive(childPid) && leader.signalCode === 'SIGTERM')).toBe(true)
  })

  it('whoever ignores SIGTERM gets SIGKILL after the grace period', async () => {
    const leader = leaderWith("trap '' TERM; echo ready; while :; do sleep 1; done")
    await new Promise<void>((resolve) => leader.stdout!.once('data', () => resolve()))
    killLiveTreeGracefully(leader, 300)
    await new Promise((r) => setTimeout(r, 100))
    expect(leader.exitCode === null && leader.signalCode === null).toBe(true)
    expect(await until(() => leader.signalCode === 'SIGKILL')).toBe(true)
  })

  const grandchildOf = async (leader: ReturnType<typeof spawn>): Promise<number> =>
    new Promise<number>((resolve) =>
      leader.stdout!.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())))
    )

  it('killLiveTree kills the leader and the group grandchildren with SIGKILL', async () => {
    const leader = leaderWith('sleep 30 & echo $!; wait')
    const childPid = await grandchildOf(leader)
    killLiveTree(leader)
    expect(await until(() => !alive(childPid) && leader.signalCode === 'SIGKILL')).toBe(true)
  })

  it('killLiveTree of a process that leads no group falls back to killing the child itself', async () => {
    const child = spawn('sleep', ['30'], { stdio: 'ignore' })
    killLiveTree(child)
    expect(await until(() => child.signalCode === 'SIGKILL')).toBe(true)
  })

  it('killLiveTree without pid (failed spawn) does not throw', () => {
    const child = spawn(`${process.execPath}-missing`, [], { stdio: 'ignore' })
    child.on('error', () => undefined)
    expect(() => killLiveTree(child)).not.toThrow()
    expect(() => terminateLiveTree(child)).not.toThrow()
  })

  it('killLiveTreesSync takes down the tree of each process', async () => {
    const a = leaderWith('sleep 30 & echo $!; wait')
    const b = leaderWith('sleep 30 & echo $!; wait')
    const [pa, pb] = await Promise.all([grandchildOf(a), grandchildOf(b)])
    killLiveTreesSync([a, b])
    expect(await until(() => !alive(pa) && !alive(pb))).toBe(true)
  })

  it('sweepGroup reaps the grandchild left after the leader exited', async () => {
    const leader = leaderWith('sleep 30 & echo $!')
    const childPid = await grandchildOf(leader)
    await new Promise((resolve) => leader.once('exit', resolve))
    expect(alive(childPid)).toBe(true)
    sweepGroup(leader.pid)
    expect(await until(() => !alive(childPid))).toBe(true)
  })

  it('sweepGroup without pid or with an empty group is harmless', () => {
    expect(() => sweepGroup(undefined)).not.toThrow()
    expect(() => sweepGroup(2 ** 22 + 12345)).not.toThrow()
  })
})
