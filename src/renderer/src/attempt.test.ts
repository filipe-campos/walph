import { beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.fn()
vi.mock('./toasts', () => ({ notify: (...args: unknown[]) => notify(...args) }))

import { attempt } from './attempt'

beforeEach(() => notify.mockClear())

describe('attempt', () => {
  it('returns the value of fn without notifying', async () => {
    expect(await attempt(async () => 7)).toBe(7)
    expect(notify).not.toHaveBeenCalled()
  })

  it('accepts a synchronous fn', async () => {
    expect(await attempt(() => 'ok')).toBe('ok')
  })

  it('notifies the message without the Electron prefix and returns undefined', async () => {
    const result = await attempt(async () => {
      throw new Error("Error invoking remote method 'git:commit': Error: no changes")
    })
    expect(result).toBeUndefined()
    expect(notify).toHaveBeenCalledWith('no changes')
  })

  it('returns the fallback on failure', async () => {
    const result = await attempt(
      async () => {
        throw new Error('x')
      },
      { fallback: [] as string[] }
    )
    expect(result).toEqual([])
  })

  it('formats the notification', async () => {
    await attempt(
      async () => {
        throw new Error('boom')
      },
      { format: (m) => `Git: ${m}` }
    )
    expect(notify).toHaveBeenCalledWith('Git: boom')
  })

  it('quiet suppresses the notification but keeps the fallback', async () => {
    const result = await attempt(
      async () => {
        throw new Error('boom')
      },
      { quiet: true, fallback: null }
    )
    expect(result).toBeNull()
    expect(notify).not.toHaveBeenCalled()
  })

  it('quiet as a function is evaluated on failure and receives the error', async () => {
    let stale = false
    const run = (): Promise<undefined> =>
      attempt(
        async () => {
          stale = true
          throw new Error('boom')
        },
        { quiet: () => stale }
      )
    await run()
    expect(notify).not.toHaveBeenCalled()
    stale = false
    await attempt(
      async () => {
        throw new Error('boom')
      },
      { quiet: (err) => (err as Error).message === 'boom' }
    )
    expect(notify).not.toHaveBeenCalled()
  })

  it('onError runs before the notification', async () => {
    const order: string[] = []
    notify.mockImplementationOnce(() => order.push('notify'))
    await attempt(
      async () => {
        throw new Error('boom')
      },
      { onError: () => order.push('onError') }
    )
    expect(order).toEqual(['onError', 'notify'])
  })

  it('converts values that are not Error', async () => {
    await attempt(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'text'
    })
    expect(notify).toHaveBeenCalledWith('text')
  })
})
