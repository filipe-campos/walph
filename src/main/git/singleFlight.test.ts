import { describe, expect, it } from 'vitest'
import { deferred } from '../testing/deferred'
import { createSingleFlight } from './singleFlight'

describe('createSingleFlight', () => {
  it('a single call runs once', async () => {
    let runs = 0
    const call = createSingleFlight(async () => ++runs)
    expect(await call()).toBe(1)
    expect(await call()).toBe(2)
  })

  it('calls during the run share a single rerun', async () => {
    const gates = [deferred<void>(), deferred<void>()]
    let runs = 0
    const call = createSingleFlight(async () => {
      const n = runs++
      await gates[n].promise
      return n
    })
    const first = call()
    const b = call()
    const c = call()
    expect(b).toBe(c)
    expect(runs).toBe(1)
    gates[0].resolve()
    expect(await first).toBe(0)
    await Promise.resolve()
    await Promise.resolve()
    gates[1].resolve()
    expect(await b).toBe(1)
    expect(await c).toBe(1)
    expect(runs).toBe(2)
  })

  it('a failure of the current run does not prevent the rerun', async () => {
    const gate = deferred<number>()
    let runs = 0
    const call = createSingleFlight(() => (runs++ === 0 ? gate.promise : Promise.resolve(7)))
    const first = call()
    const second = call()
    gate.reject(new Error('x'))
    await expect(first).rejects.toThrow('x')
    expect(await second).toBe(7)
  })
})
