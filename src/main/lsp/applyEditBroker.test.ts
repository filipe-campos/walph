import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LspApplyEditRequest, LspWorkspaceEdit } from '@shared/types'
import { ApplyEditBroker } from './applyEditBroker'

const edit: LspWorkspaceEdit = { files: [] }

describe('ApplyEditBroker', () => {
  const requests: LspApplyEditRequest[] = []
  const cancelled: number[] = []
  let broker: ApplyEditBroker

  beforeEach(() => {
    vi.useFakeTimers()
    requests.length = 0
    cancelled.length = 0
    broker = new ApplyEditBroker({
      timeoutMs: 1000,
      emitRequest: (r) => requests.push(r),
      emitCancelled: (id) => cancelled.push(id)
    })
  })

  afterEach(() => vi.useRealTimers())

  it('emits the request with an increasing id and an optional label', () => {
    void broker.request(edit, 'Rename')
    void broker.request(edit)
    expect(requests).toEqual([
      { id: 1, label: 'Rename', edit },
      { id: 2, edit }
    ])
  })

  it('the renderer answer resolves the request and cancels the deadline', async () => {
    const result = broker.request(edit)
    broker.resolve(1, true)
    expect(await result).toEqual({ applied: true })
    vi.advanceTimersByTime(5000)
    expect(cancelled).toEqual([])
  })

  it('a refusal carries the reason; an unknown id is ignored', async () => {
    const result = broker.request(edit)
    broker.resolve(99, true)
    broker.resolve(1, false, 'dirty tab')
    expect(await result).toEqual({ applied: false, failureReason: 'dirty tab' })
  })

  it('no answer in time becomes applied=false and announces the cancellation', async () => {
    const result = broker.request(edit)
    vi.advanceTimersByTime(1000)
    expect(await result).toEqual({ applied: false, failureReason: 'Walph did not respond in time.' })
    expect(cancelled).toEqual([1])
    broker.resolve(1, true)
  })

  it('dropAll resolves everything as not applied, cancels and clears the deadlines', async () => {
    const a = broker.request(edit)
    const b = broker.request(edit)
    broker.dropAll('window closed')
    expect(await a).toEqual({ applied: false, failureReason: 'window closed' })
    expect(await b).toEqual({ applied: false, failureReason: 'window closed' })
    expect(cancelled).toEqual([1, 2])
    vi.advanceTimersByTime(5000)
    expect(cancelled).toEqual([1, 2])
  })
})
